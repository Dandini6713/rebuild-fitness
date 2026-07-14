// The Notifications settings screen (S-051), pure in its props — it takes the resolved
// load/permission/save state and callbacks, not the hook. It renders a per-type toggle
// list, the HONEST OS permission state (with a route to request or to open system settings
// when denied), and every docs/03 §3.3 state. Copy is British English, gentle and
// non-nagging (docs/07). No notification body text lives here — that is the single reviewed
// source in the pure module; this screen only labels the controls.

import { Switch, View } from 'react-native';

import {
  AppText,
  Card,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import type { NotificationType } from '@/domain/notifications/notificationSchedule';
import { useAppTheme } from '@/theme/useAppTheme';

import type {
  NotificationLoadState,
  NotificationPermissionState,
  NotificationSaveState,
} from './useNotificationSettings';

// Display order and the neutral, non-nagging label + description for each type. These
// describe the CONTROL; they never contain a value or a health detail.
const ROWS: { type: NotificationType; label: string; description: string }[] = [
  {
    type: 'sessions',
    label: 'Session reminders',
    description: 'A reminder on the morning of a planned session.',
  },
  {
    type: 'readiness',
    label: 'Pre-session check',
    description:
      'A reminder to complete a quick check-in before a demanding session.',
  },
  {
    type: 'next_morning',
    label: 'Next-morning check',
    description:
      'A reminder the morning after a session, when one is expected.',
  },
  {
    type: 'weigh_in',
    label: 'Weigh-in reminders',
    description: 'A gentle reminder to weigh in, on your weigh-in cadence.',
  },
  {
    type: 'waist',
    label: 'Waist reminders',
    description: 'A gentle reminder to take a waist measurement.',
  },
  {
    type: 'weekly_review',
    label: 'Weekly check-in',
    description: 'A reminder that your weekly check-in is ready.',
  },
];

export type NotificationSettingsViewProps = {
  loadState: NotificationLoadState;
  permission: NotificationPermissionState;
  saveState: NotificationSaveState;
  onToggle: (type: NotificationType, value: boolean) => void;
  onRequestPermission: () => void;
  onRefresh: () => void;
  onOpenSystemSettings?: () => void;
};

export function NotificationSettingsView({
  loadState,
  onOpenSystemSettings,
  onRefresh,
  onRequestPermission,
  onToggle,
  permission,
  saveState,
}: NotificationSettingsViewProps) {
  const { colours, spacing } = useAppTheme();

  if (loadState.status === 'loading') {
    return <LoadingState label="Loading your notification settings…" />;
  }

  if (loadState.status === 'unavailable') {
    return (
      <Card>
        <StatusBadge label="Unavailable" tone="info" />
        <AppText tone="secondary">
          Notification settings are not available right now. Please try again
          later.
        </AppText>
      </Card>
    );
  }

  if (loadState.status === 'error') {
    return (
      <ErrorState
        description={loadState.message}
        onRetry={onRefresh}
        title="We could not load your settings"
      />
    );
  }

  const { preferences } = loadState;
  const granted = permission.status === 'granted';

  return (
    <View style={{ gap: spacing.md }}>
      <PermissionCard
        onOpenSystemSettings={onOpenSystemSettings}
        onRequestPermission={onRequestPermission}
        permission={permission}
      />

      {/* Partial-data / holding state: preferences are saved, but nothing fires until the
          OS permission is granted. Shown honestly rather than pretending reminders are
          active. */}
      {permission.status !== 'loading' && !granted ? (
        <Card>
          <StatusBadge label="Reminders paused" tone="info" />
          <AppText tone="secondary">
            Your choices below are saved, but reminders will not appear until
            notifications are turned on above.
          </AppText>
        </Card>
      ) : null}

      <Card>
        <AppText variant="heading">Choose your reminders</AppText>
        <AppText tone="secondary" variant="body">
          Each reminder is optional and independent — turn on only the ones you
          want. Reminders are gentle and never share any personal detail.
        </AppText>

        {ROWS.map((row) => (
          <View
            key={row.type}
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: spacing.md,
              justifyContent: 'space-between',
            }}
          >
            <View style={{ flex: 1, gap: spacing.xxs }}>
              <AppText variant="label">{row.label}</AppText>
              <AppText tone="secondary" variant="caption">
                {row.description}
              </AppText>
            </View>
            <Switch
              accessibilityLabel={row.label}
              accessibilityRole="switch"
              accessibilityState={{ checked: preferences[row.type] }}
              disabled={saveState.status === 'submitting'}
              onValueChange={(value) => onToggle(row.type, value)}
              thumbColor={colours.surface}
              trackColor={{ false: colours.track, true: colours.accent }}
              value={preferences[row.type]}
            />
          </View>
        ))}

        {saveState.status === 'saved' ? (
          <StatusBadge label="Saved" tone="success" />
        ) : null}
        {saveState.status === 'offline' ? (
          <AppText accessibilityLiveRegion="polite" variant="body">
            You appear to be offline, so that change was not saved. Please try
            again when you are back online.
          </AppText>
        ) : null}
        {saveState.status === 'error' ? (
          <AppText
            accessibilityLiveRegion="assertive"
            style={{ color: colours.cautionText }}
            variant="body"
          >
            {saveState.message}
          </AppText>
        ) : null}
      </Card>
    </View>
  );
}

function PermissionCard({
  onOpenSystemSettings,
  onRequestPermission,
  permission,
}: {
  permission: NotificationPermissionState;
  onRequestPermission: () => void;
  onOpenSystemSettings?: (() => void) | undefined;
}) {
  if (permission.status === 'loading') {
    return (
      <Card>
        <AppText tone="secondary">Checking notification permission…</AppText>
      </Card>
    );
  }

  if (permission.status === 'granted') {
    return (
      <Card>
        <StatusBadge label="Notifications are on" tone="success" />
        <AppText tone="secondary">
          You will receive the reminders you turn on below.
        </AppText>
      </Card>
    );
  }

  if (permission.status === 'undetermined') {
    return (
      <Card>
        <AppText variant="heading">Allow notifications</AppText>
        <AppText tone="secondary">
          To receive reminders, allow notifications when your phone asks. You
          can change this at any time.
        </AppText>
        <PrimaryButton
          label="Turn on notifications"
          onPress={onRequestPermission}
        />
      </Card>
    );
  }

  // Denied: reflect the real OS state honestly and route to system settings.
  return (
    <Card>
      <StatusBadge
        label="Notifications are off in system settings"
        tone="info"
      />
      <AppText tone="secondary">
        Notifications are turned off for Rebuild in your phone&apos;s settings.
        To receive reminders, turn them on in Settings.
      </AppText>
      {onOpenSystemSettings ? (
        <SecondaryButton label="Open settings" onPress={onOpenSystemSettings} />
      ) : null}
    </Card>
  );
}
