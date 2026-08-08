const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\teachers.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('SchoolApp.showModal')) {
    console.log(`${idx + 1}: ${line.trim()}`);
    // print surrounding lines
    for (let i = Math.max(0, idx - 5); i < Math.min(lines.length, idx + 10); i++) {
      console.log(`  ${i + 1}: ${lines[i]}`);
    }
  }
});
