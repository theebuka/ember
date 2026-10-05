import { describe, expect, it } from "vitest";
import { linkProblem } from "@/components/auth/auth-screen";

describe("linkProblem", () => {
  it("says nothing on an ordinary visit", () => {
    expect(linkProblem(null, "")).toBeNull();
  });

  it("reads Supabase's fragment, which the server never sees", () => {
    const hash =
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=";
    expect(linkProblem("missing-code", hash)).toMatch(/expired or was already used/);
  });

  it("falls back to the callback's own reason", () => {
    expect(linkProblem("link", "")).toMatch(/expired or was already used/);
    expect(linkProblem("missing-code", "")).toMatch(/didn't sign you in/);
  });
});
