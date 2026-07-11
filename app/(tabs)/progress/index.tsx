import {
  AppScreen,
  Card,
  ProgressBar,
  SectionHeader,
  StatusBadge,
} from '@/components/common';

export default function ProgressScreen() {
  return (
    <AppScreen eyebrow="Trends, not judgement" title="Progress">
      <SectionHeader
        description="Real trends will appear once enough information has been logged."
        title="Twelve-week view"
      />
      <Card>
        <StatusBadge label="Example only" />
        <SectionHeader
          description="Four of five planned sessions"
          title="Weekly consistency"
        />
        <ProgressBar
          accessibilityLabel="Example weekly consistency"
          value={80}
        />
      </Card>
    </AppScreen>
  );
}
