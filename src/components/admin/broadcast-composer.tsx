"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { Megaphone, Send, Trash } from "@/components/common/icon";
import { Section } from "@/components/common/section";
import { NoticeRow } from "@/components/notifications/notice-row";
import { recordAdminAction } from "@/components/admin/record";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  BROADCAST_LIMITS,
  BROADCAST_LINKS,
  EMPTY_DRAFT,
  PLACEMENT_HINTS,
  PLACEMENT_LABELS,
  draftProblem,
  type BroadcastDraft,
} from "@/lib/admin";
import type { Broadcast } from "@/lib/notifications/inbox";
import { cn } from "@/lib/utils";

/**
 * Radix refuses an empty-string `SelectItem` value, so "no link" needs a
 * sentinel. It is mapped back to `""` on the way into the draft, so nothing
 * below this component ever sees it.
 */
const NO_LINK = "none";

/**
 * Write a message that reaches everybody.
 *
 * **The preview is the same `NoticeRow` the notification centre renders**, which
 * is the whole reason that component moved out of `notifications-screen.tsx`. An
 * admin about to broadcast should be looking at the message as every reader will
 * see it — the same wrap, the same icon, the same "→" on the action label. A
 * preview assembled from lookalike markup is right until one of the two changes,
 * and the change that breaks it will not announce itself.
 *
 * There is no draft state and no scheduling control. `published_at` defaults to
 * `now()`, and a broadcast is a short piece of writing somebody does in one
 * sitting; a drafts table would be a second thing to build and maintain for a
 * screen with, today, no users. Withdrawing is one press and takes effect
 * immediately, which is the affordance that actually matters.
 */
