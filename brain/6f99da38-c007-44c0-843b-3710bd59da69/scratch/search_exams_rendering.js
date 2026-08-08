const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\exams.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('state.examTerm') || line.includes('renderMarksGrid') || line.includes('marks-grid') || line.includes('marks entry table') || line.includes('class="card-header"')) {
    if (line.includes('html +=') || line.includes('function') || line.includes('render')) {
      if (line.length < 150) {
        console.log(`${idx + 1}: ${line.trim()}`);
      }
    }
  }
});
