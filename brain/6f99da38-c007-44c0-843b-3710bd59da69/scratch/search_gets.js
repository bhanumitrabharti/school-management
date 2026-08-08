const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'brain') {
        searchDir(fullPath);
      }
    } else if (file.endsWith('.js') || file.endsWith('.html')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('getDoc') || content.includes('getDocs') || content.includes('.get')) {
        console.log(`Found get in: ${fullPath}`);
      }
    }
  });
}

searchDir('C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management');
