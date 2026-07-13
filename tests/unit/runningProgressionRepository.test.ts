import { describe, expect, it } from '@jest/globals';

import type { ReadinessResponse } from '@/domain/training/runningProgression';
import {
  createRunningProgressionRepository,
  type RunningProgressionBackend,
  type RunningProposalRow,
} from '@/features/running/runningProgressionRepository';

// A stand-in for the Supabase backend. It records inserted proposals and decisions
// so the evaluate-then-store and surfacing behaviour can be proven without a
// database, mirroring the cardio/workout repository tests.
function createFake(
  options: {
    latestProposal?: {
      id: string;
      decision: 'advance' | 'repeat' | 'regress' | 'pause';
      fromStageNumber: number;
      toStageNumber: number;
      planWeekId: string | null;
      reasons: { code: string; message: string }[];
    } | null;
    stage?: {
      templateId: string;
      templateName: string;
      stageNumber: number;
      requiredSessions: number;
      planWeekId: string | null;
    } | null;
    efforts?: (number | null)[];
    scheduledSessionIds?: string[];
    readiness?: ReadinessResponse[];
    lowerBodyIncrease?: boolean;
    insertFails?: boolean;
  } = {},
) {
  const state = {
    decisions: [] as {
      proposalId: string;
      status: 'accepted' | 'dismissed';
    }[],
    inserted: [] as RunningProposalRow[],
  };

  const backend: RunningProgressionBackend = {
    async decideProposal({ proposalId, status }) {
      state.decisions.push({ proposalId, status });
      return { error: null };
    },
    async fetchCurrentStage() {
      return { data: options.stage ?? null, error: null };
    },
    async fetchLatestProposal() {
      return { data: options.latestProposal ?? null, error: null };
    },
    async fetchLowerBodyIncreaseInWeek() {
      return { data: options.lowerBodyIncrease ?? false, error: null };
    },
    async fetchReadiness() {
      return { data: options.readiness ?? [], error: null };
    },
    async fetchStageSessions() {
      return {
        data: {
          efforts: options.efforts ?? [],
          scheduledSessionIds: options.scheduledSessionIds ?? [],
        },
        error: null,
      };
    },
    async insertProposal(row) {
      if (options.insertFails) {
        return { data: null, error: { message: 'boom' } };
      }
      state.inserted.push(row);
      return { data: { id: 'new-proposal' }, error: null };
    },
  };

  return { backend, state };
}

const greenPre = (): ReadinessResponse => ({
  level: 'green',
  phase: 'pre_session',
});

const advanceStage = {
  planWeekId: 'week-1',
  requiredSessions: 2,
  stageNumber: 3,
  templateId: 'ct-3',
  templateName: 'Run-walk stage 3',
};

describe('running progression repository — evaluate and store', () => {
  it('evaluates the current stage, stores one proposal and surfaces it', async () => {
    const { backend, state } = createFake({
      efforts: [6, 7],
      readiness: [greenPre(), greenPre()],
      scheduledSessionIds: ['s1', 's2'],
      stage: advanceStage,
    });
    const repo = createRunningProgressionRepository({ backend });

    const result = await repo.loadProposal({
      nowIso: '2026-07-13T09:00:00.000Z',
      userId: 'u1',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.proposal.decision).toBe('advance');
    expect(result.proposal.toStageNumber).toBe(4);
    expect(result.proposal.id).toBe('new-proposal');
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]?.decision).toBe('advance');
  });

  it('reports no-programme when the user has no run-walk stage', async () => {
    const { backend } = createFake({ stage: null });
    const repo = createRunningProgressionRepository({ backend });
    const result = await repo.loadProposal({
      nowIso: '2026-07-13T09:00:00.000Z',
      userId: 'u1',
    });
    expect(result.status).toBe('no-programme');
  });

  it('surfaces an existing pending proposal without storing a new one', async () => {
    const { backend, state } = createFake({
      latestProposal: {
        decision: 'repeat',
        fromStageNumber: 2,
        id: 'existing',
        planWeekId: null,
        reasons: [
          { code: 'sessions-incomplete', message: 'Repeat this stage.' },
        ],
        toStageNumber: 2,
      },
      stage: advanceStage,
    });
    const repo = createRunningProgressionRepository({ backend });
    const result = await repo.loadProposal({
      nowIso: '2026-07-13T09:00:00.000Z',
      userId: 'u1',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.proposal.id).toBe('existing');
    expect(result.proposal.decision).toBe('repeat');
    // No fresh evaluation happened.
    expect(state.inserted).toHaveLength(0);
  });
});

describe('running progression repository — same-week volume warning (docs/06 §6.5)', () => {
  it('shows the volume warning when an advance coincides with a lower-body increase', async () => {
    const { backend } = createFake({
      efforts: [6, 7],
      lowerBodyIncrease: true,
      readiness: [greenPre(), greenPre()],
      scheduledSessionIds: ['s1', 's2'],
      stage: advanceStage,
    });
    const repo = createRunningProgressionRepository({ backend });
    const result = await repo.loadProposal({
      nowIso: '2026-07-13T09:00:00.000Z',
      userId: 'u1',
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.proposal.decision).toBe('advance');
    expect(result.proposal.volumeWarning).not.toBeNull();
  });

  it('shows no volume warning when there is no lower-body increase that week', async () => {
    const { backend } = createFake({
      efforts: [6, 7],
      lowerBodyIncrease: false,
      readiness: [greenPre(), greenPre()],
      scheduledSessionIds: ['s1', 's2'],
      stage: advanceStage,
    });
    const repo = createRunningProgressionRepository({ backend });
    const result = await repo.loadProposal({
      nowIso: '2026-07-13T09:00:00.000Z',
      userId: 'u1',
    });
    if (result.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(result.proposal.volumeWarning).toBeNull();
  });

  it('shows no volume warning when the decision is not an advance, even with a lower-body increase', async () => {
    const { backend } = createFake({
      efforts: [6], // one session, not enough — repeats
      lowerBodyIncrease: true,
      readiness: [greenPre()],
      scheduledSessionIds: ['s1'],
      stage: advanceStage,
    });
    const repo = createRunningProgressionRepository({ backend });
    const result = await repo.loadProposal({
      nowIso: '2026-07-13T09:00:00.000Z',
      userId: 'u1',
    });
    if (result.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(result.proposal.decision).toBe('repeat');
    expect(result.proposal.volumeWarning).toBeNull();
  });
});

describe('running progression repository — decisions', () => {
  it('records an acceptance', async () => {
    const { backend, state } = createFake();
    const repo = createRunningProgressionRepository({ backend });
    const result = await repo.decideProposal({
      decidedAtIso: '2026-07-13T09:00:00.000Z',
      proposalId: 'p1',
      status: 'accepted',
      userId: 'u1',
    });
    expect(result.ok).toBe(true);
    expect(state.decisions).toEqual([{ proposalId: 'p1', status: 'accepted' }]);
  });
});
