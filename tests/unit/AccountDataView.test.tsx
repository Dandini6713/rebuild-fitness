import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import {
  AccountDataView,
  type AccountDataViewProps,
} from '@/features/account/AccountDataView';

function props(
  overrides: Partial<AccountDataViewProps> = {},
): AccountDataViewProps {
  return {
    deletionState: { status: 'idle' },
    exportState: { status: 'idle' },
    onCancelDeletion: jest.fn(),
    onConfirmDeletion: jest.fn(),
    onGenerateExport: jest.fn(),
    onShareExport: jest.fn(),
    onStartDeletion: jest.fn(),
    ...overrides,
  };
}

describe('AccountDataView — export', () => {
  it('offers to prepare an export from idle', async () => {
    const onGenerateExport = jest.fn();
    const { findByText } = await render(
      <AccountDataView {...props({ onGenerateExport })} />,
    );
    fireEvent.press(await findByText('Prepare my data export'));
    expect(onGenerateExport).toHaveBeenCalled();
  });

  it('shows the generating state', async () => {
    const { findByText } = await render(
      <AccountDataView {...props({ exportState: { status: 'generating' } })} />,
    );
    expect(await findByText('Preparing your export…')).toBeTruthy();
  });

  it('shares the prepared export', async () => {
    const onShareExport = jest.fn();
    const { findByText } = await render(
      <AccountDataView
        {...props({
          exportState: {
            filename: 'rebuild-export-2026-07-14.json',
            json: '{"a":1}',
            status: 'ready',
          },
          onShareExport,
        })}
      />,
    );
    expect(await findByText(/Your export is ready/)).toBeTruthy();
    fireEvent.press(await findByText('Save or share'));
    expect(onShareExport).toHaveBeenCalledWith(
      '{"a":1}',
      'rebuild-export-2026-07-14.json',
    );
  });

  it('shows the offline state', async () => {
    const { findByText } = await render(
      <AccountDataView {...props({ exportState: { status: 'offline' } })} />,
    );
    // A specific line, so it is not confused with the "Offline" status badge.
    expect(
      await findByText('Reconnect and try again to prepare your export.'),
    ).toBeTruthy();
  });

  it('shows the error state with a retry', async () => {
    const onGenerateExport = jest.fn();
    const { findByText } = await render(
      <AccountDataView
        {...props({
          exportState: { message: 'Could not export', status: 'error' },
          onGenerateExport,
        })}
      />,
    );
    fireEvent.press(await findByText('Try again'));
    expect(onGenerateExport).toHaveBeenCalled();
  });
});

describe('AccountDataView — deletion', () => {
  it('starts the deletion flow from idle', async () => {
    const onStartDeletion = jest.fn();
    const { findByText } = await render(
      <AccountDataView {...props({ onStartDeletion })} />,
    );
    fireEvent.press(await findByText('Delete my account'));
    expect(onStartDeletion).toHaveBeenCalled();
  });

  it('requires re-entering the password and confirms with it', async () => {
    const onConfirmDeletion = jest.fn();
    const { findByText, findByLabelText } = await render(
      <AccountDataView
        {...props({
          deletionState: { busy: false, error: null, status: 'confirming' },
          onConfirmDeletion,
        })}
      />,
    );
    const field = await findByLabelText('Your password');
    fireEvent.changeText(field, 'my-password');
    // Wait for the controlled input to reflect the typed value before confirming, so the
    // press reads the up-to-date password.
    await waitFor(() => expect(field.props.value).toBe('my-password'));
    fireEvent.press(await findByText('Permanently delete my account'));
    expect(onConfirmDeletion).toHaveBeenCalledWith('my-password');
  });

  it('can be cancelled from the confirmation', async () => {
    const onCancelDeletion = jest.fn();
    const { findByText } = await render(
      <AccountDataView
        {...props({
          deletionState: { busy: false, error: null, status: 'confirming' },
          onCancelDeletion,
        })}
      />,
    );
    fireEvent.press(await findByText('Cancel'));
    expect(onCancelDeletion).toHaveBeenCalled();
  });

  it('surfaces a failed re-authentication error in the confirmation', async () => {
    const { findByText } = await render(
      <AccountDataView
        {...props({
          deletionState: {
            busy: false,
            error: 'That password was not correct.',
            status: 'confirming',
          },
        })}
      />,
    );
    expect(await findByText('That password was not correct.')).toBeTruthy();
  });

  it('confirms the account has been deleted', async () => {
    const { findByText } = await render(
      <AccountDataView {...props({ deletionState: { status: 'deleted' } })} />,
    );
    expect(await findByText(/Your account has been deleted/)).toBeTruthy();
  });
});
