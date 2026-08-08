const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = [
  'js/app.js',
  'js/exams.js', 
  'js/admin.js',
  'js/teachers.js',
  'js/fees.js',
  'js/attendance.js',
  'js/students.js'
];

let hasError = false;

files.forEach(f => {
  try {
    const code = fs.readFileSync(path.join(__dirname, f), 'utf-8');
    const sanitizedCode = code.replace(/^\s*(import|export)\s+.*/gm, '// $&');
    new vm.Script(sanitizedCode, { filename: f });
    console.log('✅ ' + f);
  } catch(e) {
    console.error('❌ ' + f + ': ' + e.message);
    if (e.stack) {
      console.error(e.stack.split('\n')[0]);
    }
    hasError = true;
  }
});

if (hasError) {
  process.exit(1);
}
