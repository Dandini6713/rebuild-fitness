import {
  AppScreen,
  AppText,
  Card,
  SectionHeader,
  SecondaryButton,
} from '@/components/common';

export default function LogScreen() {
  return (
    <AppScreen eyebrow="Keep it honest, keep it useful" title="Log">
      <SectionHeader
        description="These controls are previews and do not save information."
        title="Add an entry"
      />
      {['Food', 'Lager or alcohol', 'Weight', 'Waist'].map((label) => (
        <Card key={label}>
          <AppText variant="heading">{label}</AppText>
          <SecondaryButton
            disabled
            label={`Log ${label.toLocaleLowerCase('en-GB')}`}
          />
        </Card>
      ))}
    </AppScreen>
  );
}
