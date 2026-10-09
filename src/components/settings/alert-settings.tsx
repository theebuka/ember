"use client";

import { useState } from "react";
import { BellSlash, Send } from "@/components/common/icon";
import { toast } from "sonner";
import { DeliverySettings } from "@/components/settings/delivery-settings";
import { SettingGroup, SettingRow } from "@/components/settings/setting-row";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  useNotificationPermission,
  useRequestNotificationPermission,
} from "@/hooks/use-notification-permission";
import { isIos, isStandalone, showAlert } from "@/lib/notifications/permission";
import { PREFERENCE_DEFAULTS, usePreferences } from "@/store/use-preferences";

/**
 * Alerts, and an honest account of which of them exist.
 *
 * **The permission prompt is attached to the switch.** Asking on load is the
 * behaviour that trains people to hit Block, and a browser that has been told
 * Block will never ask again — there is no recovery from JavaScript. So the
 * request happens on the gesture that means "yes I want this", and only then.
 *
 * **A refusal is a state, not a failure.** `denied` gets the sentence that
 * actually helps (it's in the browser's own site settings now, not ours), and
 * on iOS — where `Notification` simply doesn't exist outside an installed
 * PWA — it gets a different sentence again, because "you blocked this" would
 * be false and would send someone hunting through a menu that has no answer
 * in it.
 *
 * **One switch still doesn't work, and it says so rather than pretending.** Price
 * levels need a UI for setting a level, which nothing in the app has. A
 * live-looking switch on it would be worse than the honest chip it wears.
 *
 * The daily digest used to sit beside it wearing the same chip, because it needed
 * "a server that can reach you". Phase 26 built that server, so it moved into
 * `DeliverySettings` below as a real control — which is the point of the chip
 * pattern: it names the thing that has to exist first, and then it goes away.
 */
