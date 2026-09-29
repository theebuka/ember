"use client";

import { useState } from "react";
import { BellRing, Send } from "@/components/common/icon";
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
import { cn } from "@/lib/utils";

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
              : "ember needs permission before it can show a notification.",
        });
        return;
      }

      // Deliberately the system path even with the tab in front. A real alert
      // would show an in-app toast here; this control exists to prove the
      // notification itself works, which a toast wouldn't demonstrate.
      const shown = await showAlert({
        title: "NVDA · Accumulate",
        body: "Window open until Thu 16:20 · 1.2% of book · stop $172.40",
        tag: "ember-test",
        url: "/signals",
      });

      toast(shown ? "Test alert sent" : "Couldn't show it", {
        description: shown
          ? "A real one carries the symbol, the action, the size and the stop."
          : "Your browser accepted the permission but refused the notification.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <SettingGroup>
        <SettingRow
          label="Window opening"
          description={
            unsupported
              ? iosHint()
              : blocked
                ? "Your browser is blocking notifications for this site. Only you can undo that — it's in the padlock menu beside the address bar, or in site settings."
                : "A notification the moment a recommended window starts, carrying the symbol, the action, the size and the stop."
          }
          layout="inline"
          control={
            <Switch
              checked={live}
              disabled={unavailable}
              onCheckedChange={toggle(
                "windowOpen",
                "ember will tell you when a window opens, while it's open.",
              )}
              aria-label="Alert me when a window opens"
            />
          }
        />

        {/* Its own switch, not a sub-setting of the one above. Wanting to be
            told the moment a position turns against you, and never wanting to
            be pitched a new idea, is a coherent thing to ask for — and it is
            probably the more common of the two. */}
        <SettingRow
          label="Something you hold turns"
          description={
            unsupported || blocked
              ? "Same permission as above — ember can't send either kind until your browser allows it."
              : "A stop breached from your entry, a thesis that has stopped holding, a position that has grown past your cap. Each one carries what happened and how much to take off."
          }
          layout="inline"
          control={
            <Switch
              checked={riskLive}
              disabled={unavailable}
              onCheckedChange={toggle(
                "riskAlerts",
                "ember will tell you when something you hold turns against you.",
              )}
              aria-label="Alert me when a position turns against me"
            />
          }
        />

        {(live || riskLive) && (
          <SettingRow
            label="Send a test alert"
            description="Fires a real notification now, with the shape a real one has. The fastest way to confirm your browser and your operating system will actually show them."
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

        <SettingRow
          label="Price levels"
          description="Levels you set yourself, separate from anything ember recommends."
          layout="inline"
          control={<NotYet />}
        />
      </SettingGroup>

      {/* Delivery. Its own group because it answers a different question from
          everything above: not what ember decides to tell you, but whether it
          can reach you with the app closed. Renders nothing without an account
          and a VAPID key, so a deployment with neither looks exactly as it did. */}
      <DeliverySettings />

      {permission === "default" && !unavailable && (
        <p className="mt-3.5 flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-caption text-stone">
          <BellRing className="mt-0.5 size-4 shrink-0 text-stone" />
          <span>
            Turning this on asks your browser for permission. ember asks once —
            browsers don&apos;t offer a second prompt, so if you decline it has to be
            undone in site settings.
          </span>
        </p>
      )}
    </>
  );
}

/**
 * The control for a feature that doesn't exist yet.
 *
 * A disabled switch would read as "off", which is a claim about a setting. A
 * chip reads as "not a setting yet", which is the truth.
 */
function NotYet() {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-surface-2 px-2 py-1",
        "text-micro font-medium text-stone",
      )}
      title="Needs a server that can reach you with ember closed"
    >
      Not yet
    </span>
  );
}

function iosHint(): string {
  if (typeof window === "undefined") return "Notifications aren't available here.";
  if (isIos() && !isStandalone()) {
    return "iOS only allows notifications for apps on the home screen. Share → Add to Home Screen, then open ember from there.";
  }
  return "This browser doesn't support notifications, so there's nothing for ember to send.";
}
