"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  notificationState,
  requestPermission,
  type PermissionState,
} from "@/lib/notifications/permission";

/**
 * `Notification.permission` as something React can render.
 *
 * It is a plain mutable global with no change event in most browsers, so it's
 * modelled as an external store and re-read whenever we have reason to think
 * it moved: after we ask, and whenever the tab regains focus — which is how a
 * user who went to browser settings to un-block us gets a live UI when they
 * come back, instead of copy telling them they're still blocked.
 *
 * `navigator.permissions` does emit a change event where it exists, so it's
 * subscribed to when available and the focus listener is the fallback.
 */

const listeners = new Set<() => void>();
let snapshot: PermissionState = "unsupported";
let started = false;

function publish() {
  const next = notificationState();
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);

  if (!started) {
    started = true;
    snapshot = notificationState();
    window.addEventListener("focus", publish);

    navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then((status) => {
        status.addEventListener("change", publish);
      })
      // Firefox has historically rejected this query. The focus listener is
      // the fallback and covers the case that matters.
      .catch(() => {});
  }

  return () => listeners.delete(onChange);
}

const getSnapshot = () => snapshot;
/** The server has no permissions to report, and neither does hydration. */
const getServerSnapshot = (): PermissionState => "unsupported";

export function useNotificationPermission(): PermissionState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Ask, and make sure every subscriber sees the answer.
 *
 * Must be called from a user gesture — the browser ignores it otherwise, and
 * a browser that has been told "block" will never prompt again.
 */
export function useRequestNotificationPermission(): () => Promise<PermissionState> {
  return useCallback(async () => {
    const result = await requestPermission();
    publish();
    return result;
  }, []);
}
