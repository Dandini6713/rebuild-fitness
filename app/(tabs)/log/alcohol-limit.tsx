import { useRouter } from 'expo-router';

import { AppScreen, SecondaryButton } from '@/components/common';
import { AlcoholLimitView } from '@/features/alcohol/AlcoholLimitView';
import { useAlcoholLimit } from '@/features/alcohol/useAlcoholLimit';

// Roadmap 20, docs/06 §6.9 / docs/07 §7.4: set the personal weekly unit limit. Stored on
// the caller's own profiles row (nullable — no invented default). It drives only the
// informational percentage-of-limit summary metric; it is never a cap or a warning. A
// plain owner-scoped update under RLS. The fuller settings surface is a noted seam.
export default function AlcoholLimitScreen() {
  const router = useRouter();
  const limit = useAlcoholLimit();

  return (
    <AppScreen eyebrow="Alcohol" title="Weekly limit">
      <AlcoholLimitView
        loadState={limit.loadState}
        onSave={limit.setLimit}
        saveState={limit.saveState}
      />
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </AppScreen>
  );
}
