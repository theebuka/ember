"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { CheckCircle } from "@/components/common/icon";
import { SectionHeader } from "@/components/common/section-header";
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
import { useHydrated } from "@/hooks/use-hydrated";
import { useSession } from "@/hooks/use-session";
import { countries, detectTimezone } from "@/lib/profile";
import { useProfile } from "@/store/use-profile";

/**
 * Who you are.
 *
 * **Everything is optional and nothing gates anything.** ember works with an
 * empty profile — the greeting has a name-free form and it is not a lesser one
 * (`lib/greeting.ts`). So there is no required field, no completeness meter and
 * no nagging: a progress ring on a profile is a way of telling someone their
 * account is deficient in order to extract data the product does not need.
 *
 * **Saved on blur, not behind a Save button.** Every other control in settings
 * commits immediately — the switches, the segmented controls, the theme — and a
 * form that alone requires confirmation makes the user wonder which of the
 * other controls they also failed to save. Blur rather than keystroke because
 * a half-typed name is not a name, and the sync would push every character.
 */
export function ProfileSettings() {
  const hydrated = useHydrated();
  const { user, available } = useSession();

  const profile = useProfile();
  const setProfile = useProfile((s) => s.set);

  const countryOptions = useMemo(() => countries(), []);

  /**
   * The timezone is detected, never asked.
   *
   * It is knowable from the browser, and a question you can answer for someone
   * is a question you shouldn't ask. Set once, only when empty, so a user who
   * has deliberately chosen a different zone keeps it when they travel.
   */
  useEffect(() => {
    if (!hydrated || profile.timezone) return;
    const detected = detectTimezone();
    if (detected) setProfile({ timezone: detected });
  }, [hydrated, profile.timezone, setProfile]);


  return (
    <div className="space-y-8">
      <section>
        <SectionHeader
          title="Your name"
          // Not the name itself: the fields directly beneath already say it.
          hint="optional"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="profile-first"
            label="First name"
            value={profile.firstName}
            onCommit={(firstName) => setProfile({ firstName })}
            autoComplete="given-name"
          />
          <Field
            id="profile-last"
            label="Last name"
            value={profile.lastName}
            onCommit={(lastName) => setProfile({ lastName })}
            autoComplete="family-name"
          />
          <Field
            id="profile-preferred"
            label="Preferred name"
            hint="What the greeting calls you."
            value={profile.preferredName}
            onCommit={(preferredName) => setProfile({ preferredName })}
            autoComplete="nickname"
            className="sm:col-span-2"
          />
        </div>
      </section>

      <section>
        <SectionHeader title="Where you are" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="profile-country">Country</Label>
            <Select
              value={profile.country ?? ""}
              onValueChange={(country) => setProfile({ country })}
            >
              <SelectTrigger id="profile-country" className="mt-2 w-full">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {countryOptions.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-micro text-stone">
              Used to suggest your base currency.
            </p>
          </div>

          <div>
            <Label htmlFor="profile-timezone">Time zone</Label>
            <Input
              id="profile-timezone"
              className="mt-2"
              value={hydrated ? (profile.timezone ?? "") : ""}
              placeholder="Detecting…"
              onChange={(event) => setProfile({ timezone: event.target.value })}
            />
            <p className="mt-2 text-micro text-stone">
              Trade windows are shown in this time zone.
            </p>
          </div>
        </div>
      </section>

      {/* Only when signed in. Signed out this rendered "Not signed in" beside a
          Sign in button — a second copy of the CTA the account block at the top
          of this very tab already offers, 1,800px above it. Two identical calls
          to action on one screen is one of them being ignored. */}
      {available && user && (
        <section>
          <SectionHeader title="Email" />

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-line py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-stone">
              <CheckCircle className="size-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="num text-body font-medium break-all text-ink">
                {user.email}
              </p>
            </div>

            {/* `gap-x-4` above rather than nothing: the button used to butt
                straight against the address on desktop, with the flex row's
                only spacing coming from `justify-between` at widths where the
                two happened not to meet. */}
            <Button variant="outline" size="default" asChild className="shrink-0">
              <Link href="/auth?next=%2Fsettings%3Ftab%3Daccount">
                Change email
              </Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * A text field that commits when you leave it.
 *
 * **Uncontrolled, and keyed on the stored value.** Typing goes nowhere near
 * the persisted store — a controlled input here would write on every
 * keystroke, which the sync would then debounce and push, so a name would
 * reach the server one letter at a time. The store is written on blur.
 *
 * The key is what keeps it honest when the value changes underneath: a sync
 * pulling a newer profile from another device remounts the input with the new
 * value, and no effect is needed to notice. `hydrated` is in the key for the
 * same reason it gates the value everywhere else — the stored name is in
 * `localStorage`, which the server cannot read, so the first render must match
 * the empty one the server produced and then remount once (ADR 0017).
 */
function Field({
  id,
  label,
  hint,
  value,
  onCommit,
  autoComplete,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string | null;
  onCommit: (value: string) => void;
  autoComplete?: string;
  className?: string;
}) {
  const hydrated = useHydrated();

  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        key={`${hydrated}:${value ?? ""}`}
        id={id}
        className="mt-2"
        autoComplete={autoComplete}
        defaultValue={hydrated ? (value ?? "") : ""}
        onBlur={(event) => onCommit(event.target.value)}
      />
      {hint && <p className="mt-2 text-micro text-stone">{hint}</p>}
    </div>
  );
}
