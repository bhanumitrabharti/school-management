const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('renderTerm') || line.includes('status') || line.includes('Term')) {
    if (line.length < 150 && idx > 2000 && idx < 2400) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  }
});
