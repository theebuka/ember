"use client";

import { EmberPoint } from "@/components/common/ember-point";
import { Sparkle } from "@/components/common/icon";
import { MARKET_LABELS, RISK_PROFILES, type MarketKind, type RiskProfile } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * The three onboarding panels.
 *
 * **These are illustration, and that is deliberate — but they are not
 * decoration.** Every reference the brief names opens on a picture: Neo's
 * runners, Phantom's icon cluster, Family's characters. What none of them do
 * is draw something that *looks* like data, and that constraint is sharper
 * here than it is for a wallet, because this app's whole argument is that the
 * numbers on screen are real. A pretty fake equity curve on the welcome screen
 * would cost more credibility than any illustration could buy.
 *
 * So the vocabulary is the ember point — the app's one reused primitive,
 * already the brand mark and already the peak marker on the window band — at
 * sizes it never reaches inside the product. Rings, arcs and orbits made of
 * the same shape. Nothing here has an axis, a price or a percentage on it.
 *
 * Two of the three respond to the choice being made beside them, which is the
 * part that earns the space: the conviction arcs light up as the profile
 * changes, and a market dims the moment it is switched off. The panel is a
 * preview of the setting rather than a picture next to it.
 *
 * All motion is CSS and every animation is behind `motion-reduce`, which the
 * global block in `globals.css` also catches — belt and braces, because these
 * run on the first screen a person ever sees.
 */

export function StepArt({
  step,
  riskProfile,
  markets,
}: {
  step: number;
  riskProfile: RiskProfile;
  markets: Record<MarketKind, boolean>;
}) {
  return (
    <div className="relative isolate h-full w-full overflow-hidden">
      {/* One dark field behind all three, so stepping forward moves the
          *contents* rather than repainting the panel. A cross-fade between
          two full-bleed colours on a phone is a flash. */}
      <div className="absolute inset-0" style={{ background: "#0B0C0F" }} />
      <Grain />

      <Panel active={step === 0}>
        <SignalArt />
      </Panel>
      <Panel active={step === 1}>
        <ConvictionArt profile={riskProfile} />
      </Panel>
      <Panel active={step === 2}>
        <MarketsArt markets={markets} />
      </Panel>
    </div>
  );
}

/**
 * Only the active panel is in the layout, but all three stay mounted.
 *
 * Unmounting would restart the ring animation every time someone stepped
 * back, and re-running an entrance animation on content a person has already
 * seen reads as a stutter rather than as polish.
 */
function Panel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!active}
      className={cn(
        "absolute inset-0 grid place-items-center p-8",
        "transition-opacity duration-500 ease-out motion-reduce:transition-none",
        active ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {children}
    </div>
  );
}

/**
 * One design size, scaled — not three sets of geometry.
 *
 * Each composition is built at 288px and the *stage* is scaled to fit the
 * panel. The alternative is responsive sizes on the box, and it does not work
 * here: the orbit markers are positioned as a percentage of the stage while
 * the rings come from an SVG `viewBox`, and two coordinate systems only agree
 * at whichever width they were tuned at — 288px, as it happens, and nowhere
 * else. Scaling keeps them locked together at every breakpoint, and everything
 * inside is vector or a CSS circle, so there is nothing to go soft.
 */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid size-72 shrink-0 place-items-center scale-[0.78] sm:scale-100 lg:scale-[1.3]">
      {children}
    </div>
  );
}

/**
 * A faint vignette rather than an image.
 *
 * A flat near-black rectangle at 30dvh reads as a missing asset. This gives it
 * depth for about forty bytes and cannot fail to load.
 */
function Grain() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 8%, color-mix(in oklab, var(--brand) 16%, transparent) 0%, transparent 62%)",
      }}
    />
  );
}

/* ── Step 1 — the signal ──────────────────────────────────────────────────
   The point, and the moment around it. Concentric rings expanding outward on
   a long loop: something being found, then announced. It is the same shape as
   the peak marker on the window band, which is where a user will meet it
   again about ninety seconds from now. */

function SignalArt() {
  return (
    <Stage>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="ember-pulse absolute rounded-full border border-[color-mix(in_oklab,var(--brand)_45%,transparent)]"
          style={{ animationDelay: `${i * 1.6}s` }}
        />
      ))}
      <EmberPoint size={128} />
    </Stage>
  );
}

/* ── Step 2 — conviction ──────────────────────────────────────────────────
   Three arcs, one per profile, lit up to and including the one selected. It
   is a volume knob, not a gauge: no number on it, because the number lives in
   `RiskProfileSetting` beside it and is measured rather than drawn. */

const PROFILE_ORDER: RiskProfile[] = ["conservative", "balanced", "aggressive"];

