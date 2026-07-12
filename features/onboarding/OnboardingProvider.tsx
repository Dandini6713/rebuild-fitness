import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { resolvePlanStartDate } from '@/domain/training/planSchedule';
import { useAuth } from '@/features/auth/AuthProvider';
import { defaultPlanRepository } from '@/features/plan/defaultPlanRepository';
import type { PlanRepository } from '@/features/plan/planRepository';
import { supabase } from '@/lib/supabase';

import {
  EMPTY_DRAFT,
  isDraftComplete,
  type OnboardingDraft,
} from './onboardingDraft';
import type {
  AchillesData,
  AvailabilityData,
  GoalsData,
} from './onboardingModel';
import {
  createOnboardingRepository,
  createSupabaseOnboardingBackend,
  type OnboardingRepository,
  type SubmitResult,
} from './onboardingRepository';
import { onboardingStore, type OnboardingStore } from './onboardingStorage';
import {
  type OnboardingStepId,
  previousStepId,
  resolveResumeStep,
} from './onboardingSteps';

export type OnboardingFlowStatus =
  'loading' | 'required' | 'complete' | 'error';

type DataPatch = {
  achilles?: AchillesData;
  availability?: AvailabilityData;
  goals?: GoalsData;
};

type OnboardingContextValue = {
  currentStep: OnboardingStepId;
  draft: OnboardingDraft;
  goBack(): void;
  goTo(step: OnboardingStepId): void;
  saveStep(patch: DataPatch, advanceTo: OnboardingStepId): Promise<void>;
  status: OnboardingFlowStatus;
  submit(): Promise<SubmitResult>;
  submitting: boolean;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const defaultRepository: OnboardingRepository | null = supabase
  ? createOnboardingRepository(createSupabaseOnboardingBackend(supabase))
  : null;

type OnboardingProviderProps = PropsWithChildren<{
  now?: () => string;
  planRepository?: PlanRepository | null;
  repository?: OnboardingRepository | null;
  store?: OnboardingStore;
}>;

export function OnboardingProvider({
  children,
  now = () => new Date().toISOString(),
  planRepository = defaultPlanRepository,
  repository = defaultRepository,
  store = onboardingStore,
}: OnboardingProviderProps) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [currentStep, setCurrentStep] = useState<OnboardingStepId>('welcome');
  const [status, setStatus] = useState<OnboardingFlowStatus>('loading');
  const [submitting, setSubmitting] = useState(false);

  // Guards against a resolved load from a previous user overwriting state after
  // a fast sign-out/sign-in.
  const loadToken = useRef(0);

  useEffect(() => {
    const token = ++loadToken.current;
    let active = true;
    const isCurrent = () => active && token === loadToken.current;

    void (async () => {
      if (!userId) {
        if (isCurrent()) {
          setStatus('loading');
          setDraft(EMPTY_DRAFT);
          setCurrentStep('welcome');
        }
        return;
      }

      if (isCurrent()) {
        setStatus('loading');
      }

      const loaded = await store.load();
      if (!isCurrent()) {
        return;
      }
      setDraft(loaded);
      setCurrentStep(resolveResumeStep(loaded));

      if (isDraftComplete(loaded)) {
        setStatus('complete');
        return;
      }
      if (!repository) {
        setStatus('required');
        return;
      }

      const remote = await repository.fetchStatus(userId);
      if (!isCurrent()) {
        return;
      }
      // A remote "completed" means onboarding happened on another device; treat
      // it as complete so we don't ask again. If the check fails (e.g. offline)
      // we fall back to requiring onboarding, which the local draft can resume.
      setStatus(remote.success && remote.completed ? 'complete' : 'required');
    })();

    return () => {
      active = false;
    };
  }, [repository, store, userId]);

  const persist = useCallback(
    async (next: OnboardingDraft) => {
      setDraft(next);
      await store.save(next);
    },
    [store],
  );

  const goTo = useCallback(
    (step: OnboardingStepId) => {
      setCurrentStep(step);
      void persist({ ...draft, currentStepId: step });
    },
    [draft, persist],
  );

  const goBack = useCallback(() => {
    const previous = previousStepId(currentStep);
    if (previous) {
      goTo(previous);
    }
  }, [currentStep, goTo]);

  const saveStep = useCallback(
    async (patch: DataPatch, advanceTo: OnboardingStepId) => {
      const next: OnboardingDraft = {
        ...draft,
        ...patch,
        currentStepId: advanceTo,
      };
      setCurrentStep(advanceTo);
      await persist(next);
    },
    [draft, persist],
  );

  const submit = useCallback(async (): Promise<SubmitResult> => {
    if (!userId || !repository || !planRepository) {
      return {
        message: 'Setup is not available right now. Please try again later.',
        success: false,
      };
    }
    if (!draft.goals || !draft.achilles) {
      return {
        message: 'Some answers are missing. Please review the earlier steps.',
        success: false,
      };
    }

    setSubmitting(true);
    const completedAt = now();

    // Seed the private twelve-week plan first, so onboarding is only ever marked
    // complete once the plan exists. Seeding is idempotent, so a retry after a
    // later failure will not create a second plan. Onboarding availability sets
    // the start date; the schedule itself is fixed persona content (roadmap 06).
    const seeded = await planRepository.seedPrivatePlan({
      reset: false,
      startDate: resolvePlanStartDate(completedAt),
    });
    if (!seeded.success) {
      setSubmitting(false);
      return { message: seeded.message, success: false };
    }

    const result = await repository.submit({
      achilles: draft.achilles,
      completedAt,
      goals: draft.goals,
      userId,
    });

    if (result.success) {
      await persist({ ...draft, completedAt });
      setStatus('complete');
    }
    setSubmitting(false);
    return result;
  }, [draft, now, persist, planRepository, repository, userId]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      currentStep,
      draft,
      goBack,
      goTo,
      saveStep,
      status,
      submit,
      submitting,
    }),
    [currentStep, draft, goBack, goTo, saveStep, status, submit, submitting],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider.');
  }
  return context;
}
