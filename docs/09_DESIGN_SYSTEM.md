# 9. Design System and Content Style

> **Version 2 — dark-premium direction.** This supersedes the original calm-light
> direction. Rebuild moves to a dark-first, premium, instrument-panel aesthetic in the
> spirit of recovery-and-readiness apps (Whoop, Oura), while keeping the calm, adult,
> non-aggressive character that has always defined it. Light mode is retained and follows
> the same rules with an inverted surface ramp; dark is the primary, designed-first
> experience.

## 9.1 Design direction

Rebuild should feel calm, capable, premium and adult. It is a personal recovery and
readiness instrument, not a bodybuilding forum, an extreme-transformation advert, or a
clinical hospital portal. The redesign adds polish and depth; it does not add noise or
hype.

Keywords:

- Premium
- Calm
- Clear
- Reassuring
- Focused
- Honest

Avoid:

- Aggressive slogans or hype
- Neon "gym" styling and loud gradients
- Before-and-after pressure
- Red used for a normal missed goal
- Dense dashboards full of jargon
- Decoration that competes with the data

The feel we are after: near-black surfaces, one confident emerald accent used sparingly,
generous space, and data presented as the hero. Quiet by default; the numbers and the
readiness state carry the interest.

## 9.2 Colour system

Colour meaning is never hard-coded in domain logic. Every surface, text and control reads
a **semantic token**; the palette below is the single place those tokens resolve. Changing
a token here propagates to every screen. This is the existing `theme/tokens.ts`
architecture (`colourPrimitives` → `lightColours` / `darkColours`); the redesign
re-points those tokens, it does not restructure them.

### 9.2.1 Dark palette (primary)

Surfaces step from near-black up through elevation. These are the hero experience.

- `background` — near-black, faintly warm/green-tinted (about `#0b0d0c`). The page canvas.
- `surface` — the base card (about `#141814`), one step above background.
- `surfaceRaised` — a raised/elevated card or sheet (about `#1b211b`).
- `surfaceMuted` — recessed wells, track backgrounds (about `#101410`).
- `border` — hairline card border, low-contrast (about `#212821`).
- `borderSubtle` — the quietest divider (about `#1a201a`).

Text on dark:

- `textPrimary` — near-white (about `#f2f5f2`), for headline values and titles.
- `textSecondary` — muted sage-grey (about `#c9d1c9`), for supporting text.
- `textTertiary` — quiet grey (about `#8b938b`), for labels and captions.
- `textDisabled` — dim (about `#6f776f`).

### 9.2.2 Emerald accent

One accent, used with conviction on the few things that matter (the primary action, the
readiness ring, positive progress) and nowhere else.

- `accent` — emerald (about `#34d399`) in dark. Vivid but not neon. On real OLED it reads
  brighter than on a monitor; if evening use feels harsh, step it toward `#2bbb87`. Tune
  once on-device.
- `accentPressed` — a slightly deeper emerald for the pressed state.
- `accentSoft` — a very dark emerald wash (about `#12241c`) for tinted backgrounds behind
  accent content.
- `onAccent` — very dark green-black (about `#04150e`) for text/icons sitting ON the
  emerald fill. Never pure black, never white.

**Restraint rule:** at most one accent-filled element per card, and ideally one clearly
dominant accent moment per screen (usually the readiness card or the primary CTA).
Everything else is surface + text tokens. If two things both shout, neither does.

### 9.2.3 Semantic status colours (readiness system)

These carry meaning and MUST stay visually distinct from the emerald accent, so a "ready"
green is never confused with a caution or a stop. Readiness status is ALWAYS conveyed by
**icon + text + colour**, never colour alone (accessibility and clarity).

- Success / ready → emerald family (aligns with accent; this is the one place they meet,
  and it is intentional: "ready" and "go" are the same signal).
- Caution / amber → warm amber (`cautionText` about `#f0cb68` on a dark amber wash). Used
  for amber-readiness substitution, never for a normal missed goal.
- Safety stop / red → clay-red (`dangerText`), reserved for the Achilles/red-readiness
  stop and genuinely destructive actions. Never for routine shortfalls.
- Informational → calm blue (`infoText`), for neutral notes.

Because "ready" shares the emerald, take extra care that **amber caution** is
unmistakably warm-yellow, not green-adjacent, and that the **red stop** is clearly red.
Test all three against `background` and `surface` in both themes.

### 9.2.4 Light palette (secondary, follows later)

Light mode keeps the same semantic token names with an inverted ramp: warm off-white
canvas, white cards, the emerald darkened for contrast on light (about `#0f7a56` for
`accent`, so it clears WCAG AA on white). Light mode is not the hero and is built after the
dark experience is complete, but the token architecture keeps it valid throughout.

### 9.2.5 Contrast (non-negotiable)

Every text/surface and text/accent pair meets WCAG AA (4.5:1 normal, 3:1 large/non-text)
in BOTH themes. The existing `tests/unit/tokenContrast.test.ts` pattern (real computed
ratios) is extended to cover every new pair. A token that fails is changed, not shipped.

## 9.3 Elevation and depth

Depth is what separates "designed" from "wireframe". It is created with surface steps and
restrained shadow, never heavy drop-shadows or glows.

- Three surface levels only: `background` (canvas) → `surface` (card) → `surfaceRaised`
  (sheet/modal/pressed-forward card). At most two floating layers at once; a third means a
  full sheet, not a stack of popovers.
- Cards: `surface` fill, a `0.5px` `border` hairline, `16px` corner radius, generous
  internal padding (about `18px`).
