import { describe, expect, it } from "vitest";
import { pinnedFrom } from "@/lib/notifications/pinned";
import type { Broadcast } from "@/lib/notifications/inbox";

const notice = (id: string, placement: Broadcast["placement"], publishedAt: string): Broadcast => ({
  id,
  title: id,
  body: "",
  publishedAt,
  placement,
});

describe("which broadcast is promoted", () => {
  const bar = notice("bar", "bar", "2026-10-01T00:00:00Z");
  const card = notice("card", "card", "2026-10-02T00:00:00Z");

  it("holds the card back while a bar is live", () => {
    expect(pinnedFrom([bar, card], [], "card")).toEqual([]);
    expect(pinnedFrom([bar, card], [], "bar")).toEqual([bar]);
  });

  it("shows the card once the bar is dismissed", () => {
    expect(pinnedFrom([bar, card], ["bar"], "card")).toEqual([card]);
  });
});
