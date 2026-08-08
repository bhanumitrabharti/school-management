const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('saveMark') || line.includes('change') || line.includes('blur') || line.includes('input') || line.includes('onchange') || line.includes('keydown')) {
    if (line.includes('marks') || line.includes('input') || line.includes('entry') || line.includes('save')) {
      if (line.length < 150) {
        console.log(`${idx + 1}: ${line.trim()}`);
      }
    }
  }
});
