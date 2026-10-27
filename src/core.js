/* Learning rules and validated local persistence for the portfolio demo. */
(function (root) {
  'use strict';
  const VERSION = 1, MAX_BYTES = 1024 * 1024;
  const MINUTE = 60000, DAY = 86400000;
  const KEYS = { main: 'deutschweg-portfolio-v1', recovery: 'deutschweg-portfolio-v1-recovery' };
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const integer = (v, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= 0 && v <= max;
  const bytes = s => new TextEncoder().encode(s).length;
  function ensure(ok) { if (!ok) throw new Error('Geçersiz veya uyumsuz veri.'); }
  function shape(v, keys) { return object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k)); }
  function dayIds(n, count) { ensure(integer(n, Math.ceil(count / 15)) && n > 0); return Array.from({ length: Math.min(15, count - (n - 1) * 15) }, (_, i) => (n - 1) * 15 + i); }
  function grade(correct, total) { ensure(integer(total, 15) && total > 0 && integer(correct, total)); const p = correct / total; return p >= .9 ? 1 : p >= .8 ? 2 : p >= .65 ? 3 : p >= .5 ? 4 : p >= .3 ? 5 : 6; }
  function normalize(s) { return String(s).normalize('NFC').toLocaleLowerCase('de').trim().replace(/^(der|die|das)\s+/, '').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[\s\-–—.,!?]/g, ''); }
  function distance(a, b) { const rows = [Array.from({ length: b.length + 1 }, (_, i) => i)]; for (let i = 1; i <= a.length; i++) { const r = [i]; for (let j = 1; j <= b.length; j++) { r[j] = Math.min(r[j - 1] + 1, rows[i - 1][j] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) r[j] = Math.min(r[j], rows[i - 2][j - 2] + 1); } rows.push(r); } return rows[a.length][b.length]; }
  function answerOK(word, input, words) {
    const given = normalize(input), answers = [word.de, ...word.aliases].map(normalize);
    if (!given) return false;
    if (answers.includes(given)) return true;
    if (words.some(w => normalize(w.de) === given)) return false;
    return answers.some(ideal => {
      if (['un', 'nicht', 'kein'].some(p => given === p + ideal || ideal === p + given)) return false;
      const n = Math.min(ideal.length, given.length);
      return n >= 5 && distance(ideal, given) <= (n >= 11 ? 2 : 1);
    });
  }
  function plan(old, rating, now = Date.now()) {
    ensure(['again', 'hard', 'good', 'easy'].includes(rating));
    const c = old ? { ...old } : { due: now, interval: 0, reviews: 0, lapses: 0 };
    c.reviews++;
    if (rating === 'again') { c.interval = 0; c.lapses++; c.due = now + MINUTE; }
    else if (!c.interval && rating !== 'easy') c.due = now + (rating === 'hard' ? 6 : 10) * MINUTE;
    else { c.interval = Math.min(365, !c.interval ? 4 : Math.max(c.interval + 1, Math.round(c.interval * ({ hard: 1.2, good: 2, easy: 2.6 })[rating]))); c.due = now + c.interval * DAY; }
    // A second successful learning step graduates to a one-day interval.
    if (rating === 'good' && old && !old.interval && old.reviews > 0) { c.interval = 1; c.due = now + DAY; }
    return c;
  }
  function empty(dataset) { return { schema: VERSION, dataset, cards: {}, tests: [], drafts: {}, lessonDone: [], active: null }; }
  function validate(value, dataset, count) {
    ensure(shape(value, ['schema', 'dataset', 'cards', 'tests', 'drafts', 'lessonDone', 'active']));
    ensure(value.schema === VERSION && value.dataset === dataset);
    const id = n => integer(n, count - 1);
    const days = a => Array.isArray(a) && a.length > 0 && a.length <= Math.ceil(count / 15) && new Set(a).size === a.length && a.every(n => integer(n, Math.ceil(count / 15)) && n > 0);
    const ids = a => Array.isArray(a) && a.length > 0 && a.length <= 15 && new Set(a).size === a.length && a.every(id);
    ensure(object(value.cards) && Object.keys(value.cards).length <= count);
    for (const [k, c] of Object.entries(value.cards)) {
      ensure(/^(0|[1-9]\d*)$/.test(k) && id(+k));
      ensure(shape(c, ['due', 'interval', 'reviews', 'lapses']) && integer(c.due, 8640000000000000) && integer(c.interval, 365) && integer(c.reviews, 1000000) && integer(c.lapses, c.reviews));
    }
    ensure(object(value.drafts) && Object.keys(value.drafts).length <= 3);
    for (const [k, s] of Object.entries(value.drafts)) ensure(/^[0-2]$/.test(k) && typeof s === 'string' && s.length <= 3000);
    ensure(Array.isArray(value.lessonDone) && value.lessonDone.length <= 3 && new Set(value.lessonDone).size === value.lessonDone.length && value.lessonDone.every(n => integer(n, 2)));
    ensure(Array.isArray(value.tests) && value.tests.length <= 1000);
    for (const t of value.tests) {
      ensure(shape(t, ['at', 'days', 'type', 'rows', 'correct', 'grade']) && integer(t.at, 8640000000000000) && days(t.days) && ['daily', 'mixed'].includes(t.type));
      ensure(Array.isArray(t.rows) && ids(t.rows.map(r => r.id)));
      for (const r of t.rows) ensure(shape(r, ['id', 'given', 'ok']) && typeof r.given === 'string' && r.given.length <= 150 && typeof r.ok === 'boolean');
      const pool = t.days.flatMap(n => dayIds(n, count));
      ensure(t.rows.length === Math.min(15, pool.length) && t.rows.every(r => pool.includes(r.id)));
      if (t.type === 'daily') ensure(t.days.length === 1 && t.rows.map(r => r.id).join() === pool.join());
      ensure(t.correct === t.rows.filter(r => r.ok).length && t.grade === grade(t.correct, t.rows.length));
    }
    if (value.active !== null) {
      const a = value.active;
      ensure(shape(a, ['days', 'type', 'ids', 'answers']) && days(a.days) && ids(a.ids) && ['daily', 'mixed'].includes(a.type));
      ensure(Array.isArray(a.answers) && a.answers.length === a.ids.length && a.answers.every(s => typeof s === 'string' && s.length <= 150));
      const pool = a.days.flatMap(n => dayIds(n, count));
      ensure(a.ids.length === Math.min(15, pool.length) && a.ids.every(n => pool.includes(n)));
      if (a.type === 'daily') ensure(a.days.length === 1 && a.ids.join() === pool.join());
    }
    const text = JSON.stringify(value); ensure(bytes(text) <= MAX_BYTES);
    return clone(value);
  }
  function digest(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }
  function exportBackup(value, dataset, count) { const state = validate(value, dataset, count); const s = JSON.stringify({ app: 'deutschweg-portfolio', version: VERSION, checksum: digest(JSON.stringify(state)), state }); ensure(bytes(s) <= MAX_BYTES); return s; }
  function parseBackup(text, dataset, count) { ensure(typeof text === 'string' && bytes(text) <= MAX_BYTES); const p = JSON.parse(text); ensure(shape(p, ['app', 'version', 'checksum', 'state']) && p.app === 'deutschweg-portfolio' && p.version === VERSION && p.checksum === digest(JSON.stringify(p.state))); return validate(p.state, dataset, count); }
  class ProgressStore {
    constructor(storage, dataset, count) { this.storage = storage; this.dataset = dataset; this.count = count; this.state = empty(dataset); this.readOnly = false; this.lastRaw = undefined; this.error = ''; try { const raw = storage.getItem(KEYS.main); this.lastRaw = raw; if (raw !== null) { ensure(bytes(raw) <= MAX_BYTES); this.state = validate(JSON.parse(raw), dataset, count); } } catch { this.readOnly = true; this.error = 'Kayıt okunamadı. Mevcut veri korunuyor; yedek bölümünü kullan.'; } }
    commit(value, explicitRestore = false) {
      const clean = validate(value, this.dataset, this.count), text = JSON.stringify(clean);
      ensure(!this.readOnly || explicitRestore);
      const old = this.storage.getItem(KEYS.main);
      if (this.lastRaw !== undefined) ensure(old === this.lastRaw);
      try { this.storage.setItem(KEYS.main, text); ensure(this.storage.getItem(KEYS.main) === text); }
      catch (e) { try { if (old === null) this.storage.removeItem(KEYS.main); else this.storage.setItem(KEYS.main, old); } catch {} throw e; }
      this.lastRaw = text; this.state = clean; this.readOnly = false;
      let recovery = true;
      if (old && old !== text) { try { validate(JSON.parse(old), this.dataset, this.count); this.storage.setItem(KEYS.recovery, old); ensure(this.storage.getItem(KEYS.recovery) === old); } catch { recovery = false; } }
      this.error = recovery ? '' : 'Ana kayıt tamamlandı; ek kurtarma kopyası oluşturulamadı. Yedek indir.';
      return { saved: true, recovery };
    }
    recovery() { const raw = this.storage.getItem(KEYS.recovery); ensure(typeof raw === 'string' && bytes(raw) <= MAX_BYTES); return validate(JSON.parse(raw), this.dataset, this.count); }
  }
  const api = { VERSION, MAX_BYTES, KEYS, DAY, MINUTE, clone, dayIds, grade, normalize, answerOK, plan, empty, validate, exportBackup, parseBackup, ProgressStore };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeutschwegCore = Object.freeze(api);
})(globalThis);
