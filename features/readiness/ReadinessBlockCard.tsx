// The red result shown when a session start is refused because the latest pre-session
// readiness check was red (roadmap 14, docs/06 §6.5 hard rule, docs/07 §7.4 — a red
// result must not be overridable). It is reused by Today (the "Start session" block)
// and by the workout player (the deep-link / continue block), so both doors present
// the same honest red result rather than a generic error.
//
// The block is server-enforced (start_scheduled_session refuses to create the
// workout_logs row); this card only explains it. It conveys the red status by icon,
// heading and text (never colour alone — docs/09 §9.2), shows the docs/07 §7.2
// professional-care escalation via presentClassification('red'), states plainly that
// the user can still log and view, and never diagnoses or assesses the injury.

import { View } from 'react-native';

import { AppText, Card, StatusBadge } from '@/components/common';
import { presentClassification } from '@/domain/training/readinessClassification';
import { useAppTheme } from '@/theme/useAppTheme';

import {
  CLASSIFICATION_HEADING,
  CLASSIFICATION_LABEL,
  CLASSIFICATION_TONE,
  NON_DIAGNOSIS_NOTE,
} from './readinessCopy';

const INTRO =
  'Your most recent readiness check for this session was red, so it will not start today.';

export function ReadinessBlockCard() {
  const { spacing } = useAppTheme();
  const copy = presentClassification('red');
  return (
    <Card accessibilityLabel="This session will not start because your latest readiness check was red.">
      <View style={{ gap: spacing.md }}>
        <StatusBadge
          label={CLASSIFICATION_LABEL.red}
          tone={CLASSIFICATION_TONE.red}
        />
        <AppText variant="heading">{CLASSIFICATION_HEADING.red}</AppText>
        <AppText accessibilityLiveRegion="assertive">{INTRO}</AppText>
        {/* docs/07 §7.2 professional-care escalation. */}
        <AppText>{copy.recommendation}</AppText>
        {/* You can still log and view your data (docs/06 §6.2 "permit logging only"). */}
        <AppText tone="secondary" variant="label">
          {copy.allowedAction}
        </AppText>
        <AppText tone="secondary" variant="caption">
          {NON_DIAGNOSIS_NOTE}
        </AppText>
      </View>
    </Card>
  );
}
