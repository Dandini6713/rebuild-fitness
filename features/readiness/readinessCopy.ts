// Shared presentation copy for a readiness classification (roadmap 13/14). The label
// and tone maps live here so the result screen (ReadinessResultView) and the
// session-start block card (ReadinessBlockCard) render the same wording and the same
// icon+text status — never colour alone (docs/03 S-011, docs/09 §9.2). The sentence
// copy itself comes from presentClassification in the pure classifier, so there is one
// source for the recommendation, allowed action and next action.

import type { StatusTone } from '@/components/common';
import type { ReadinessClassification } from '@/domain/training/readinessClassification';

export const NON_DIAGNOSIS_NOTE =
  'This result is based only on your own answers. The app does not diagnose or assess the tendon or any injury.';

// Status is conveyed by icon AND text (StatusBadge), never colour alone.
export const CLASSIFICATION_TONE: Record<ReadinessClassification, StatusTone> =
  {
    amber: 'caution',
    green: 'success',
    red: 'danger',
  };

export const CLASSIFICATION_LABEL: Record<ReadinessClassification, string> = {
  amber: 'Amber — take a gentler option today',
  green: 'Green — you can go ahead',
  red: 'Red — do not start this session',
};

// The heading shown alongside the badge, so a result is conveyed by icon, heading and
// text (docs/03 S-011). Kept short and plain; no shame or appearance language (docs/07).
export const CLASSIFICATION_HEADING: Record<ReadinessClassification, string> = {
  amber: 'A gentler option today',
  green: 'Good to go',
  red: 'Do not start this session',
};