export function AlertSettings() {
  const hydrated = useHydrated();
  const actualPermission = useNotificationPermission();
  const request = useRequestNotificationPermission();
  const [testing, setTesting] = useState(false);

  const stored = usePreferences((s) => s.notifications);
  const setNotification = usePreferences((s) => s.setNotification);
  const notifications = hydrated ? stored : PREFERENCE_DEFAULTS.notifications;

  /**
   * Neutral until hydration.
   *
   * The permission is unknowable server-side, and the copy branches on it —
   * so without this the server renders "this browser doesn't support
   * notifications" and the client replaces it, which React reports as a
   * hydration mismatch on a sentence the user may briefly have read.
   */
  const permission = hydrated ? actualPermission : "default";

  const blocked = permission === "denied";
  const unsupported = permission === "unsupported";
  const unavailable = blocked || unsupported;

  /** Alerts only actually happen when the switch *and* the browser agree. */
  const live = notifications.windowOpen && permission === "granted";
  const riskLive = notifications.riskAlerts && permission === "granted";

  /**
   * One toggle handler for both switches, because the permission dance is
   * identical and duplicating it is how the two drift apart.
   *
   * Turning either on is the gesture that means "yes I want this", so it is
   * the only place ember asks the browser. A refusal leaves the switch off —
   * a stored `true` behind a browser that says no is a setting that lies about
   * the state of the world every time it is read.
   */
  const toggle =
    (key: "windowOpen" | "riskAlerts", confirmation: string) =>
    async (next: boolean) => {
      if (!next) {
        setNotification(key, false);
        return;
      }

      if (actualPermission === "granted") {
        setNotification(key, true);
        return;
      }

      const result = await request();
      if (result === "granted") {
        setNotification(key, true);
        toast("Alerts on", { description: confirmation });
        return;
      }

      setNotification(key, false);
    };

  const sendTest = async () => {
    setTesting(true);
    try {
      const granted =
        actualPermission === "granted" ? "granted" : await request();

      if (granted !== "granted") {
        toast("Not sent", {
          description:
            granted === "denied"
              ? "Your browser is blocking notifications for this site."
              : "Allow notifications to send a test.",
        });
        return;
      }

      // Deliberately the system path even with the tab in front. A real alert
      // would show an in-app toast here; this control exists to prove the
      // notification itself works, which a toast wouldn't demonstrate.
      const shown = await showAlert({
        title: "NVDA · Accumulate",
        body: "Window open until Thu 16:20 · 1.2% of portfolio · stop $172.40",
        tag: "ember-test",
        url: "/signals",
      });

      toast(shown ? "Test alert sent" : "Couldn't show it", {
        description: shown
          ? undefined
          : "Your browser allowed notifications but didn't show this one.",
      });
    } finally {
      setTesting(false);
    }
  };

  /**
   * A switch the browser has refused is not a setting, so neither row shows
   * one: a ghosted switch read as "off", with the reason in paragraph text two
   * rows away (decision 047's objection). One status line says what is wrong
   * and how to fix it, and each row's control says `Blocked`.
   */
  const status = unavailable ? (
    <StatusLabel>{blocked ? "Blocked" : "Unavailable"}</StatusLabel>
  ) : null;

  return (
    <>
      <div className="space-y-4">
        {unavailable && (
          <div className="flex items-start gap-2.5 rounded-xl bg-surface-2 p-3.5">
            <BellSlash className="mt-0.5 size-4 shrink-0 text-graphite" />
            <div className="min-w-0">
              <p className="text-caption font-medium text-ink">
                {blocked
                  ? "Notifications are blocked in this browser"
                  : "Notifications aren't available here"}
              </p>
              <p className="mt-0.5 text-caption text-stone">
                {blocked
                  ? "Allow them from the padlock beside the address bar, or in this site's settings, then come back."
                  : iosHint()}
              </p>
            </div>
          </div>
        )}

        <SettingGroup id="alerts" title="Alerts" description="While ember is open.">
          <SettingRow
            label="A trade window opens"
            description="When a recommended trade is ready to act on, with its size and stop."
            layout="inline"
            control={
              status ?? (
                <Switch
                  checked={live}
                  disabled={unavailable}
                  onCheckedChange={toggle(
                    "windowOpen",
                    "ember will tell you when a window opens, while it's open.",
                  )}
                  aria-label="Alert me when a window opens"
                />
              )
            }
          />

          {/* Its own switch, not a sub-setting of the one above. Wanting to be
            told the moment a position turns against you, and never wanting to
            be pitched a new idea, is a coherent thing to ask for — and it is
            probably the more common of the two. */}
          <SettingRow
            label="A position turns against you"
            description="When something you hold hits its stop, loses ember's support or grows too large, with how much to sell."
            layout="inline"
            control={
              status ?? (
                <Switch
                  checked={riskLive}
                  disabled={unavailable}
                  onCheckedChange={toggle(
                    "riskAlerts",
                    "ember will tell you when something you hold turns against you.",
                  )}
                  aria-label="Alert me when a position turns against me"
                />
              )
            }
          />

          {(live || riskLive) && (
            <SettingRow
              label="Send a test alert"
              description="Check that notifications show on this device."
              control={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendTest}
                  disabled={testing}
                >
                  <Send />
                  {testing ? "Sending" : "Send"}
                </Button>
              }
            />
          )}
        </SettingGroup>
      </div>

      {/* Delivery. Its own group because it answers a different question from
          everything above: not what ember decides to tell you, but whether it
          can reach you with the app closed. Renders nothing without an account
          and a VAPID key, so a deployment with neither looks exactly as it did. */}
      <DeliverySettings />
    </>
  );
}

/** Where a control would be, when the browser has taken the choice away. */
function StatusLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-surface-2 px-2 py-1 text-micro font-medium text-graphite">
      {children}
    </span>
  );
}

function iosHint(): string {
  if (typeof window === "undefined")
    return "Notifications aren't available here.";
  if (isIos() && !isStandalone()) {
    return "iOS only allows notifications for apps on the home screen. Share → Add to Home Screen, then open ember from there.";
  }
  return "This browser doesn't support notifications, so there's nothing for ember to send.";
}
