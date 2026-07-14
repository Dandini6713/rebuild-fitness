// Roadmap 26 (accessibility): a PURE check that the semantic colour token PAIRS meet WCAG
// 2.1 contrast in BOTH light and dark themes (docs/09 §9.2/§9.8, WCAG 1.4.3 text and 1.4.11
// non-text). Static gates cannot see the rendered screen, but they CAN prove the tokens the
// screens are built from are sound — so a failing token here is caught before it ships,
// rather than only on a device pass.
//
// Thresholds: 4.5:1 for normal body text, 3:1 for large text and meaningful non-text
// (the accent highlight, the selected-chip fill). Plain container borders are supplementary
// (a field is also identified by its fill, label and placeholder, a card by its raised
// surface), so per WCAG 1.4.11 they are not asserted here — see the note at the foot.

import { describe, expect, it } from '@jest/globals';

import { darkColours, lightColours } from '@/theme/tokens';

// Relative luminance and contrast ratio per WCAG 2.1 (sRGB).
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

type Pair = {
  fg: keyof typeof lightColours;
  bg: keyof typeof lightColours;
  min: number;
  why: string;
};

// The pairs the design system actually renders: body/secondary/tertiary text on each
// surface, the on-accent text and the accent used as text on surfaces, the four status
// tones (readiness amber/clay/blue plus success), and the accent highlight on its soft
// background (the featured chart bar / selected chip).
const PAIRS: Pair[] = [
  { fg: 'textPrimary', bg: 'background', min: 4.5, why: 'body text on screen' },
  { fg: 'textPrimary', bg: 'surface', min: 4.5, why: 'body text on card' },
  {
    fg: 'textPrimary',
    bg: 'surfaceMuted',
    min: 4.5,
    why: 'body text on muted',
  },
  {
    fg: 'textSecondary',
    bg: 'surface',
    min: 4.5,
    why: 'secondary text on card',
  },
  {
    fg: 'textSecondary',
    bg: 'background',
    min: 4.5,
    why: 'secondary on screen',
  },
  {
    fg: 'textSecondary',
    bg: 'surfaceMuted',
    min: 4.5,
    why: 'secondary on muted',
  },
  {
    fg: 'textTertiary',
    bg: 'surface',
    min: 4.5,
    why: 'caption/placeholder on card',
  },
  { fg: 'textTertiary', bg: 'background', min: 4.5, why: 'caption on screen' },
  {
    fg: 'textTertiary',
    bg: 'surfaceMuted',
    min: 4.5,
    why: 'placeholder on input fill',
  },
  { fg: 'onAccent', bg: 'accent', min: 4.5, why: 'primary button label' },
  {
    fg: 'accent',
    bg: 'surface',
    min: 4.5,
    why: 'secondary button / link on card',
  },
  { fg: 'accent', bg: 'background', min: 4.5, why: 'accent text on screen' },
  { fg: 'accent', bg: 'surfaceMuted', min: 4.5, why: 'accent text on muted' },
  {
    fg: 'successText',
    bg: 'successBackground',
    min: 4.5,
    why: 'success badge',
  },
  {
    fg: 'cautionText',
    bg: 'cautionBackground',
    min: 4.5,
    why: 'caution/amber badge',
  },
  {
    fg: 'dangerText',
    bg: 'dangerBackground',
    min: 4.5,
    why: 'safety/clay badge',
  },
  { fg: 'infoText', bg: 'infoBackground', min: 4.5, why: 'info/blue badge' },
  {
    fg: 'accent',
    bg: 'accentSoft',
    min: 3.0,
    why: 'accent highlight (non-text)',
  },
];

const THEMES = [
  { name: 'light', colours: lightColours },
  { name: 'dark', colours: darkColours },
] as const;

describe('semantic token contrast (WCAG 2.1)', () => {
  for (const { name, colours } of THEMES) {
    describe(`${name} theme`, () => {
      for (const pair of PAIRS) {
        it(`${pair.fg} on ${pair.bg} (${pair.why}) meets ${pair.min}:1`, () => {
          const ratio = contrastRatio(colours[pair.fg], colours[pair.bg]);
          // Round to 2dp for a stable, readable failure message.
          const rounded = Math.round(ratio * 100) / 100;
          expect(rounded).toBeGreaterThanOrEqual(pair.min);
        });
      }
    });
  }

  it('the contrast function matches known reference values', () => {
    // Black on white is 21:1; identical colours are 1:1 (sanity anchors).
    expect(Math.round(contrastRatio('#000000', '#ffffff'))).toBe(21);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });
});

// Note on borders: `border`/`borderSubtle` on `surface` are below 3:1 by design — they are
// SUPPLEMENTARY dividers, not the sole means of identifying a control (inputs carry a fill
// and label; cards a raised surface; chips a filled selected state). WCAG 1.4.11 exempts
// such purely decorative boundaries, so they are deliberately not asserted above. If a
// control is ever made border-only, add a `borderStrong` token meeting 3:1 and test it here.
