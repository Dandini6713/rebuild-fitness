# 9. Design System and Content Style

## 9.1 Design direction

Rebuild should feel calm, capable and adult. It should not resemble a bodybuilding forum, extreme transformation advert or clinical hospital portal.

Keywords:

- Clear
- Reassuring
- Practical
- Modern
- Uncluttered
- Honest

Avoid:

- Aggressive slogans
- Neon “gym” styling
- Before-and-after pressure
- Red warning colour for normal missed goals
- Dense dashboards full of performance jargon

## 9.2 Colour roles

Do not hard-code colour meaning in domain logic. Suggested roles:

- Primary: confident deep blue or green
- Surface: warm off-white and neutral greys
- Success: accessible green
- Caution: amber
- Safety stop: red
- Informational: blue

All text and controls must meet accessible contrast. Readiness status must include text and icon, not colour alone.

## 9.3 Typography

- Use the platform system font initially.
- Support Dynamic Type.
- Use a clear hierarchy with no more than four routine text styles per screen.
- Avoid long paragraphs during workouts.
- Use tabular numerals for timers and logged values.

## 9.4 Spacing and touch

- Minimum touch target: 44 by 44 points.
- Generous vertical spacing between workout controls.
- Primary actions remain reachable with one hand.
- Avoid tiny chart controls.

## 9.5 Core components

- Session card
- Metric progress card
- Readiness status panel
- Exercise card
- Set-entry row
- Timer control
- Measurement entry
- Weekly summary card
- Confirmation sheet
- Safety message panel
- Empty-state panel

Every component must define normal, pressed, disabled, loading and error states.

## 9.6 Chart rules

- Default to seven-day, four-week and twelve-week views.
- Show weight trend prominently and raw weight lightly.
- Label axes and units.
- Do not truncate the vertical axis in a misleading way.
- Explain missing data.
- Avoid celebratory or negative animations tied to weight alone.

## 9.7 Content style

Use British English and normal conversational wording.

Preferred:

- “Today’s session is Strength A. It should take about 40 minutes.”
- “Your Achilles check suggests using the bike today instead of running.”
- “There is not enough food logging to recommend a calorie change.”
- “You completed four of five planned sessions.”

Avoid:

- “Smash your goals.”
- “No excuses.”
- “Bad food.”
- “Cheat day.”
- “Torch those calories.”
- “Your tendon is safe.”

## 9.8 Accessibility

- Screen-reader labels for every value and control.
- Logical focus order.
- Text alternatives for exercise media.
- Haptic cues must also have visual and audio alternatives.
- Timers must be operable without relying on colour.
- Forms show errors next to the field and in an accessible summary.
- Do not require drag-and-drop; provide a button-based reschedule method.
