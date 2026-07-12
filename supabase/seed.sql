-- Rebuild reference seed data.
-- Replace :user_id and convert to an idempotent seed script in the application repository.

-- Exercise catalogue.
-- Each row carries the seven content fields the S-013 Exercise guide renders, in
-- section order: beginner_setup (equipment setup), starting_position, execution_steps
-- (movement), breathing, common_mistakes, stop_criteria and substitution_options
-- (approved alternatives). starting_position, breathing and substitution_options were
-- added in migration 20260712090000; the other four predate roadmap 10. Copy is
-- British English, assumes no prior gym knowledge, and never implies the app diagnoses
-- or treats injury (docs/07): stop_criteria is plain "stop and seek advice" guidance.
insert into exercises (slug, name, category, movement_pattern, body_region, equipment, beginner_setup, starting_position, execution_steps, breathing, common_mistakes, stop_criteria, substitution_options)
values
('leg-press','Leg press','strength','squat','lower_body','leg_press_machine','Adjust the seat so your knees are comfortably bent and both feet are flat.','Sit back with your whole back supported, feet flat on the platform about hip-width apart, with your knees pointing the same way as your toes.','Press through the whole foot without locking the knees. Return slowly.','Breathe in as you bend your knees and lower the platform, and breathe out as you press away. Never hold your breath.','Knees collapsing inwards, heels lifting, lowering too deeply.','Stop for sharp pain, loss of control or a sudden Achilles change.','If this machine is busy, any similar seated leg press works. With no machine, a sit-to-stand from a sturdy chair or a supported squat holding a rail trains the same movement.'),
('machine-chest-press','Machine chest press','strength','horizontal_push','upper_body','chest_press_machine','Set the seat so the handles are around mid-chest height.','Sit tall with your back against the pad, feet flat on the floor, and the handles level with the middle of your chest.','Press forwards smoothly and return with control.','Breathe out as you press the handles forwards and breathe in as you bring them back.','Shrugging shoulders, bouncing the weight, locking elbows.','Stop for sharp shoulder or chest pain.','A press-up against a wall or a raised bench trains the same pushing movement. Dumbbell or cable chest presses are also suitable alternatives.'),
('seated-cable-row','Seated cable row','strength','horizontal_pull','upper_body','cable_machine','Sit tall with feet supported and shoulders relaxed.','Sit tall with a slight bend in your knees, feet on the supports, holding the handle with your arms straight and shoulders relaxed.','Pull elbows towards your sides, pause, then return slowly.','Breathe out as you draw the handle towards you and breathe in as you return it.','Leaning back excessively or shrugging.','Stop for sharp back or shoulder pain.','A resistance-band row anchored at waist height, or a dumbbell row with one hand supported on a bench, works the same pulling pattern.'),
('dumbbell-rdl','Dumbbell Romanian deadlift','strength','hinge','lower_body','dumbbells','Hold dumbbells by your thighs, soften the knees and keep the back neutral.','Stand tall with feet hip-width apart, a dumbbell in each hand resting against the front of your thighs, and a soft bend in your knees.','Push hips backwards until the hamstrings feel loaded, then stand tall.','Breathe in as you push your hips back and lower, and breathe out as you stand tall.','Squatting the movement or rounding the back.','Stop for sharp back, hamstring or Achilles pain.','A hip hinge with a single dumbbell or kettlebell, or a back-supported hip bridge, offers a gentler way to train the same pattern.'),
('standing-calf-raise','Standing calf raise','strength','calf_raise','lower_body','bodyweight_or_machine','Stand near support with feet parallel.','Stand tall next to a rail or wall for balance, feet parallel and about hip-width apart, weight through the balls of your feet.','Rise through the forefoot, pause, and lower slowly.','Breathe out as you rise onto your toes and breathe in as you lower with control.','Bouncing, rolling ankles, using momentum.','Stop for sharp Achilles pain or sudden loss of strength.','A seated calf raise, or a two-footed heel raise holding a rail, is a suitable alternative if balance is a concern.'),
('dead-bug','Dead bug','core','anti_extension','core','mat','Lie on your back with hips and knees bent and arms raised.','Lie on your back with your knees bent above your hips, shins level, and both arms reaching towards the ceiling. Press your lower back gently into the floor.','Lower opposite arm and leg while keeping the lower back controlled.','Breathe out slowly as you lower an arm and the opposite leg, and breathe in as you return to the start.','Arching the lower back or moving too quickly.','Stop for back pain.','A simple heel slide, or holding the start position while breathing steadily, is a gentler option that trains the same core control.'),
('low-step-up','Low step-up','strength','single_leg','lower_body','low_step','Use a low stable step and nearby support.','Stand facing a low, stable step with a rail or wall within reach, and place one whole foot flat on the step.','Place the whole foot on the step and stand using the lead leg.','Breathe out as you step up and breathe in as you lower back down with control.','Pushing excessively from the trailing foot or knee collapse.','Stop for sharp knee or Achilles pain.','A sit-to-stand from a chair, or a shallower step, works the same single-leg pattern. Lower the step height if balance is a concern.'),
('lat-pulldown','Lat pulldown','strength','vertical_pull','upper_body','lat_pulldown_machine','Set the thigh pad securely and take a comfortable grip.','Sit with the thigh pad set snugly and feet flat on the floor, holding the bar with your arms straight and shoulders relaxed.','Pull the bar towards the upper chest, then return slowly.','Breathe out as you draw the bar down to your upper chest and breathe in as you let it rise.','Pulling behind the neck or swinging.','Stop for sharp shoulder pain.','A resistance-band pulldown anchored above head height, or an assisted pulldown machine, trains the same downward pull.'),
('machine-shoulder-press','Machine shoulder press','strength','vertical_push','upper_body','shoulder_press_machine','Set the seat so the handles start around shoulder height.','Sit tall with your back supported and feet flat on the floor, with the handles starting around shoulder height.','Press overhead without arching the lower back.','Breathe out as you press overhead and breathe in as you lower the handles.','Shrugging or forcing an uncomfortable depth.','Stop for sharp shoulder pain.','A seated dumbbell shoulder press, or a resistance-band press, works the same overhead movement with a lighter load.'),
('glute-bridge','Glute bridge','strength','hip_extension','lower_body','mat','Lie on your back with feet flat and knees bent.','Lie on your back with your knees bent, feet flat and about hip-width apart, and your arms resting by your sides.','Drive through the feet and squeeze the glutes, then lower slowly.','Breathe out as you lift your hips and breathe in as you lower them.','Overarching the lower back.','Stop for sharp back or hamstring pain.','A single-leg glute bridge progresses the movement, while a smaller lift or a supported bridge makes it gentler.'),
('seated-calf-raise','Seated calf raise','strength','calf_raise','lower_body','machine_or_dumbbell','Sit with knees bent and feet flat, load above the knees if appropriate.','Sit with your knees bent and the balls of your feet on the platform, with any load resting comfortably above your knees.','Raise the heels, pause, and lower slowly.','Breathe out as you raise your heels and breathe in as you lower them slowly.','Bouncing or allowing ankles to roll.','Stop for sharp Achilles pain.','A standing calf raise holding a rail, or a two-footed heel raise, is a suitable alternative.'),
('farmer-carry','Farmer carry','strength','carry','full_body','dumbbells','Stand tall holding dumbbells at the sides.','Stand tall holding a dumbbell in each hand at your sides, with your shoulders relaxed and ribs stacked over your hips.','Walk slowly with ribs stacked and shoulders relaxed.','Breathe steadily and evenly throughout. Avoid holding your breath while you walk.','Leaning, rushing or gripping beyond control.','Stop for dizziness or sharp pain.','A shorter carry, a lighter load, or a stationary suitcase hold on each side offers a gentler version of the same exercise.')
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
