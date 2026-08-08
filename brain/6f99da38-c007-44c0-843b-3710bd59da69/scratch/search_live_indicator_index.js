const fs = require('fs');
const contentIndex = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\index.html', 'utf8');

const lines = contentIndex.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('live-indicator')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
