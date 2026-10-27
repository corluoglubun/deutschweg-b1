'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
function render() {
  const data = JSON.parse(read('src/demo-data.json'));
  const js = ['globalThis.DeutschwegDemoData = ' + JSON.stringify(data).replace(/</g, '\\u003c') + ';', read('src/core.js'), read('src/app.js')];
  const css = read('src/style.css');
  const hash = s => "'sha256-" + crypto.createHash('sha256').update(s).digest('base64') + "'";
  const policy = `default-src 'none'; script-src ${js.map(hash).join(' ')}; style-src ${hash(css)}; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; img-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'; worker-src 'none'`;
  return read('src/template.html').replace('@@POLICY@@', policy).replace('@@STYLE@@', css).replace('@@SCRIPTS@@', js.map(s => '<script>' + s + '</script>').join('\n'));
}
if (require.main === module) { const out = render(); fs.writeFileSync(path.join(root, 'index.html'), out); console.log('Built standalone index.html (' + Buffer.byteLength(out) + ' bytes). No private files read.'); }
module.exports = { render, root };
