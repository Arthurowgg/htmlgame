// Gera o bundle único do launcher com o jogo embutido em base64.
// Uso: node desktop/build.js [--out caminho/bundle.cjs]
// Depois: npx nexe <bundle> -t windows-x64-XX para gerar o .exe (ver README-desktop).
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv.indexOf('--out') !== -1
  ? path.resolve(process.argv[process.argv.indexOf('--out') + 1])
  : path.join(__dirname, 'gpg-bundle.cjs');

const TOP = ['index.html', 'css', 'js', 'assets'];

function walk(dir, base, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort()) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    const rel = base + '/' + ent.name;
    if (ent.isDirectory()) walk(full, rel, out);
    else out.push(rel); // ex.: css/style.css, js/main.js
  }
}

const files = [];
for (const t of TOP) {
  const full = path.join(ROOT, t);
  if (!fs.existsSync(full)) continue;
  const st = fs.statSync(full);
  if (st.isDirectory()) walk(full, t, files);
  else files.push(t);
}

const entries = files.map(f => {
  const b = fs.readFileSync(path.join(ROOT, f)).toString('base64');
  return '  "/' + f + '":"' + b + '"';
});

const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const bundle =
  '/* GRAND PIXEL GAME — bundle gerado por desktop/build.js. Não edite. */\n' +
  "'use strict';\n" +
  'globalThis.__EMBEDDED__ = {\n' + entries.join(',\n') + '\n};\n\n' +
  src;

fs.writeFileSync(OUT, bundle);
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log('Bundle gerado: ' + OUT + ' (' + kb + ' KB, ' + files.length + ' arquivos embutidos)');
