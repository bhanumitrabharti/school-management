const fs = require('fs');
const contentApp = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\app.js', 'utf8');
const contentIndex = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\index.html', 'utf8');

console.log("Searching in app.js:");
contentApp.split('\n').forEach((line, idx) => {
  if (line.includes('connection-status') || line.includes('online-status') || line.includes('ConnectionIndicator') || line.includes('Offline') || line.includes('online')) {
    if (line.length < 150) {
      console.log(`app.js ${idx + 1}: ${line.trim()}`);
    }
  }
});

console.log("Searching in index.html:");
contentIndex.split('\n').forEach((line, idx) => {
  if (line.includes('connection-status') || line.includes('online-status') || line.includes('status') || line.includes('Offline') || line.includes('online')) {
    if (line.length < 150) {
      console.log(`index.html ${idx + 1}: ${line.trim()}`);
    }
  }
});
