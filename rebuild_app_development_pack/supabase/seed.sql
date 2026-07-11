-- Rebuild reference seed data.
-- Replace :user_id and convert to an idempotent seed script in the application repository.

-- Exercise catalogue
insert into exercises (slug, name, category, movement_pattern, body_region, equipment, beginner_setup, execution_steps, common_mistakes, stop_criteria)
values
('leg-press','Leg press','strength','squat','lower_body','leg_press_machine','Adjust the seat so your knees are comfortably bent and both feet are flat.','Press through the whole foot without locking the knees. Return slowly.','Knees collapsing inwards, heels lifting, lowering too deeply.','Stop for sharp pain, loss of control or a sudden Achilles change.'),
('machine-chest-press','Machine chest press','strength','horizontal_push','upper_body','chest_press_machine','Set the seat so the handles are around mid-chest height.','Press forwards smoothly and return with control.','Shrugging shoulders, bouncing the weight, locking elbows.','Stop for sharp shoulder or chest pain.'),
('seated-cable-row','Seated cable row','strength','horizontal_pull','upper_body','cable_machine','Sit tall with feet supported and shoulders relaxed.','Pull elbows towards your sides, pause, then return slowly.','Leaning back excessively or shrugging.','Stop for sharp back or shoulder pain.'),
('dumbbell-rdl','Dumbbell Romanian deadlift','strength','hinge','lower_body','dumbbells','Hold dumbbells by your thighs, soften the knees and keep the back neutral.','Push hips backwards until the hamstrings feel loaded, then stand tall.','Squatting the movement or rounding the back.','Stop for sharp back, hamstring or Achilles pain.'),
('standing-calf-raise','Standing calf raise','strength','calf_raise','lower_body','bodyweight_or_machine','Stand near support with feet parallel.','Rise through the forefoot, pause, and lower slowly.','Bouncing, rolling ankles, using momentum.','Stop for sharp Achilles pain or sudden loss of strength.'),
('dead-bug','Dead bug','core','anti_extension','core','mat','Lie on your back with hips and knees bent and arms raised.','Lower opposite arm and leg while keeping the lower back controlled.','Arching the lower back or moving too quickly.','Stop for back pain.'),
('low-step-up','Low step-up','strength','single_leg','lower_body','low_step','Use a low stable step and nearby support.','Place the whole foot on the step and stand using the lead leg.','Pushing excessively from the trailing foot or knee collapse.','Stop for sharp knee or Achilles pain.'),
('lat-pulldown','Lat pulldown','strength','vertical_pull','upper_body','lat_pulldown_machine','Set the thigh pad securely and take a comfortable grip.','Pull the bar towards the upper chest, then return slowly.','Pulling behind the neck or swinging.','Stop for sharp shoulder pain.'),
('machine-shoulder-press','Machine shoulder press','strength','vertical_push','upper_body','shoulder_press_machine','Set the seat so the handles start around shoulder height.','Press overhead without arching the lower back.','Shrugging or forcing an uncomfortable depth.','Stop for sharp shoulder pain.'),
('glute-bridge','Glute bridge','strength','hip_extension','lower_body','mat','Lie on your back with feet flat and knees bent.','Drive through the feet and squeeze the glutes, then lower slowly.','Overarching the lower back.','Stop for sharp back or hamstring pain.'),
('seated-calf-raise','Seated calf raise','strength','calf_raise','lower_body','machine_or_dumbbell','Sit with knees bent and feet flat, load above the knees if appropriate.','Raise the heels, pause, and lower slowly.','Bouncing or allowing ankles to roll.','Stop for sharp Achilles pain.'),
('farmer-carry','Farmer carry','strength','carry','full_body','dumbbells','Stand tall holding dumbbells at the sides.','Walk slowly with ribs stacked and shoulders relaxed.','Leaning, rushing or gripping beyond control.','Stop for dizziness or sharp pain.')
on conflict (slug) do nothing;

-- Private starting templates and schedule should be inserted by an authenticated server-side seed function
-- so that every user-owned row receives the correct :user_id.

-- Strength A
-- 1 Leg press, 2 x 8-12
-- 2 Machine chest press, 2 x 8-12
-- 3 Seated cable row, 2 x 8-12
-- 4 Dumbbell Romanian deadlift, 2 x 8-12
-- 5 Standing calf raise, 3 x 10-15
-- 6 Dead bug, 2 x 6-10 per side

-- Strength B
-- 1 Low step-up, 2 x 8 per side
-- 2 Lat pulldown, 2 x 8-12
-- 3 Machine shoulder press, 2 x 8-12
-- 4 Glute bridge, 2 x 10-15
-- 5 Seated calf raise, 3 x 10-15
-- 6 Farmer carry, 2 x 30-45 seconds

-- Initial weekly pattern
-- Monday: Strength A
-- Tuesday: 30-40 minute brisk walk, bike or cross-trainer
-- Wednesday: Achilles strength and mobility
-- Thursday: Strength B
-- Friday: 25-35 minute walk or later run-walk
-- Saturday: longer walk or second cardio session
-- Sunday: rest
