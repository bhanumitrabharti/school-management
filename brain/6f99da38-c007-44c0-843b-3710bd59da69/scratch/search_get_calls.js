const fs = require('fs');
const path = require('path');

const rootDir = 'C:\\Users\\bhanu\\.gemini\\antigravity\\scratch\\school-management';
const keywords = ['getDoc', 'getDocs', 'get('];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'brain' && file !== 'scratch') {
        results = results.concat(walk(fullPath));
      }
    } else if (file.endsWith('.js') || file.endsWith('.html')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk(rootDir);
const matches = {};

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(rootDir, file);
  const lines = content.split('\n');
  
  lines.forEach((line, idx) => {
    keywords.forEach(keyword => {
      if (line.includes(keyword)) {
        if (!matches[relPath]) {
          matches[relPath] = [];
        }
        matches[relPath].push({
          lineNum: idx + 1,
          keyword: keyword,
          snippet: line.trim()
        });
      }
    });
  });
});

console.log(JSON.stringify(matches, null, 2));