- Shadow on dark is subtle and cool; its job is to lift a sheet off the canvas, not to
  decorate. Prefer a surface step over a shadow where possible.
- No gradients as decoration. A single very subtle accent-tint behind the hero readiness
  card is the only permitted "glow", and it must stay barely perceptible.

## 9.4 Typography

A real hierarchy is the other half of "premium". Same platform system font, but used with
deliberate weight and size contrast.

- Platform system font (San Francisco on iOS). Dynamic Type supported throughout.
- **Display numbers** (weight, calories, the hero values): large (about 28–32px), weight
  600, tight letter-spacing (about −0.02em), `textPrimary`. Tabular numerals for anything
  that updates or aligns (timers, logged values, trends).
- **Titles**: about 20–26px, weight 600, `textPrimary`.
- **Body / supporting**: about 15px, weight 400, `textSecondary`.
- **Labels / captions**: about 12–13px, weight 500, `textTertiary`, occasionally with
  slight letter-spacing for the small uppercase section labels.
- No more than four routine text styles per screen. The jump between the big number and its
  small label is what creates hierarchy — make it decisive, not gradual.
- No long paragraphs during a workout.

## 9.5 Core components (states mandatory)

Every component defines **normal, pressed, disabled, loading and error** states, in dark
and light.

- Session card — the day's session; can be the hero when a session is planned.
- Readiness status panel — the signature component; ring + status word + one line of
  guidance + primary action. This is usually the screen's single accent moment.
- Metric card — a label, one large value, one small delta line. Used in 2-up grids.
- Metric progress card — value plus a thin progress track (emerald fill).
- Exercise card, set-entry row — high-contrast, big touch targets, tabular numbers.
- Timer control — large, glanceable, legible at arm's length mid-exercise; state by text +
  shape, never colour alone.
- Weekly summary card — adherence bars (emerald done, muted remaining) + counts.
- Confirmation sheet — for accept-before-apply (calorie change, deletion); calm, explicit,
  the destructive/irreversible framing clear without being alarmist.
- Safety message panel — amber or red status, icon + text, calm professional wording.
- Empty-state panel — see 9.5.1.

### 9.5.1 Empty, loading and error states (the "unfinished" fix)

Empty states are the single biggest reason the old build read as bland. They are redesigned
as **designed moments**, not bare paragraphs:

- A small, calm line-icon (Tabler-style, `textTertiary`) sits above the message. Never a
  blank card with one grey sentence.
- Headline names the space as an invitation ("Set your first target", "Plan your week"),
  one supporting line explains, and where an action exists, an emerald verb button offers
  it ("Create plan").
- Loading: a quiet skeleton in the card's own shape (surface blocks pulsing subtly), not a
  spinner floating in space.
- Error: one plain sentence of what happened and what to do; calm, no exception strings, no
  alarm colour unless it is genuinely a safety stop.

The tone stays honest (see 9.7): an empty state is an invitation, never an apology or a nag.

## 9.6 Spacing and touch

- Minimum touch target 44×44 pt (audited in the accessibility pass).
- Generous vertical spacing between workout controls; primary actions reachable one-handed
  (lower third of the screen).
- Card radius 16px; control radius 12px; pill/ring shapes only where deliberate.
- Avoid tiny chart controls; period toggles and chart-tile taps are comfortably large.

## 9.7 Chart rules

- Default seven-day, four-week and twelve-week views.
- Weight trend prominent; raw weight light. Bars zero-baselined; trend lines may use a
  clearly-labelled non-zero baseline, never a silent truncated axis (enforced in
  `chartScale`).
- Emerald for the meaningful series/highlight; muted surface tone for context/remainder.
  One highlighted point/bar per chart, with its value in a small callout.
- Label axes and units. Explain missing data honestly (insufficient-data state, not a
  fabricated line).
- No celebratory or negative animation tied to weight alone.

## 9.8 Content style (unchanged — this survives the reskin)

British English, normal conversational wording, calm and non-judgemental. The visual
change does NOT change the voice.

Preferred:

- "Today's session is Strength A. It should take about 40 minutes."
- "Your Achilles check suggests using the bike today instead of running."
- "There is not enough food logging to recommend a calorie change."
- "You completed four of five planned sessions."

Avoid: "Smash your goals.", "No excuses.", "Bad food.", "Cheat day.", "Torch those
calories.", "Your tendon is safe." Sentence case everywhere. No shouty punctuation on
system copy.

## 9.9 Accessibility (unchanged bar, applied to the new palette)

- Screen-reader labels for every value and control; logical focus order.
- Text alternatives for exercise media.
- Haptic cues also have visual AND audio alternatives.
- Timers operable without relying on colour.
- Forms show errors next to the field and in an accessible summary.
- No drag-and-drop-only interaction; a button reschedule always exists.
- The dark palette must clear the SAME contrast bar as light — verified with real computed
  ratios, both themes, including the emerald accent and all three readiness statuses.

## 9.10 How this ships (build note)

This is a re-pointing of the existing semantic tokens plus new component treatments, not a
structural rebuild. Because every screen already reads semantic tokens (enforced in the
accessibility pass), the palette change propagates centrally. The work is: (1) re-point
`colourPrimitives` and the dark/light token maps to this palette; (2) add elevation and the
richer type weights; (3) redesign the shared components (card, readiness panel, metric
card, empty/loading/error) to this spec; (4) extend the contrast test to every new pair;
(5) walk every screen for the new empty/loading/error treatment. Dark first; light follows
using the same tokens. It is a focused UI roadmap, done with the same verify-against-code
discipline as the rest of the build.
