// The Data export and account deletion screen (S-053), pure in its props — it takes the
// resolved export and deletion state and callbacks, not the hooks. Two clearly separated
// sections: a calm data export, and a deliberate, multi-step, cancellable account deletion
// that requires re-entering the password (docs/07 §7.8) before the final confirm. Every
// docs/03 §3.3 state is present. British English throughout; the destructive path is
// unambiguous but not alarmist, and conveys its danger by icon and text (never colour alone).

import { useState } from 'react';
import { TextInput, View } from 'react-native';

import {
  AppText,
  Card,
  ErrorState,
  LoadingState,
  OfflineState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

import type {
  AccountDeletionState,
  AccountExportState,
} from './useAccountData';

export type AccountDataViewProps = {
  exportState: AccountExportState;
  deletionState: AccountDeletionState;
  onGenerateExport: () => void;
  onShareExport: (json: string, filename: string) => void;
  onStartDeletion: () => void;
  onCancelDeletion: () => void;
  onConfirmDeletion: (password: string) => void;
};

export function AccountDataView({
  deletionState,
  exportState,
  onCancelDeletion,
  onConfirmDeletion,
  onGenerateExport,
  onShareExport,
  onStartDeletion,
}: AccountDataViewProps) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.lg }}>
      <ExportSection
        onGenerate={onGenerateExport}
        onShare={onShareExport}
        state={exportState}
      />
      <DeletionSection
        onCancel={onCancelDeletion}
        onConfirm={onConfirmDeletion}
        onStart={onStartDeletion}
        state={deletionState}
      />
    </View>
  );
}

function ExportSection({
  onGenerate,
  onShare,
  state,
}: {
  state: AccountExportState;
  onGenerate: () => void;
  onShare: (json: string, filename: string) => void;
}) {
  return (
    <Card>
      <AppText variant="heading">Export your data</AppText>
      <AppText tone="secondary" variant="body">
        Prepare a complete copy of your data in a readable file (JSON) that you
        can save or share. It contains only your own records.
      </AppText>

      {state.status === 'idle' ? (
        <PrimaryButton
          accessibilityHint="Prepares a file containing all of your data."
          label="Prepare my data export"
          onPress={onGenerate}
        />
      ) : null}

      {state.status === 'generating' ? (
        <LoadingState label="Preparing your export…" />
      ) : null}

      {state.status === 'ready' ? (
        <View style={{ gap: 8 }}>
          <StatusBadge label="Your export is ready" tone="success" />
          <AppText tone="secondary" variant="body">
            Your data is ready to save or share.
          </AppText>
          <PrimaryButton
            accessibilityHint="Opens the share sheet to save or send your export file."
            label="Save or share"
            onPress={() => onShare(state.json, state.filename)}
          />
          <SecondaryButton label="Prepare again" onPress={onGenerate} />
        </View>
      ) : null}

      {state.status === 'offline' ? (
        <OfflineState description="Reconnect and try again to prepare your export." />
      ) : null}

      {state.status === 'error' ? (
        <ErrorState
          description={state.message}
          onRetry={onGenerate}
          title="We could not prepare your export"
        />
      ) : null}

      {state.status === 'unavailable' ? (
        <AppText tone="secondary" variant="body">
          Exporting is not available right now. Please try again later.
        </AppText>
      ) : null}
    </Card>
  );
}

function DeletionSection({
  onCancel,
  onConfirm,
  onStart,
  state,
}: {
  state: AccountDeletionState;
  onStart: () => void;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const [password, setPassword] = useState('');

  const input = {
    borderColor: colours.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    color: colours.textPrimary,
    minHeight: touchTargets.comfortable,
    paddingHorizontal: spacing.sm,
  } as const;

  return (
    <Card>
      <AppText variant="heading">Delete your account</AppText>
      <AppText tone="secondary" variant="body">
        Deleting your account permanently removes all of your data from Rebuild
        — your profile, plans, sessions, measurements, food and drink records,
        reviews and history. This cannot be undone.
      </AppText>

      {state.status === 'idle' ? (
        <SecondaryButton
          accessibilityHint="Starts the account deletion process. You will be asked to confirm."
          label="Delete my account"
          onPress={onStart}
        />
      ) : null}

      {state.status === 'confirming' ? (
        <View style={{ gap: spacing.sm }}>
          <StatusBadge label="This is permanent" tone="danger" />
          <AppText style={{ color: colours.dangerText }} variant="body">
            To confirm, re-enter your password and choose “Permanently delete my
            account”. Everything listed above will be deleted and cannot be
            recovered.
          </AppText>

          <View style={{ gap: spacing.xs }}>
            <AppText variant="label">Your password</AppText>
            <TextInput
              accessibilityLabel="Your password"
              autoCapitalize="none"
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={colours.textTertiary}
              secureTextEntry
              style={input}
              value={password}
            />
          </View>

          {state.error ? (
            <AppText
              accessibilityLiveRegion="assertive"
              style={{ color: colours.dangerText }}
              variant="body"
            >
              {state.error}
            </AppText>
          ) : null}

          <PrimaryButton
            accessibilityHint="Permanently deletes your account and all of your data."
            label="Permanently delete my account"
            loading={state.busy}
            onPress={() => onConfirm(password)}
          />
          <SecondaryButton
            disabled={state.busy}
            label="Cancel"
            onPress={onCancel}
          />
        </View>
      ) : null}

      {state.status === 'deleted' ? (
        <View style={{ gap: spacing.xs }}>
          <StatusBadge label="Your account has been deleted" tone="success" />
          <AppText tone="secondary" variant="body">
            Your account and all of your data have been permanently deleted. You
            have been signed out.
          </AppText>
        </View>
      ) : null}

      {state.status === 'unavailable' ? (
        <AppText tone="secondary" variant="body">
          Account deletion is not available right now. Please try again later.
        </AppText>
      ) : null}
    </Card>
  );
}
