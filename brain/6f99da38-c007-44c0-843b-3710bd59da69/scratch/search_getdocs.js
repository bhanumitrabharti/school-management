const fs = require('fs');
const path = require('path');

const modules = ['students', 'teachers', 'attendance', 'fees', 'timetable', 'exams', 'admin'];

modules.forEach(m => {
  const fullPath = `C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management\\js\\${m}.js`;
  const content = fs.readFileSync(fullPath, 'utf8');
  
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('getDoc') || line.includes('getDocs') || line.includes('firestore.')) {
      console.log(`${m}.js line ${idx+1}: ${line.trim()}`);
    }
  });
});