export function BroadcastComposer({
  user,
  onChanged,
}: {
  user: User;
  /** Refreshes what every *other* screen reads, so a publish lands everywhere. */
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState<BroadcastDraft>(EMPTY_DRAFT);
  const [sending, setSending] = useState(false);

  /**
   * The live list is read straight from Postgres, not through `/api/notices`.
   *
   * Two reasons, and the second one is a bug that already happened. An admin has
   * a second select policy, so this sees rows whose `published_at` is in the
   * future — the drafts the public route correctly hides. And the public read is
   * memoised for thirty seconds on the server, which would mean publishing
   * something and watching it not appear: the exact symptom that made the
   * phase-28 failure so hard to read.
   */
  const live = useQuery({
    queryKey: ["admin", "notices"],
    gcTime: 0,
    staleTime: 0,
    queryFn: async (): Promise<Broadcast[]> => {
      const supabase = supabaseBrowser();
      if (!supabase) return [];
      const { data, error } = await supabase
        .from("notices")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: row.id as string,
        title: row.title as string,
        body: row.body as string,
        href: (row.href as string | null) ?? undefined,
        action: (row.action as string | null) ?? undefined,
        publishedAt: row.published_at as string,
        pinned: (row.pinned as boolean | null | undefined) ?? false,
      }));
    },
  });

  const problem = draftProblem(draft);
  const set = <K extends keyof BroadcastDraft>(key: K, value: BroadcastDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function publish() {
    const supabase = supabaseBrowser();
    if (!supabase || problem) return;

    setSending(true);
    const { data, error } = await supabase
      .from("notices")
      .insert({
        title: draft.title.trim(),
        body: draft.body.trim(),
        href: draft.href.trim() || null,
        action: draft.action.trim() || null,
        placement: draft.placement,
      })
      .select("id")
      .single();
    setSending(false);

    if (error) {
      // The message is the database's, verbatim. This is the one screen in the
      // app where the reader can act on a Postgres error, and rewriting it as
      // "Something went wrong" would remove the only useful thing about it.
      toast.error("Not published.", { description: error.message });
      return;
    }

    await recordAdminAction(supabase, user.id, "notice.publish", data.id as string, {
      title: draft.title.trim(),
      placement: draft.placement,
    });

    toast.success(
      draft.placement === "bar"
        ? "Published, with a bar on every screen."
        : draft.placement === "card"
          ? "Published, and pinned to Home."
          : "Published.",
    );
    setDraft(EMPTY_DRAFT);
    void live.refetch();
    onChanged();
  }

  async function withdraw(notice: Broadcast) {
    const supabase = supabaseBrowser();
    if (!supabase) return;

    const { error } = await supabase.from("notices").delete().eq("id", notice.id);
    if (error) {
      toast.error("Not withdrawn.", { description: error.message });
      return;
    }

    await recordAdminAction(supabase, user.id, "notice.withdraw", notice.id, {
      title: notice.title,
    });
    // No undo. Everywhere else in ember an undo beats a dialog, and here it
    // would be a lie about what happened: the notice has already been read by
    // whoever had the app open, and putting the row back does not unsend it.
    toast("Withdrawn.", {
      description: "It's hidden from now on, but it can't be unsent.",
    });
    void live.refetch();
    onChanged();
  }

  /**
   * Move a published notice between placements.
   *
   * Only ever *down* — to `inbox` — because promoting an old broadcast to a bar
   * from a row in a list is too easy to do by accident, and there is no undo on
   * something every reader sees immediately. Promoting means composing.
   */
  async function demote(notice: Broadcast) {
    const supabase = supabaseBrowser();
    if (!supabase) return;

    const { error } = await supabase
      .from("notices")
      .update({ placement: "inbox" })
      .eq("id", notice.id);
    if (error) {
      toast.error("Not changed.", { description: error.message });
      return;
    }

    await recordAdminAction(supabase, user.id, "notice.unpin", notice.id, {
      title: notice.title,
    });
    toast("Back to the inbox only.");
    void live.refetch();
    onChanged();
  }

  /** Everything in the table. The compiled release notes are not in it. */
  const stored = live.data ?? [];

  return (
    <>
      <Section
        title="Broadcast"
        hint="everyone sees this"
      >
        <div className="space-y-4">
          <Field
            id="broadcast-title"
            label="Title"
            count={`${draft.title.length}/${BROADCAST_LIMITS.title}`}
          >
            <Input
              id="broadcast-title"
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="The track record was re-measured"
            />
          </Field>

          <Field
            id="broadcast-body"
            label="Body"
            count={`${draft.body.length}/${BROADCAST_LIMITS.body}`}
          >
            <Textarea
              id="broadcast-body"
              value={draft.body}
              onChange={(e) => set("body", e.target.value)}
              rows={4}
              placeholder="What changed, and why it matters."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="broadcast-href" label="Link" hint="a screen in ember">
              {/* A list, not a text box. The first broadcast ever published
                  pointed at a path that did not exist, and every reader who
                  followed it got a 404 — see `BROADCAST_LINKS`. */}
              <Select
                value={draft.href === "" ? NO_LINK : draft.href}
                onValueChange={(v) => {
                  const href = v === NO_LINK ? "" : v;
                  setDraft((d) => ({
                    ...d,
                    href,
                    // An action label with nowhere to go is a validation error a
                    // moment later; clearing it here means the form never sits in
                    // a state the person did not choose.
                    action: href === "" ? "" : d.action,
                  }));
                }}
              >
                <SelectTrigger id="broadcast-href" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LINK}>No link</SelectItem>
                  {BROADCAST_LINKS.map((link) => (
                    <SelectItem key={link.href} value={link.href}>
                      {link.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="broadcast-action" label="Action label" hint="defaults to View">
              <Input
                id="broadcast-action"
                value={draft.action}
                onChange={(e) => set("action", e.target.value)}
                disabled={draft.href === ""}
                placeholder="See the record"
              />
            </Field>
          </div>

          <div>
            <Label>Where it appears</Label>
            {/* Three exclusive choices, not a switch, because there are three
                states and a boolean can only hold two. Radios rather than a
                segmented control: each option needs a sentence explaining what
                it costs the reader, and a segmented control has nowhere to put
                one. */}
            <div className="mt-2 space-y-2">
              {(["inbox", "card", "bar"] as const).map((value) => {
                const on = draft.placement === value;
                return (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                      on
                        ? "border-brand/40 bg-brand/5"
                        : "border-line hover:bg-surface-2",
                    )}
                  >
                    <input
                      type="radio"
                      name="placement"
                      value={value}
                      checked={on}
                      onChange={() => set("placement", value)}
                      className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-caption font-medium text-ink">
                        {PLACEMENT_LABELS[value]}
                      </span>
                      <span className="mt-0.5 block text-micro text-stone">
                        {PLACEMENT_HINTS[value]}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* The preview is the product, not a nicety — see the file header. */}
          <div>
            <p className="eyebrow text-stone">As they will see it</p>
            <div className="mt-1.5 border-y border-line">
              <NoticeRow
                notice={{
                  id: "preview",
                  kind: "broadcast",
                  tone: "neutral",
                  title: draft.title.trim() || "Untitled",
                  body: draft.body.trim() || "Nothing written yet.",
                  // Never rendered — `now={null}` below suppresses the
                  // timestamp — and a literal rather than `Date.now()` because
                  // reading the clock during render is impure, which React's
                  // own lint rule is right to refuse.
                  at: 0,
                  href: draft.href.trim() || undefined,
                  action: draft.action.trim() || undefined,
                }}
                // No relative time in the preview: "now" is the only thing it
                // could ever say, and a timestamp that cannot be wrong is a
                // timestamp that teaches the reader nothing.
                now={null}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={publish} disabled={problem !== null || sending}>
              <Send />
              {sending ? "Publishing…" : "Publish"}
            </Button>
            {problem && <p className="text-caption text-stone">{problem}</p>}
          </div>
        </div>
      </Section>

      <Section
        title="Live"
        hint={
          stored.length > 0
            ? `${stored.length} published from the dashboard`
            : "nothing published yet"
        }
      >
        {stored.length === 0 ? (
          <p className="text-caption text-stone">
            Nothing published yet. The release notes in the inbox ship with the
            build and cannot be withdrawn here.
          </p>
        ) : (
          <div className="divide-y divide-line border-y border-line">
            {stored.map((notice) => (
              <div key={notice.id} className="flex items-start gap-3 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-body font-medium text-ink">{notice.title}</p>
                    {notice.placement && notice.placement !== "inbox" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-micro font-medium text-brand-text">
                        <Megaphone className="size-3" />
                        {notice.placement === "bar" ? "Bar" : "Card"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-caption text-stone">
                    {notice.body}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {notice.placement && notice.placement !== "inbox" && (
                    <Button variant="ghost" size="sm" onClick={() => demote(notice)}>
                      Unpin
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-stone"
                    onClick={() => withdraw(notice)}
                    aria-label={`Withdraw ${notice.title}`}
                  >
                    <Trash />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function Field({
  id,
  label,
  hint,
  count,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {hint && <span className="ml-1.5 font-normal text-stone">{hint}</span>}
        </Label>
        {count && (
          <span className={cn("text-micro tabular-nums text-stone")}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}
