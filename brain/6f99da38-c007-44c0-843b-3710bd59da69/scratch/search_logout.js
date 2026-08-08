const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\app.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('logout') || line.includes('signOut') || line.includes('sign-out')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
