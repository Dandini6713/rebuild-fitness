import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { AppScreen, SecondaryButton, StatusBadge } from '@/components/common';
import { ReadinessFormView } from '@/features/readiness/ReadinessFormView';
import {
  ReadinessResultView,
  type SubstitutionOffer,
} from '@/features/readiness/ReadinessResultView';
import { useReadiness } from '@/features/readiness/useReadiness';
import { useSessionSubstitution } from '@/features/readiness/useSessionSubstitution';
import type { CheckinType } from '@/features/readiness/readinessSchema';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 13/14/15, S-011/S-015: the readiness check-in form and its honest result
// acknowledgement. This is a standalone entry (reached from Today) so a user can record
// a pre-session, post-session or next-morning check. The red block that refuses a gated
// session start is server-enforced elsewhere (roadmap 14); here, an AMBER result for a
// session offers the activity substitution (roadmap 15, docs/06 §6.2) — swap the
// demanding session for flat walking, easy cycling, the cross-trainer or rest. Offline
// answers are held on the device and submitted on reconnect (the form owns local-first
// persistence via useReadiness); the swap itself is server-side and fails honestly
// offline rather than pretending it happened.
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
  const substitution = useSessionSubstitution({ scheduledSessionId });
  const { isOffline } = useNetworkStatus();

  // The amber activity-substitution offer is available only when this check is tied to
  // a session that can actually be swapped (docs/06 §6.2). A standalone check with no
  // session shows the amber result without the swap; the RPC is the real guard on which
  // sessions are substitutable. The check is reset alongside the readiness result.
  const substitutionOffer: SubstitutionOffer | undefined = scheduledSessionId
    ? {
        onReset: substitution.reset,
        onSelect: substitution.substitute,
        state: substitution.state,
      }
    : undefined;

  const handleReset = () => {
    substitution.reset();
    reset();
  };

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
          onReset={handleReset}
          state={state}
          {...(substitutionOffer ? { substitution: substitutionOffer } : {})}
        />
      )}
    </AppScreen>
  );
}
