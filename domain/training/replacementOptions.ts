// The choices offered by the "Replace" action in the weekly planner (S-020),
// derived purely from the session being replaced and the templates already in the
// week. Pure and tested, with no React or I/O, mirroring the other domain/training
// helpers. The scheduling rules (schedulingRules.ts) still judge whichever option
// the user picks; this module only decides what is worth offering.

import type { PlanSessionType } from './planSchedule';

export type ReplacementOption = {
  key: string;
  label: string;
  toType: PlanSessionType;
  toTemplateId: string | null;
  toTemplateName: string | null;
};

// Lighter, recovery-first alternatives common to any session, offered before the
// strength templates. A session is never offered its own current type.
const LIGHTER_OPTIONS: {
  type: Exclude<PlanSessionType, 'strength'>;
  label: string;
}[] = [
  { label: 'Change to a rest day', type: 'rest' },
  { label: 'Change to Achilles strength and mobility', type: 'achilles' },
  { label: 'Change to easy cardio', type: 'cardio' },
];

export function buildReplacementOptions(
  current: { sessionType: string; templateId: string | null },
  templates: readonly { id: string; name: string }[],
): ReplacementOption[] {
  const options: ReplacementOption[] = [];

  for (const lighter of LIGHTER_OPTIONS) {
    if (current.sessionType === lighter.type) {
      continue;
    }
    options.push({
      key: lighter.type,
      label: lighter.label,
      toTemplateId: null,
      toTemplateName: null,
      toType: lighter.type,
    });
  }

  for (const template of templates) {
    // Skip the strength template the session already uses; other strength
    // templates (for example the opposite of Strength A/B) are valid swaps.
    if (
      current.sessionType === 'strength' &&
      current.templateId === template.id
    ) {
      continue;
    }
    options.push({
      key: `strength:${template.id}`,
      label: `Change to ${template.name}`,
      toTemplateId: template.id,
      toTemplateName: template.name,
      toType: 'strength',
    });
  }

  return options;
}
