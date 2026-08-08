const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('marks') || line.includes('save') || line.includes('input') || line.includes('blur')) {
    if (line.includes('save') || line.includes('blur') || line.includes('inputmode') || line.includes('marksTable') || line.includes('marks-cell')) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  }
});
