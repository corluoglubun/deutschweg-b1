'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
function boot(seed = {}, bundled = false) {
  const db = new Map(Object.entries(seed)), nodes = new Map(), handlers = {}, winHandlers = {};
  function node(key) { if (!nodes.has(key)) nodes.set(key, { innerHTML: '', textContent: '', value: '', checked: false, hidden: key === '#notice', dataset: {}, setAttribute() {}, appendChild() {}, remove() {}, click() {} }); return nodes.get(key); }
  const document = { querySelector: node, querySelectorAll: () => [], body: node('body'), createElement: k => node(k), addEventListener: (k, f) => handlers[k] = f };
  const storage = { getItem: k => db.get(k) ?? null, setItem: (k, v) => db.set(k, v), removeItem: k => db.delete(k) };
  const ctx = { console, Date, TextEncoder, Blob, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, setTimeout: () => 0, clearTimeout() {}, confirm: () => true, document, localStorage: storage, window: { scrollTo() {}, addEventListener: (k, f) => winHandlers[k] = f } };
  vm.createContext(ctx);
  if (bundled) {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length, 3);
    for (const match of scripts) vm.runInContext(match[1], ctx);
  } else {
    ctx.DeutschwegDemoData = JSON.parse(fs.readFileSync(path.join(root, 'src/demo-data.json'), 'utf8').replace(/^\uFEFF/, ''));
    for (const f of ['src/core.js', 'src/app.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
  }
  return { db, nodes, node, handlers, storage, winHandlers, click(action, arg = '') { handlers.click({ target: { closest: () => ({ dataset: { action, arg: String(arg) } }) } }); }, input(dataset, value) { handlers.input({ target: { dataset, value } }); }, state() { return JSON.parse(db.get('deutschweg-portfolio-v1')); } };
}
test('home, cards, paper draft reload, daily grades, history and lesson draft', () => {
  const b = boot(); assert.match(b.nodes.get('main').innerHTML, /Kelime günlerime/); b.click('nav', 'words'); assert.match(b.nodes.get('main').innerHTML, /Gün 2/);
  b.click('study', 1); b.click('flip'); b.click('rate', 'good'); assert.equal(b.state().cards[0].reviews, 1);
  b.click('daily', 1); b.input({ answer: '0' }, 'Notizblock'); assert.equal(b.state().active.answers[0], 'Notizblock');
  const c = boot(Object.fromEntries(b.db)); c.click('paper'); assert.match(c.nodes.get('main').innerHTML, /Notizblock/);
  const words = JSON.parse(fs.readFileSync(path.join(root, 'src/demo-data.json'), 'utf8').replace(/^\uFEFF/, '')).words;
  for (let i = 0; i < 15; i++) c.input({ answer: String(i) }, words[i].de);
  c.handlers.submit({ target: { id: 'paper' }, preventDefault() {} }); assert.equal(c.state().tests[0].grade, 1); assert.equal(c.state().active, null); assert.match(c.nodes.get('main').innerHTML, /İdeal yanıt/);
  c.click('nav', 'history'); assert.match(c.nodes.get('main').innerHTML, /Not 1/); c.click('nav', 'lessons'); c.input({ draft: '1' }, '<img onerror="test">'); c.click('nav', 'lessons'); assert.match(c.nodes.get('main').innerHTML, /&lt;img onerror=&quot;test&quot;&gt;/); c.click('lesson', '0:0'); assert.ok(c.state().lessonDone.includes(0));
});
test('import preview and pre-export confirmation; malformed import does not replace state', async () => {
  const b = boot(); b.click('lesson', '0:0'); const original = b.state(); const C = require('../src/core.js'), data = JSON.parse(fs.readFileSync(path.join(root, 'src/demo-data.json'), 'utf8').replace(/^\uFEFF/, ''));
  const replacement = C.empty(data.id); replacement.drafts[0] = 'Imported sample'; const text = C.exportBackup(replacement, data.id, 30);
  b.click('nav', 'backups'); await b.handlers.change({ target: { id: 'import', files: [{ size: text.length, text: async () => text }] } }); assert.deepEqual(b.state(), original);
  b.click('restore'); assert.deepEqual(b.state(), original); b.click('export'); b.node('#confirmed').checked = true; b.click('restore'); assert.equal(b.state().drafts[0], 'Imported sample');
  b.click('nav', 'backups'); const before = b.db.get(C.KEYS.main); await b.handlers.change({ target: { id: 'import', files: [{ size: 7, text: async () => '{broken' }] } }); assert.equal(b.db.get(C.KEYS.main), before); assert.match(b.nodes.get('#import-status').textContent, /Geçersiz/);
  let read = false; await b.handlers.change({ target: { id: 'import', files: [{ size: C.MAX_BYTES + 1, text: async () => { read = true; return ''; } }] } }); assert.equal(read, false);
});
test('main-save failure and cross-window conflict surface an automatic-save warning', () => { const b = boot(); b.storage.setItem = () => { throw Error('quota'); }; b.click('daily', 1); assert.equal(b.nodes.get('#notice').hidden, false); assert.match(b.nodes.get('#notice').textContent, /kayıt başarısız/); const c = boot(); c.winHandlers.storage({ key: null }); c.click('daily', 1); assert.equal(c.nodes.get('#notice').hidden, false); });
test('import recovery-only failure remains visible after returning to home', async () => { const b = boot(); b.click('lesson', '0:0'); const C = require('../src/core.js'), D = JSON.parse(fs.readFileSync(path.join(root, 'src/demo-data.json'), 'utf8').replace(/^\uFEFF/, '')); const candidate = C.empty(D.id); candidate.lessonDone = [1]; const text = C.exportBackup(candidate, D.id, 30); b.click('nav', 'backups'); await b.handlers.change({ target: { id: 'import', files: [{ size: text.length, text: async () => text }] } }); b.click('export'); b.node('#confirmed').checked = true; const original = b.storage.setItem; b.storage.setItem = (k, v) => { if (k.endsWith('-recovery')) throw Error('recovery failure'); original(k, v); }; b.click('restore'); assert.deepEqual(b.state().lessonDone, [1]); assert.equal(b.nodes.get('#notice').hidden, false); assert.match(b.nodes.get('#notice').textContent, /kurtarma kopyası/); });
test('mixed tests draw only from selected days and retain grade-6 attempts', () => { const b = boot(); b.click('nav', 'words'); b.click('mix'); b.handlers.submit({ preventDefault() {}, target: { id: 'mix', querySelectorAll: () => [{ value: '2' }] } }); const a = b.state().active; assert.equal(a.type, 'mixed'); assert.equal(a.ids.length, 15); assert.equal(new Set(a.ids).size, 15); assert.ok(a.ids.every(id => id >= 15 && id < 30)); b.handlers.submit({ preventDefault() {}, target: { id: 'paper' } }); assert.equal(b.state().tests[0].grade, 6); b.click('nav', 'history'); assert.match(b.nodes.get('main').innerHTML, /Karma/); b.click('result', 0); assert.match(b.nodes.get('main').innerHTML, /Notun: 6/); });
test('all 30 vocabulary pairs, examples, stories and revised exercise appear in their views', () => { const b = boot(); const D = JSON.parse(fs.readFileSync(path.join(root, 'src/demo-data.json'), 'utf8').replace(/^\uFEFF/, '')); b.click('nav', 'words'); for (const w of D.words) { assert.ok(b.nodes.get('main').innerHTML.includes(w.de), w.de); assert.ok(b.nodes.get('main').innerHTML.includes(w.tr), w.tr); } b.click('study', 1); b.click('flip'); assert.ok(b.nodes.get('#card-back').innerHTML.includes(D.words[0].example)); b.click('nav', 'library'); for (const story of D.stories) assert.ok(b.nodes.get('main').innerHTML.includes(story.de)); b.click('nav', 'lessons'); assert.ok(b.nodes.get('main').innerHTML.includes(D.lessons[1].prompt)); b.click('lesson', '2:2'); assert.ok(b.state().lessonDone.includes(2)); assert.match(b.nodes.get('#feedback-2').textContent, /Doğru/); });

test('the actual standalone script bundle starts, displays all entries and reloads saved progress', () => { const b = boot({}, true); assert.match(b.nodes.get('main').innerHTML, /Kelime günlerime/); b.click('nav', 'words'); assert.match(b.nodes.get('main').innerHTML, /Gün 2/); b.click('daily', 2); b.input({ answer: '0' }, 'Einkaufstasche'); const c = boot(Object.fromEntries(b.db), true); c.click('paper'); assert.match(c.nodes.get('main').innerHTML, /Einkaufstasche/); assert.equal(c.state().active.answers[0], 'Einkaufstasche'); });
