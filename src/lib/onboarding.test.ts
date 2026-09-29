import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ONBOARDED_COOKIE,
  clearOnboardedCookie,
  hasOnboardedCookie,
  safeNext,
  writeOnboardedCookie,
} from "./onboarding";

/**
 * A cookie jar with a switch on it.
 *
 * `writable: false` is the browser that broke onboarding: `document.cookie =`
 * is specified to fail silently under restricted storage, so the app believed
 * it had written the gate cookie, redirected into `proxy.ts`, and got bounced
 * back — forever, because `localStorage` had persisted and kept re-triggering
 * the redirect. Nothing throws, which is exactly why it has to be read back.
 */
function stubCookieJar({ writable }: { writable: boolean }) {
  let jar = "";
  vi.stubGlobal("document", {
    get cookie() {
      return jar;
    },
    set cookie(value: string) {
      if (!writable) return;
      const [pair] = value.split(";");
      const [name] = pair.split("=");
      const kept = jar
        .split(";")
        .map((c) => c.trim())
        .filter((c) => c.length > 0 && !c.startsWith(`${name}=`));
      // `max-age=0` is a deletion, not a write.
      if (!/max-age=0(?:;|$)/.test(value)) kept.push(pair.trim());
      jar = kept.join("; ");
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the gate cookie", () => {
  it("reports success when the write sticks", () => {
    stubCookieJar({ writable: true });
    expect(writeOnboardedCookie()).toBe(true);
    expect(hasOnboardedCookie()).toBe(true);
  });

  it("reports failure when the browser silently refuses it", () => {
    stubCookieJar({ writable: false });
    expect(writeOnboardedCookie()).toBe(false);
    expect(hasOnboardedCookie()).toBe(false);
  });

  it("goes back to false once cleared", () => {
    stubCookieJar({ writable: true });
    writeOnboardedCookie();
    clearOnboardedCookie();
    expect(hasOnboardedCookie()).toBe(false);
  });

  it("is not fooled by another cookie whose name ends the same way", () => {
    stubCookieJar({ writable: true });
    document.cookie = `not_${ONBOARDED_COOKIE}=1`;
    expect(hasOnboardedCookie()).toBe(false);
  });

  it("is false on the server, where there is no document at all", () => {
    vi.stubGlobal("document", undefined);
    expect(hasOnboardedCookie()).toBe(false);
    expect(writeOnboardedCookie()).toBe(false);
  });
});

describe("safeNext", () => {
  it("keeps a same-origin path, query and all", () => {
    expect(safeNext("/asset/NVDA?range=1M")).toBe("/asset/NVDA?range=1M");
  });

  it("refuses a protocol-relative URL", () => {
    // Browsers read `//evil.example` as another host. A redirect parameter
    // that accepts one is an open redirect.
    expect(safeNext("//evil.example/phish")).toBeNull();
  });

  it("refuses an absolute URL", () => {
    expect(safeNext("https://evil.example")).toBeNull();
  });

  it("refuses a bare path with no leading slash", () => {
    expect(safeNext("evil.example")).toBeNull();
  });

  it("refuses onboarding itself, so finishing can't loop", () => {
    expect(safeNext("/onboarding")).toBeNull();
    expect(safeNext("/onboarding?next=%2Fonboarding")).toBeNull();
  });

  it("treats absent and empty as no destination", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext("")).toBeNull();
  });
});