function ConvictionArt({ profile }: { profile: RiskProfile }) {
  const level = PROFILE_ORDER.indexOf(profile);

  return (
    <Stage>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full" aria-hidden>
        {PROFILE_ORDER.map((_, i) => {
          const r = 52 + i * 26;
          const lit = i <= level;
          return (
            <circle
              key={i}
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke="var(--brand)"
              strokeWidth={lit ? 2 : 1}
              strokeOpacity={lit ? 0.85 - i * 0.12 : 0.14}
              strokeLinecap="round"
              // Three-quarters of a turn, opening downward, so the stack reads
              // as a dial rather than as a target.
              strokeDasharray={`${2 * Math.PI * r * 0.72} ${2 * Math.PI * r}`}
              transform={`rotate(135 100 100)`}
              className="transition-all duration-500 ease-out motion-reduce:transition-none"
            />
          );
        })}
      </svg>
      <div className="relative grid place-items-center gap-2">
        <EmberPoint size={64} />
        <span className="text-caption font-medium text-[#8E919B]">
          {RISK_PROFILES[profile].label}
        </span>
      </div>
    </Stage>
  );
}

/* ── Step 3 — what you follow ─────────────────────────────────────────────
   Three points in orbit, one per market, dimming the moment one is switched
   off. The label is the only text in any of the panels, and it is there
   because an unlabelled dot going grey tells you nothing about which market
   you just turned off. */

/**
 * Angles only — the radius is shared, and it is a *percentage of the stage*
 * rather than a pixel count, because the ring behind these markers comes from
 * an SVG `viewBox` and scales with the box. A pixel radius agrees with a
 * viewBox radius at exactly one width; 30.5% is `r="61"` of a 200-unit box, at
 * every width.
 */
const ORBIT_RADIUS = 30.5;

const ORBIT: Record<MarketKind, number> = {
  equity: -90,
  crypto: 30,
  fx: 150,
};

function MarketsArt({ markets }: { markets: Record<MarketKind, boolean> }) {
  return (
    <Stage>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full" aria-hidden>
        <circle
          cx="100"
          cy="100"
          r="61"
          fill="none"
          stroke="var(--brand)"
          strokeOpacity="0.2"
          strokeWidth="1"
        />
      </svg>

      <EmberPoint size={56} />

      {(Object.keys(ORBIT) as MarketKind[]).map((market) => {
        const rad = (ORBIT[market] * Math.PI) / 180;
        const on = markets[market];
        return (
          <div
            key={market}
            className={cn(
              "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5",
              "transition-opacity duration-300 ease-out motion-reduce:transition-none",
              on ? "opacity-100" : "opacity-25",
            )}
            style={{
              left: `${50 + Math.cos(rad) * ORBIT_RADIUS}%`,
              top: `${50 + Math.sin(rad) * ORBIT_RADIUS}%`,
            }}
          >
            <EmberPoint size={on ? 34 : 26} glow={on} />
            <span className="text-micro font-medium whitespace-nowrap text-[#8E919B]">
              {MARKET_LABELS[market]}
            </span>
          </div>
        );
      })}
    </Stage>
  );
}

/* ── Pro ───────────────────────────────────────────────────────────────────
   The checkout's return page uses onboarding's frame, because it is the only
   other moment in the app rather than a screen: the same dark field and the
   same rings around the point. Once Pro is confirmed the point gains its mark;
   while it is being confirmed the rings are the waiting. */

export function ProArt({ confirmed }: { confirmed: boolean }) {
  return (
    <div aria-hidden className="relative isolate h-full w-full overflow-hidden">
      <div className="absolute inset-0" style={{ background: "#0B0C0F" }} />
      <Grain />
      {/* Flex, not grid: a grid start-aligns a stage taller than a phone's
          band, which put the point on top of the mark below it. Lifted a
          little on a phone to leave the mark its own room. */}
      <div className="absolute inset-0 flex -translate-y-5 items-center justify-center lg:translate-y-0">
        <Stage>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="ember-pulse absolute rounded-full border border-[color-mix(in_oklab,var(--brand)_45%,transparent)]"
              style={{ animationDelay: `${i * 1.6}s` }}
            />
          ))}
          <EmberPoint size={128} />
        </Stage>
      </div>
      {/* On the panel, not the stage: the stage is scaled, and on a phone's
          short band a mark inside it fell off the bottom. */}
      <span
        className={cn(
          "absolute bottom-5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-caption font-semibold text-white lg:top-[calc(50%+7.5rem)] lg:bottom-auto",
          "transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none",
          confirmed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        <Sparkle weight="fill" className="size-3.5" />
        ember Pro
      </span>
    </div>
  );
}
