const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = [
  'js/app.js',
  'js/exams.js', 
  'js/admin.js',
  'js/teachers.js',
  'js/fees.js',
  'js/accounts.js',
  'js/attendance.js',
  'js/students.js',
  'js/documents.js',
  'js/timetable.js',
  'js/super-admin.js'
];

let hasError = false;

console.log('--- Validating JavaScript Syntax ---');
files.forEach(f => {
  try {
    const code = fs.readFileSync(path.join(__dirname, f), 'utf-8');
    const sanitizedCode = code.split(/\r?\n/).map(l => l.replace(/^\s*(import|export)\s+.*/, '// $&')).join('\n');
    new vm.Script(sanitizedCode, { filename: f });
    console.log('✅ ' + f);
  } catch(e) {
    console.error('❌ ' + f + ': ' + e.message);
    if (e.stack) {
      console.error(e.stack.split('\n')[0]);
    }
    hasError = true;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache-Busting & Version Integrity Check
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- Checking Version and Cache-Busting Tags ---');
const versionJsonPath = path.join(__dirname, 'version.json');
if (!fs.existsSync(versionJsonPath)) {
  console.error('❌ version.json missing!');
  hasError = true;
} else {
  let expectedVersion;
  try {
    const vData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
    expectedVersion = vData.version;
    if (!expectedVersion) throw new Error('Missing "version" field');
    console.log(`✅ version.json specifies: ${expectedVersion}`);
  } catch (err) {
    console.error('❌ Failed parsing version.json:', err.message);
    hasError = true;
  }

  if (expectedVersion) {
    // 1. Check all HTML files for ?v= tags
    const htmlFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));
    htmlFiles.forEach(file => {
      const fullPath = path.join(__dirname, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const regex = /\?+v=([^"'\s>&]+)/g;
      let match;
      let fileMatchCount = 0;
      while ((match = regex.exec(content)) !== null) {
        fileMatchCount++;
        const foundVersion = match[1];
        if (foundVersion !== expectedVersion) {
          console.error(`❌ ${file}: Stale cache-busting tag "?v=${foundVersion}" found (expected "?v=${expectedVersion}")`);
          hasError = true;
        }
      }
      if (fileMatchCount > 0) {
        console.log(`✅ ${file}: Checked ${fileMatchCount} cache-busting tags (all match ${expectedVersion})`);
      }
    });

    // 2. Check sw.js BUILD_VERSION
    const swPath = path.join(__dirname, 'sw.js');
    if (fs.existsSync(swPath)) {
      const swContent = fs.readFileSync(swPath, 'utf-8');
      const swMatch = swContent.match(/const\s+BUILD_VERSION\s*=\s*['"]([^'"]+)['"]/);
      if (!swMatch || swMatch[1] !== expectedVersion) {
        console.error(`❌ sw.js BUILD_VERSION is "${swMatch ? swMatch[1] : 'NOT FOUND'}" (expected "${expectedVersion}")`);
        hasError = true;
      } else {
        console.log(`✅ sw.js: BUILD_VERSION matches ${expectedVersion}`);
      }
    }

    // 3. Check js/app.js APP_VERSION fallback
    const appJsPath = path.join(__dirname, 'js/app.js');
    if (fs.existsSync(appJsPath)) {
      const appJsContent = fs.readFileSync(appJsPath, 'utf-8');
      const appMatch = appJsContent.match(/window\.APP_VERSION\s*=\s*window\.APP_VERSION\s*\|\|\s*['"]([^'"]+)['"]/);
      if (!appMatch || appMatch[1] !== expectedVersion) {
        console.error(`❌ js/app.js APP_VERSION fallback is "${appMatch ? appMatch[1] : 'NOT FOUND'}" (expected "${expectedVersion}")`);
        hasError = true;
      } else {
        console.log(`✅ js/app.js: window.APP_VERSION fallback matches ${expectedVersion}`);
      }
    }

    // 4. Strict check: Fail on ANY hard-coded vNN in specified files that does not match version.json
    console.log('\n--- Checking for Stale Hard-Coded Version Strings (vNN) ---');
    const specificScanFiles = [
      'index.html',
      'parents.html',
      'register.html',
      'super-admin.html',
      'sw.js',
      ...fs.readdirSync(path.join(__dirname, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f)
    ];

    const vPattern = /\bv\d{2,}\b/gi;
    let staleCount = 0;
    specificScanFiles.forEach(relPath => {
      const fullPath = path.join(__dirname, relPath);
      if (!fs.existsSync(fullPath)) return;
      const fileText = fs.readFileSync(fullPath, 'utf-8');
      const lines = fileText.split(/\r?\n/);
      lines.forEach((line, idx) => {
        let m;
        vPattern.lastIndex = 0;
        while ((m = vPattern.exec(line)) !== null) {
          if (m[0].toLowerCase() !== expectedVersion.toLowerCase()) {
            console.error(`❌ ${relPath}:${idx + 1}: Found hard-coded "${m[0]}" (expected "${expectedVersion}")`);
            console.error(`   Line: ${line.trim()}`);
            hasError = true;
            staleCount++;
          }
        }
      });
    });
    if (staleCount === 0) {
      console.log(`✅ All scanned files contain zero stale hard-coded vNN strings (all match ${expectedVersion})`);
    }
  }
}

if (hasError) {
  process.exit(1);
}
