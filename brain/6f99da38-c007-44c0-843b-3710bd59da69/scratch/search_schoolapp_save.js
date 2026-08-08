const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\app.js', 'utf8');

const lines = content.split('\n');
let start = -1;
lines.forEach((line, idx) => {
  if (line.includes('save: function') || line.includes('save: async function') || line.includes('save:')) {
    if (line.includes('function') && line.length < 100) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  }
});
