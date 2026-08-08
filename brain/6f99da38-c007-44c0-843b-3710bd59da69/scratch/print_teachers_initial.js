const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\app.js', 'utf8');

// Search for teachers list in mock store or initial state
const lines = content.split('\n');
let print = false;
let brackets = 0;
lines.forEach((line, idx) => {
  if (line.includes('teachers: [') || line.includes('teachers = [')) {
    print = true;
    console.log(`Starting teachers array at line ${idx + 1}`);
  }
  if (print) {
    console.log(line);
    if (line.includes('[')) brackets++;
    if (line.includes(']')) brackets--;
    if (brackets === 0) {
      print = false;
    }
  }
});
