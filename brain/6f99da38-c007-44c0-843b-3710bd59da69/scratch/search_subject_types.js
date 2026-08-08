const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('type') && (line.includes('Theory') || line.includes('Practical') || line.includes('option'))) {
    if (line.length < 150 && idx > 2300 && idx < 2600) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  }
});
