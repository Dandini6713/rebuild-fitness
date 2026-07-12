import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { AppScreen, SecondaryButton, StatusBadge } from '@/components/common';
import { ReadinessFormView } from '@/features/readiness/ReadinessFormView';
import { ReadinessResultView } from '@/features/readiness/ReadinessResultView';
import { useReadiness } from '@/features/readiness/useReadiness';
import type { CheckinType } from '@/features/readiness/readinessSchema';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 13, S-011/S-015: the readiness check-in form and its honest result
// acknowledgement. This is a standalone entry (reached from Today) so a user can
// record a pre-session, post-session or next-morning check. It deliberately does NOT
// gate the session-start flow — enforcing that a red result blocks a session from
// starting is roadmap 14. Offline answers are held on the device and submitted when
// the connection returns (the form owns local-first persistence via useReadiness).
const CHECKIN_TYPES: readonly CheckinType[] = [
  'pre_session',
  'post_session',
  'next_morning',
];

function resolveCheckinType(raw: string | undefined): CheckinType {
  return raw && (CHECKIN_TYPES as readonly string[]).includes(raw)
    ? (raw as CheckinType)
    : 'pre_session';
}

export default function ReadinessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    type?: string;
    sessionId?: string;
    offerNextMorning?: string;
  }>();
  const checkinType = resolveCheckinType(
    typeof params.type === 'string' ? params.type : undefined,
  );
  const scheduledSessionId =
    typeof params.sessionId === 'string' && params.sessionId.length > 0
      ? params.sessionId
      : null;
  const offerNextMorning = params.offerNextMorning === 'true';

  const { state, submit, retryHeld, reset } = useReadiness(checkinType, {
    scheduledSessionId,
  });
  const { isOffline } = useNetworkStatus();

  // Replay any held submission once the connection returns.
  const wasOffline = useRef(isOffline);
  useEffect(() => {
    if (wasOffline.current && !isOffline) {
      retryHeld();
    }
    wasOffline.current = isOffline;
  }, [isOffline, retryHeld]);

  const eyebrow =
    checkinType === 'post_session'
      ? 'After your session'
      : 'Before your session';

  return (
    <AppScreen eyebrow={eyebrow} title="Readiness check">
      {isOffline ? (
        <StatusBadge
          label="Offline — your answers are saved on this device"
          tone="info"
        />
      ) : null}
      {state.status === 'form' ? (
        <>
          <ReadinessFormView
            offerNextMorning={offerNextMorning}
            onSubmit={submit}
            submitting={false}
            variant={checkinType}
          />
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </>
      ) : (
        <ReadinessResultView
          onDone={() => router.back()}
          onReset={reset}
          state={state}
        />
      )}
    </AppScreen>
  );
}
