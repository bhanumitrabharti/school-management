const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');

const lines = content.split('\n');
let openBraces = 0;
let funcLine = -1;
for (let i = 2564; i >= 0; i--) {
  if (lines[i].includes('function ') && !lines[i].includes('forEach')) {
    console.log(`Possible function declaration at line ${i+1}: ${lines[i].trim()}`);
    break;
  }
}
