const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\css\\styles.css', 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('pulse-dot') || line.includes('live-indicator')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
