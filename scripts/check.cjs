'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { render, root } = require('./build.cjs');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.equal(html, render(), 'index.html differs from source; run the build');
for (const m of html.matchAll(/<(script|style)>([\s\S]*?)<\/\1>/g)) assert.ok(html.includes("'sha256-" + crypto.createHash('sha256').update(m[2].replace(/\r\n?/g, '\n')).digest('base64') + "'"), 'CSP mismatch');
assert.ok(!/<(?:script|link|img|iframe|audio|video|source)\b[^>]*(?:src|href)=/i.test(html));
assert.ok(!/\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|getUserMedia|MediaRecorder|eval\s*\(|new\s+Function\s*\()/.test(html));
assert.ok(!/https?:\/\/|@import|\son(?:click|error|load)\s*=|unsafe-inline|unsafe-eval/.test(html));
const allowed = new Set(['.gitignore', '.gitattributes', 'package.json', 'README.md', 'index.html', 'src/core.js', 'src/app.js', 'src/demo-data.json', 'src/style.css', 'src/template.html', 'scripts/build.cjs', 'scripts/check.cjs', 'test/core.test.cjs', 'test/ui.test.cjs']);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(!Object.prototype.hasOwnProperty.call(pkg, 'license'), 'An explicit package license was not requested');
const seen = [];
function walk(dir) { for (const ent of fs.readdirSync(dir, { withFileTypes: true })) { if (ent.name === '.git') continue; const full = path.join(dir, ent.name), rel = path.relative(root, full).split(path.sep).join('/'); assert.ok(!ent.isSymbolicLink(), 'No links allowed'); if (ent.isDirectory()) walk(full); else { assert.ok(allowed.has(rel), 'Unexpected file: ' + rel); seen.push(rel); const s = fs.readFileSync(full, 'utf8'); assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{20,}/.test(s), 'Possible credential in ' + rel); } } }
walk(root); for (const f of allowed) assert.ok(seen.includes(f), 'Missing: ' + f);
assert.ok(!/goetheSource|freeDictSourceGlosses|selectedPdfVocabulary|C:\\Users\\|C:\/Users\//.test(html), 'Private or legacy data');
console.log('PASS: reproducible standalone output, CSP, static network/device scan and repository allowlist (' + seen.length + ' files). Not a complete security or legal audit.');
