const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\index.html', 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('firebase') || line.includes('Firestore') || line.includes('src=')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
