const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('firestore') || line.includes('db') || line.includes('collection') || line.includes('onSnapshot') || line.includes('setDoc') || line.includes('updateDoc')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
