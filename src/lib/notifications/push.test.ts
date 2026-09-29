import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The one thing worth testing here is a promise that never settles.
 *
 * `subscribeToPush` used to `await navigator.serviceWorker.ready` without first
 * checking that anything was registered — and `ready` does not reject when there
 * is nothing to become ready, it simply never resolves. The caller's `finally`
 * never ran, its busy flag stayed true, and the settings switch was left
 * permanently disabled behind a not-allowed cursor with no error anywhere.
 *
 * So these tests stub `ready` as a promise that never settles. If the guard is
 * ever removed the test does not fail on an assertion, it **hangs** — which is
 * exactly the defect, reproduced. The timeout is short so that reads as a
 * failure rather than as a slow suite.
 */

const NEVER = new Promise<never>(() => {});

function stubBrowser({
  secure = true,
  registration = null as unknown,
}: { secure?: boolean; registration?: unknown } = {}) {
  vi.stubGlobal("window", { isSecureContext: secure, PushManager: class {} });
  vi.stubGlobal("isSecureContext", secure);
  vi.stubGlobal("navigator", {
    serviceWorker: {
      ready: NEVER,
      getRegistration: () => Promise.resolve(registration),
    },
  });
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: () => Promise.resolve("granted"),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("push availability", () => {
  it("reports no-worker rather than hanging on `ready`", async () => {
    stubBrowser({ registration: null });
    vi.doMock("@/lib/supabase/config", () => ({
      PUSH_CONFIGURED: true,
      VAPID_PUBLIC_KEY: "x",
    }));

    const { subscribeToPush, pushState } = await import("@/lib/notifications/push");

    await expect(subscribeToPush()).resolves.toBe("no-worker");
    await expect(pushState()).resolves.toBe("no-worker");
  }, 2_000);

  it("reports an insecure origin as its own state, not as unavailable", async () => {
    // The case a phone hits on http://192.168.x.x — fixable, and a reader told
    // "unavailable" has no reason to think so.
    stubBrowser({ secure: false });
    vi.doMock("@/lib/supabase/config", () => ({
      PUSH_CONFIGURED: true,
      VAPID_PUBLIC_KEY: "x",
    }));

    const { subscribeToPush } = await import("@/lib/notifications/push");
    await expect(subscribeToPush()).resolves.toBe("insecure");
  }, 2_000);

  it("treats every non-subscribable state as one the switch must not act on", async () => {
    vi.doMock("@/lib/supabase/config", () => ({
      PUSH_CONFIGURED: true,
      VAPID_PUBLIC_KEY: "x",
    }));
    const { isPushBlocked } = await import("@/lib/notifications/push");

    for (const state of ["unavailable", "insecure", "no-worker", "blocked"] as const) {
      expect(isPushBlocked(state)).toBe(true);
    }
    expect(isPushBlocked("off")).toBe(false);
    expect(isPushBlocked("on")).toBe(false);
  });

  it("rolls the browser subscription back when the row cannot be saved", async () => {
    // The defect: a failed write returned "off" and left the browser
    // subscribed, and `pushState()` reads the browser — so the next visit
    // showed the switch on for a device the server had never recorded.
    const unsubscribe = vi.fn(() => Promise.resolve(true));
    const subscription = {
      endpoint: "https://push.example/abc",
      toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } }),
      unsubscribe,
    };
    const registration = {
      pushManager: {
        getSubscription: () => Promise.resolve(null),
        subscribe: () => Promise.resolve(subscription),
      },
    };
    stubBrowser({ registration });
    // `ready` resolves here: a worker is registered in this case.
    (navigator as unknown as { serviceWorker: { ready: unknown } }).serviceWorker.ready =
      Promise.resolve(registration);

    vi.doMock("@/lib/supabase/config", () => ({ PUSH_CONFIGURED: true, VAPID_PUBLIC_KEY: "AAAA" }));
    vi.doMock("@/lib/supabase/client", () => ({
      supabaseBrowser: () => ({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
        from: () => ({ upsert: () => Promise.resolve({ error: { message: "refused" } }) }),
      }),
    }));

    const { subscribeToPush, PushError } = await import("@/lib/notifications/push");
    await expect(subscribeToPush()).rejects.toBeInstanceOf(PushError);
    expect(unsubscribe).toHaveBeenCalledOnce();
  }, 2_000);
});
