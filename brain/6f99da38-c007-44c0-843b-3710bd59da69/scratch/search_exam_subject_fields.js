const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('subjects.push') || line.includes('subjectsList.push') || line.includes('fullMarks') || line.includes('passMarks')) {
    if (line.length < 150 && idx > 2300 && idx < 2600) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  }
});
