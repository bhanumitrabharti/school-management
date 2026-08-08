const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');
const lines = content.split('\n');
let countMarks = 0;
let countExamMarks = 0;
lines.forEach((line, idx) => {
  if (line.includes('store.marks')) {
    countMarks++;
  }
  if (line.includes('store.examMarks')) {
    countExamMarks++;
  }
});
console.log(`store.marks count: ${countMarks}`);
console.log(`store.examMarks count: ${countExamMarks}`);
