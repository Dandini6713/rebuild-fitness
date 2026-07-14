// Roadmap 26 (accessibility): presence checks for screen-reader props on shared controls
// that the sweep fixed (docs/09 §9.8 item 1). Jest can assert the props exist and carry the
// right role/state/label; it cannot verify the lived VoiceOver announcement — that is the
// device pass (see CLAUDE.md device-test checklist).

import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { OptionGroup } from '@/components/forms';
import { NotificationSettingsView } from '@/features/notifications/NotificationSettingsView';
import { allOff } from '@/features/notifications/notificationPreferencesRepository';

describe('OptionGroup rows expose an explicit label, role and selected state', () => {
  it('labels each radio with its option text and reflects selection', async () => {
    const { getByRole } = await render(
      <OptionGroup
        label="Sessions per week"
        onChange={() => undefined}
        options={[
          { label: 'Three', value: 'three' },
          { label: 'Four', value: 'four' },
        ]}
        value="three"
      />,
    );

    const selected = getByRole('radio', { name: 'Three' });
    expect(selected.props.accessibilityLabel).toBe('Three');
    expect(selected.props.accessibilityState).toMatchObject({ checked: true });

    const other = getByRole('radio', { name: 'Four' });
    expect(other.props.accessibilityState).toMatchObject({ checked: false });
  });
});

describe('Notification toggles expose switch role, label and checked state', () => {
  it('each toggle announces as a switch with its label and on/off state', async () => {
    const preferences = { ...allOff(), sessions: true };
    const { getByLabelText } = await render(
      <NotificationSettingsView
        loadState={{ status: 'ready', preferences }}
        onRefresh={() => undefined}
        onRequestPermission={() => undefined}
        onToggle={() => undefined}
        permission={{ status: 'granted' }}
        saveState={{ status: 'idle' }}
      />,
    );

    const sessions = getByLabelText('Session reminders');
    expect(sessions.props.accessibilityRole).toBe('switch');
    expect(sessions.props.accessibilityState).toMatchObject({ checked: true });

    const weighIn = getByLabelText('Weigh-in reminders');
    expect(weighIn.props.accessibilityState).toMatchObject({ checked: false });
  });
});
