// Presentational rendering of the weekly review (roadmap 23, docs/03 S-041). Pure in its
// props — it takes the resolved state and callbacks, not the hook — so every state tests
// without Supabase or auth (mirrors TodayView, RunningProgressionView). All copy is British
// English; status is conveyed by text and an icon, never colour alone; controls are 44pt
// targets with accessible labels.
//
// The six S-041 sections: (1) What happened — the week's metrics; (2) What improved; (3)
// What needs attention; (4) Safety and recovery; (5) Proposed changes — the actionable
// recommendations with Accept / Dismiss; (6) Confirmation — a staged decision the user must
// explicitly confirm before anything is applied (docs/10 §10.2). Every proposed change
// shows its plain-British reason and, available but not shouty, its evidence (docs/03 S-041
// "Every proposed change must display its input evidence").
//
// Framing is non-diagnostic and non-shaming (docs/07): the app records and suggests, it
// never diagnoses, treats or judges. A calorie reduction held at the safety floor carries
// the professional-review escalation; the safety section never claims a tendon is healed or
// that the user is medically fit.

import { View } from 'react-native';

import {
  AppText,
  Card,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import type {
  WeeklyReviewMetrics,
  WeeklyReviewRecommendation,
} from '@/domain/review/weeklyReview';

import type { StoredWeeklyReview } from './weeklyReviewRepository';
import type { PendingDecision, WeeklyReviewState } from './useWeeklyReview';

export type WeeklyReviewCallbacks = {
  onGenerate: () => void;
  onRequestDecision: (
    recommendation: WeeklyReviewRecommendation,
    action: 'accepted' | 'dismissed',
  ) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

// A source label for a recommendation heading.
const SOURCE_LABELS: Record<WeeklyReviewRecommendation['source'], string> = {
  calorie: 'Calorie target',
  running: 'Running stage',
  strength: 'Strength weight',
};

function SectionHeading({ children }: { children: string }) {
  return (
    <AppText accessibilityRole="header" variant="heading">
      {children}
    </AppText>
  );
}

// A plain line for each metric in "What happened". Nulls read honestly (never a fabricated
// zero): no basis for a number says so in words.
function whatHappenedLines(metrics: WeeklyReviewMetrics): string[] {
  const lines: string[] = [];

  if (metrics.adherence.planned === 0) {
    lines.push('No training sessions were planned this week.');
  } else {
    lines.push(
      `Sessions completed: ${metrics.adherence.completed} of ${metrics.adherence.planned}` +
        (metrics.adherence.percent !== null
          ? ` (${metrics.adherence.percent}%).`
          : '.'),
    );
  }

  if (metrics.weightTrend.status === 'trend') {
    const rate = metrics.weightTrend.changePerWeekKg;
    const rateText =
      rate === null
        ? ''
        : ` (about ${(Math.round(Math.abs(rate) * 10) / 10).toFixed(1)} kg per week ${
            rate < 0 ? 'down' : rate > 0 ? 'up' : 'steady'
          })`;
    lines.push(`Weight trend: ${metrics.weightTrend.direction}${rateText}.`);
  } else {
    lines.push(
      'Weight trend: not enough recent weigh-ins yet to read a reliable trend.',
    );
  }

  lines.push(
    `Protein: averaged ${metrics.protein.averageProteinG} g a day, within target on ${metrics.protein.daysWithinTarget} of ${metrics.protein.daysConsidered} days.`,
  );

  lines.push(
    `Alcohol: ${metrics.alcohol.totalUnits} units across ${metrics.alcohol.totalDrinks} drinks, ${metrics.alcohol.alcoholFreeDays} alcohol-free ${
      metrics.alcohol.alcoholFreeDays === 1 ? 'day' : 'days'
    }.`,
  );

  return lines;
}

// Positive, honest highlights. Empty when there is nothing to celebrate yet — the section
// then says so plainly rather than inventing praise.
function whatImprovedLines(review: StoredWeeklyReview): string[] {
  const { metrics } = review;
  const lines: string[] = [];
  if (
    metrics.weightTrend.status === 'trend' &&
    metrics.weightTrend.changePerWeekKg !== null &&
    metrics.weightTrend.changePerWeekKg < 0
  ) {
    lines.push('Your weight is trending gently downwards.');
  }
  if (metrics.adherence.percent !== null && metrics.adherence.percent >= 80) {
    lines.push('You completed most of your planned sessions.');
  }
  if (
    metrics.protein.daysConsidered > 0 &&
    metrics.protein.daysWithinTarget >=
      Math.ceil(metrics.protein.daysConsidered * 0.7)
  ) {
    lines.push('Protein was close to target on most days.');
  }
  if (metrics.alcohol.alcoholFreeDays >= 4) {
    lines.push(`You had ${metrics.alcohol.alcoholFreeDays} alcohol-free days.`);
  }
  if (
    review.recommendations.some(
      (rec) =>
        rec.actionable &&
        (rec.source === 'strength' || rec.source === 'running'),
    )
  ) {
    lines.push('You are ready to progress a session — see Proposed changes.');
  }
  return lines;
}

// Gentle, non-shaming "needs attention" items. Never judgemental, never diagnostic.
function needsAttentionLines(review: StoredWeeklyReview): string[] {
  const { metrics, recommendations } = review;
  const lines: string[] = [];
  if (metrics.adherence.percent !== null && metrics.adherence.percent < 80) {
    lines.push(
      'Fewer sessions than planned were completed. Building steady consistency comes first — no pressure.',
    );
  }
  if (metrics.weightTrend.status !== 'trend') {
    lines.push(
      'A few more weigh-ins are needed before a weight trend can be read.',
    );
  }
  const calorie = recommendations.find((rec) => rec.source === 'calorie');
  if (calorie && calorie.decision === 'not-eligible') {
    for (const reason of calorie.reasons) {
      if (reason.code === 'insufficient-nutrition-logging') {
        lines.push(reason.message);
      }
    }
  }
  if (calorie && calorie.decision === 'propose-increase') {
    lines.push(
      'Weight is falling quite quickly. It is worth checking your food logging is complete.',
    );
  }
  return lines;
}

// The safety and recovery section. Non-diagnostic throughout (docs/07). When a calorie
// reduction is held at the safety floor, the professional-review escalation is shown; the
// standing note makes clear the app does not diagnose or treat.
function safetyLines(review: StoredWeeklyReview): {
  professionalReview: boolean;
  lines: string[];
} {
  const calorie = review.recommendations.find(
    (rec) => rec.source === 'calorie',
  );
  const professionalReview = Boolean(
    calorie?.change?.professionalReviewRequired,
  );
  const lines: string[] = [];
  if (professionalReview) {
    lines.push(
      'A further reduction would take your target below your safety floor, so it is held there. Please seek advice from an appropriate healthcare professional before reducing further.',
    );
  }
  lines.push(
    'This review records what you logged and suggests small adjustments. It does not diagnose, treat or assess any injury, and it is not a substitute for professional advice.',
  );
  return { lines, professionalReview };
}

// Render one proposed change with its reason and (muted) evidence, plus Accept / Dismiss.
function ProposedChange({
  recommendation,
  disabled,
  onRequestDecision,
}: {
  recommendation: WeeklyReviewRecommendation;
  disabled: boolean;
  onRequestDecision: WeeklyReviewCallbacks['onRequestDecision'];
}) {
  const evidenceLines = evidenceSummary(recommendation.evidence);
  return (
    <Card>
      <StatusBadge label={SOURCE_LABELS[recommendation.source]} tone="info" />
      <AppText variant="body">{recommendation.summary}</AppText>
      {recommendation.reasons.map((reason) => (
        <AppText key={reason.code} variant="body">
          {reason.message}
        </AppText>
      ))}
      <View style={{ gap: 2 }}>
        <AppText tone="tertiary" variant="caption">
          Evidence ({recommendation.ruleVersion})
        </AppText>
        {evidenceLines.map((line) => (
          <AppText key={line} tone="tertiary" variant="caption">
            {line}
          </AppText>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            disabled={disabled}
            label="Accept"
            onPress={() => onRequestDecision(recommendation, 'accepted')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <SecondaryButton
            disabled={disabled}
            label="Dismiss"
            onPress={() => onRequestDecision(recommendation, 'dismissed')}
          />
        </View>
      </View>
    </Card>
  );
}

// Turn an engine's evidence object into a few muted "key: value" lines. Best-effort and
// deliberately compact — the evidence is available for scrutiny, not shouted.
function evidenceSummary(evidence: unknown): string[] {
  if (!evidence || typeof evidence !== 'object') {
    return [];
  }
  const entries = Object.entries(evidence as Record<string, unknown>);
  return entries
    .filter(([, value]) => value !== null && typeof value !== 'object')
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

// The confirmation panel (section 6). Shown only when a decision is staged. Nothing has
// been applied yet — Confirm applies it, Cancel discards it.
function ConfirmationPanel({
  pending,
  deciding,
  decideError,
  callbacks,
}: {
  pending: PendingDecision;
  deciding: boolean;
  decideError: string | null;
  callbacks: WeeklyReviewCallbacks;
}) {
  const { action, recommendation } = pending;
  const isAccept = action === 'accepted';
  const floorHeld = Boolean(recommendation.change?.professionalReviewRequired);
  const heading = isAccept
    ? `Confirm: accept this ${SOURCE_LABELS[recommendation.source].toLowerCase()} change?`
    : `Confirm: dismiss this ${SOURCE_LABELS[recommendation.source].toLowerCase()} suggestion?`;

  return (
    <Card>
      <StatusBadge label="Confirmation" tone={isAccept ? 'info' : 'neutral'} />
      <AppText accessibilityRole="header" variant="heading">
        {heading}
      </AppText>
      <AppText variant="body">
        {isAccept
          ? recommendation.source === 'calorie'
            ? `Your calorie target will change to about ${recommendation.change?.proposedTargetCalories ?? ''} kcal a day from today. Your existing targets are kept as history.`
            : 'This will be recorded as accepted.'
          : 'Nothing will change. This suggestion will be set aside for this week.'}
      </AppText>
      {isAccept && floorHeld ? (
        <View style={{ gap: 4 }}>
          <StatusBadge label="Please read" tone="caution" />
          <AppText variant="body">
            This reduction is held at your safety floor. Please seek advice from
            an appropriate healthcare professional before reducing further.
          </AppText>
        </View>
      ) : null}
      {decideError ? <ErrorState description={decideError} /> : null}
      <PrimaryButton
        disabled={deciding}
        label={
          deciding ? 'Confirming' : isAccept ? 'Confirm change' : 'Confirm'
        }
        loading={deciding}
        onPress={callbacks.onConfirm}
      />
      <SecondaryButton
        disabled={deciding}
        label="Cancel"
        onPress={callbacks.onCancel}
      />
    </Card>
  );
}

export function WeeklyReviewView({
  state,
  callbacks,
}: {
  state: WeeklyReviewState;
  callbacks: WeeklyReviewCallbacks;
}) {
  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Loading your weekly review."
        label="Loading your weekly review"
      />
    );
  }
  if (state.status === 'unavailable') {
    return (
      <ErrorState description="Your weekly review is unavailable right now. Please try again later." />
    );
  }
  if (state.status === 'error') {
    return <ErrorState description={state.message} />;
  }
  if (state.status === 'empty') {
    return (
      <Card>
        <AppText variant="body">
          You do not have a weekly review yet. Put together this week&apos;s
          review from what you have logged.
        </AppText>
        {state.generateError ? (
          <ErrorState description={state.generateError} />
        ) : null}
        <PrimaryButton
          disabled={state.generating}
          label={state.generating ? 'Preparing' : 'Prepare this week’s review'}
          loading={state.generating}
          onPress={callbacks.onGenerate}
        />
      </Card>
    );
  }

  const { review, pending, deciding, decideError } = state;
  const happened = whatHappenedLines(review.metrics);
  const improved = whatImprovedLines(review);
  const attention = needsAttentionLines(review);
  const safety = safetyLines(review);
  const proposed = review.recommendations.filter((rec) => rec.actionable);
  const decidedProposals = review.recommendations.filter(
    (rec) =>
      (rec.source === 'strength' ||
        rec.source === 'running' ||
        rec.source === 'calorie') &&
      (rec.status === 'accepted' || rec.status === 'dismissed'),
  );

  return (
    <View style={{ gap: 16 }}>
      {/* 1. What happened */}
      <View style={{ gap: 8 }}>
        <SectionHeading>What happened</SectionHeading>
        <Card>
          {happened.map((line) => (
            <AppText key={line} variant="body">
              {line}
            </AppText>
          ))}
        </Card>
      </View>

      {/* 2. What improved */}
      <View style={{ gap: 8 }}>
        <SectionHeading>What improved</SectionHeading>
        <Card>
          {improved.length > 0 ? (
            improved.map((line) => (
              <AppText key={line} variant="body">
                {line}
              </AppText>
            ))
          ) : (
            <AppText variant="body">
              Nothing stands out yet this week — keep logging and it will build.
            </AppText>
          )}
        </Card>
      </View>

      {/* 3. What needs attention */}
      <View style={{ gap: 8 }}>
        <SectionHeading>What needs attention</SectionHeading>
        <Card>
          {attention.length > 0 ? (
            attention.map((line) => (
              <AppText key={line} variant="body">
                {line}
              </AppText>
            ))
          ) : (
            <AppText variant="body">Nothing needs attention this week.</AppText>
          )}
        </Card>
      </View>

      {/* 4. Safety and recovery */}
      <View style={{ gap: 8 }}>
        <SectionHeading>Safety and recovery</SectionHeading>
        <Card>
          {safety.professionalReview ? (
            <StatusBadge label="Seek professional advice" tone="danger" />
          ) : null}
          {safety.lines.map((line) => (
            <AppText key={line} variant="body">
              {line}
            </AppText>
          ))}
        </Card>
      </View>

      {/* 5. Proposed changes */}
      <View style={{ gap: 8 }}>
        <SectionHeading>Proposed changes</SectionHeading>
        {proposed.length > 0 ? (
          proposed.map((rec) => (
            <ProposedChange
              disabled={deciding || pending !== null}
              key={`${rec.source}-${rec.proposalId ?? 'calorie'}`}
              onRequestDecision={callbacks.onRequestDecision}
              recommendation={rec}
            />
          ))
        ) : (
          <Card>
            <AppText variant="body">
              No changes are proposed this week. Your current plan and targets
              stay as they are.
            </AppText>
          </Card>
        )}
        {decidedProposals.map((rec) => (
          <Card key={`decided-${rec.source}-${rec.proposalId ?? 'calorie'}`}>
            <StatusBadge
              label={rec.status === 'accepted' ? 'Accepted' : 'Set aside'}
              tone={rec.status === 'accepted' ? 'success' : 'neutral'}
            />
            <AppText variant="body">{rec.summary}</AppText>
          </Card>
        ))}
      </View>

      {/* 6. Confirmation */}
      {pending ? (
        <View style={{ gap: 8 }}>
          <SectionHeading>Confirmation</SectionHeading>
          <ConfirmationPanel
            callbacks={callbacks}
            decideError={decideError}
            deciding={deciding}
            pending={pending}
          />
        </View>
      ) : null}
    </View>
  );
}
