import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import {
  NotificationSettingsView,
  type NotificationSettingsViewProps,
} from '@/features/notifications/NotificationSettingsView';

function props(
  overrides: Partial<NotificationSettingsViewProps> = {},
): NotificationSettingsViewProps {
  return {
    loadState: {
      preferences: {
        next_morning: false,
        readiness: false,
        sessions: false,
        waist: false,
        weekly_review: false,
        weigh_in: false,
      },
      status: 'ready',
    },
    onOpenSystemSettings: jest.fn(),
    onRefresh: jest.fn(),
    onRequestPermission: jest.fn(),
    onToggle: jest.fn(),
    permission: { status: 'granted' },
    saveState: { status: 'idle' },
    ...overrides,
  };
}

describe('NotificationSettingsView — states', () => {
  it('shows the loading state', async () => {
    const { getByText } = await render(
      <NotificationSettingsView
        {...props({ loadState: { status: 'loading' } })}
      />,
    );
    expect(getByText('Loading your notification settings…')).toBeTruthy();
  });

  it('shows the error state with a retry that calls onRefresh', async () => {
    const onRefresh = jest.fn();
    const { getByText } = await render(
      <NotificationSettingsView
        {...props({
          loadState: { message: 'Could not load', status: 'error' },
          onRefresh,
        })}
      />,
    );
    fireEvent.press(getByText('Try again'));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('shows the unavailable state', async () => {
    const { getByText } = await render(
      <NotificationSettingsView
        {...props({ loadState: { status: 'unavailable' } })}
      />,
    );
    expect(getByText(/not available right now/i)).toBeTruthy();
  });

  it('toggling a type calls onToggle with that type only', async () => {
    const onToggle = jest.fn();
    const { getByLabelText } = await render(
      <NotificationSettingsView {...props({ onToggle })} />,
    );
    fireEvent(getByLabelText('Session reminders'), 'valueChange', true);
    expect(onToggle).toHaveBeenCalledWith('sessions', true);
  });

  it('shows the success confirmation after a save', async () => {
    const { getByText } = await render(
      <NotificationSettingsView
        {...props({ saveState: { status: 'saved' } })}
      />,
    );
    expect(getByText(/Saved/)).toBeTruthy();
  });

  it('shows the offline state on an offline save', async () => {
    const { getByText } = await render(
      <NotificationSettingsView
        {...props({ saveState: { status: 'offline' } })}
      />,
    );
    expect(getByText(/offline/i)).toBeTruthy();
  });
});

describe('NotificationSettingsView — permission', () => {
  it('offers to request permission when undetermined', async () => {
    const onRequestPermission = jest.fn();
    const { getByText } = await render(
      <NotificationSettingsView
        {...props({
          permission: { status: 'undetermined' },
          onRequestPermission,
        })}
      />,
    );
    fireEvent.press(getByText('Turn on notifications'));
    expect(onRequestPermission).toHaveBeenCalled();
  });

  it('reflects denied permission honestly and offers a route to system settings', async () => {
    const onOpenSystemSettings = jest.fn();
    const { getByText } = await render(
      <NotificationSettingsView
        {...props({ permission: { status: 'denied' }, onOpenSystemSettings })}
      />,
    );
    // Honest OS state.
    expect(getByText(/off in system settings/i)).toBeTruthy();
    // The partial/holding banner explaining reminders will not appear.
    expect(getByText(/reminders will not appear until/i)).toBeTruthy();
    fireEvent.press(getByText('Open settings'));
    expect(onOpenSystemSettings).toHaveBeenCalled();
  });

  it('confirms notifications are on when granted', async () => {
    const { getByText } = await render(
      <NotificationSettingsView
        {...props({ permission: { status: 'granted' } })}
      />,
    );
    expect(getByText(/Notifications are on/)).toBeTruthy();
  });
});
