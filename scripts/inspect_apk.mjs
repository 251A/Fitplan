import fs from 'fs';

const buf = fs.readFileSync('lib/arm64-v8a/libapp.so');
const text = buf.toString('latin1');

// Check predefined_workout_plans or exercise json in assets or binary
console.log('Searching for exercise ID samples and set fields...');
const idMatches = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
console.log('UUID count in libapp.so:', idMatches.length, 'sample:', idMatches.slice(0, 5));

// Check predefined workout plan templates JSON in assets!
if (fs.existsSync('assets/flutter_assets/assets/workout_plan_templates/predefined_workout_plans_v2_example.json')) {
  const example = fs.readFileSync('assets/flutter_assets/assets/workout_plan_templates/predefined_workout_plans_v2_example.json', 'utf8');
  console.log('--- SAMPLE FROM ASSETS ---');
  console.log(example.slice(0, 1000));
}





































