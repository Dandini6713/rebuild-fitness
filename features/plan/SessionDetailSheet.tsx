// The session detail sheet for the weekly planner (S-020). Presentational: it
// takes the selected session, the week context and callbacks, and holds only the
// small local state of which sub-panel is open (overview, move or replace). All
// scheduling decisions and persistence live in useWeeklyPlan; this sheet renders
// the session, offers Move / Replace / Skip, and shows the hard-block or
// soft-warning panels the hook hands back. Conflicts are conveyed by text and
// icon, never colour alone (docs/09 §9.2); every control is a 44pt target with an
// accessible label.

import { type ReactNode, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import {
  AppText,
  Card,
  ErrorState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  type StatusTone,
} from '@/components/common';
import {
  describeSessionType,
  formatPlanDate,
} from '@/domain/training/planSchedule';
import { buildReplacementOptions } from '@/domain/training/replacementOptions';
import { useAppTheme } from '@/theme/useAppTheme';

import type { PlannerSession, PlannerTemplate } from './planRepository';
import type { PlannerAction, PlannerActionState } from './useWeeklyPlan';

const STATUS_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  cancelled: { label: 'Cancelled', tone: 'caution' },
  completed: { label: 'Completed', tone: 'success' },
  in_progress: { label: 'In progress', tone: 'info' },
  planned: { label: 'Planned', tone: 'neutral' },
  replaced: { label: 'Replaced', tone: 'neutral' },
  skipped: { label: 'Skipped', tone: 'caution' },
};

export function labelForSession(session: {
  sessionType: string;
  templateName: string | null;
}): string {
  return session.templateName ?? describeSessionType(session.sessionType);
}

export function durationText(minutes: number | null): string | null {
  return minutes === null ? null : `${minutes} min`;
}

type SessionDetailSheetProps = {
  session: PlannerSession;
  weekDates: readonly string[];
  templates: readonly PlannerTemplate[];
  action: PlannerActionState;
  actionError: string | null;
  onRequestChange: (action: PlannerAction) => void;
  onConfirm: () => void;
  onDismissConflict: () => void;
  onClose: () => void;
};

