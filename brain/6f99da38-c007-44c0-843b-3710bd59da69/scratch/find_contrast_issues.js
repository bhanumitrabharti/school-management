const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('#ffffff') || line.includes('background') && (line.includes('white') || line.includes('#ffffff'))) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
