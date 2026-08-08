const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('function') && (line.includes('Marks') || line.includes('Table') || line.includes('save') || line.includes('Save') || line.includes('input') || line.includes('focus') || line.includes('keyboard') || line.includes('Arrow') || line.includes('navigation'))) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