export function SessionDetailSheet({
  action,
  actionError,
  onClose,
  onConfirm,
  onDismissConflict,
  onRequestChange,
  session,
  templates,
  weekDates,
}: SessionDetailSheetProps) {
  const { colours, spacing } = useAppTheme();
  // A dimmed scrim behind the sheet; a literal translucent black works in both
  // themes and needs no new token.
  const backdrop = 'rgba(0, 0, 0, 0.45)';
  const [mode, setMode] = useState<'overview' | 'move' | 'replace'>('overview');

  const label = labelForSession(session);
  const duration = durationText(session.durationMinutes);
  const status = STATUS_LABELS[session.status] ?? {
    label: session.status,
    tone: 'neutral' as StatusTone,
  };
  const saving = action.kind === 'saving';

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View
        style={{
          backgroundColor: backdrop,
          flex: 1,
          justifyContent: 'flex-end',
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: colours.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            gap: spacing.lg,
            padding: spacing.lg,
          }}
        >
          <View
            style={{
              alignItems: 'flex-start',
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <AppText accessibilityRole="header" variant="heading">
                {label}
              </AppText>
              <AppText tone="secondary">
                {describeSessionType(session.sessionType)},{' '}
                {formatPlanDate(session.scheduledDate)}
                {duration ? ` · ${duration}` : ''}
              </AppText>
            </View>
            <Pressable
              accessibilityLabel="Close session details"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 44,
                minWidth: 44,
              }}
            >
              <AppText variant="heading">×</AppText>
            </Pressable>
          </View>

          <StatusBadge label={status.label} tone={status.tone} />

          {action.kind === 'blocked' ? (
            <ConflictPanel
              heading="This change can't be saved"
              live="assertive"
              messages={action.conflicts.map((conflict) => conflict.message)}
              tone="caution"
            >
              <SecondaryButton
                accessibilityLabel="Choose a different option"
                label="Choose something else"
                onPress={onDismissConflict}
              />
            </ConflictPanel>
          ) : null}

          {action.kind === 'confirm' ? (
            <ConflictPanel
              heading="Check this before saving"
              live="assertive"
              messages={action.conflicts.map((conflict) => conflict.message)}
              tone="caution"
            >
              <PrimaryButton
                accessibilityLabel="Save this change anyway"
                label="Save anyway"
                loading={saving}
                onPress={onConfirm}
              />
              <SecondaryButton
                accessibilityLabel="Cancel this change"
                disabled={saving}
                label="Cancel"
                onPress={onDismissConflict}
              />
            </ConflictPanel>
          ) : null}

          {actionError ? (
            <ErrorState description={actionError} title="Couldn't save" />
          ) : null}

          {action.kind === 'idle' || action.kind === 'saving' ? (
            <PanelBody
              mode={mode}
              onBack={() => setMode('overview')}
              onMove={() => setMode('move')}
              onReplace={() => setMode('replace')}
              onRequestChange={onRequestChange}
              saving={saving}
              session={session}
              templates={templates}
              weekDates={weekDates}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function PanelBody({
  mode,
  onBack,
  onMove,
  onReplace,
  onRequestChange,
  saving,
  session,
  templates,
  weekDates,
}: {
  mode: 'overview' | 'move' | 'replace';
  onBack: () => void;
  onMove: () => void;
  onReplace: () => void;
  onRequestChange: (action: PlannerAction) => void;
  saving: boolean;
  session: PlannerSession;
  templates: readonly PlannerTemplate[];
  weekDates: readonly string[];
}) {
  const { spacing } = useAppTheme();

  if (mode === 'move') {
    return (
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label">Move to another day this week</AppText>
        {weekDates.map((date) => {
          const isCurrent = date === session.scheduledDate;
          return (
            <SecondaryButton
              accessibilityLabel={
                isCurrent
                  ? `${formatPlanDate(date)}, the current day`
                  : `Move to ${formatPlanDate(date)}`
              }
              disabled={isCurrent || saving}
              key={date}
              label={
                isCurrent
                  ? `${formatPlanDate(date)} (current day)`
                  : formatPlanDate(date)
              }
              onPress={() =>
                onRequestChange({
                  kind: 'move',
                  sessionId: session.id,
                  toDate: date,
                })
              }
            />
          );
        })}
        <SecondaryButton label="Back" onPress={onBack} />
      </View>
    );
  }

  if (mode === 'replace') {
    const options = buildReplacementOptions(
      { sessionType: session.sessionType, templateId: session.templateId },
      templates,
    );
    return (
      <View style={{ gap: spacing.sm }}>
        <AppText variant="label">Replace this session with…</AppText>
        {options.map((option) => (
          <SecondaryButton
            accessibilityLabel={option.label}
            disabled={saving}
            key={option.key}
            label={option.label}
            onPress={() =>
              onRequestChange({
                kind: 'replace',
                sessionId: session.id,
                toTemplateId: option.toTemplateId,
                toType: option.toType,
              })
            }
          />
        ))}
        <SecondaryButton label="Back" onPress={onBack} />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <SecondaryButton
        accessibilityLabel="Move this session to another day"
        disabled={saving}
        label="Move"
        onPress={onMove}
      />
      <SecondaryButton
        accessibilityLabel="Replace this session"
        disabled={saving}
        label="Replace"
        onPress={onReplace}
      />
      <SecondaryButton
        accessibilityLabel="Skip this session"
        disabled={saving}
        label="Skip"
        loading={saving}
        onPress={() => onRequestChange({ kind: 'skip', sessionId: session.id })}
      />
    </View>
  );
}

function ConflictPanel({
  children,
  heading,
  live,
  messages,
  tone,
}: {
  children: ReactNode;
  heading: string;
  live: 'assertive' | 'polite';
  messages: string[];
  tone: StatusTone;
}) {
  const { spacing } = useAppTheme();
  return (
    <Card accessibilityLabel={`${heading}. ${messages.join(' ')}`}>
      <StatusBadge label={heading} tone={tone} />
      <View accessibilityLiveRegion={live} style={{ gap: spacing.xs }}>
        {messages.map((message) => (
          <AppText key={message} tone="secondary">
            {message}
          </AppText>
        ))}
      </View>
      <View style={{ gap: spacing.xs }}>{children}</View>
    </Card>
  );
}
