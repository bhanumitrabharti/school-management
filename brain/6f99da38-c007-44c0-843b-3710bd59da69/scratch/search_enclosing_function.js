const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');

const lines = content.split('\n');
let funcName = '';
for (let i = 2550; i >= 0; i--) {
  if (lines[i].includes('function ') && (lines[i].includes('render') || lines[i].includes('bind') || lines[i].includes('setup'))) {
    funcName = lines[i].trim();
    console.log(`Enclosing function is at line ${i+1}: ${funcName}`);
    break;
  }
}
