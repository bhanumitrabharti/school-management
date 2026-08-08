const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('store.marks') || line.includes('store.examMarks')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
