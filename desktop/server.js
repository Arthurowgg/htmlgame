// GRAND PIXEL GAME — launcher de desktop (Windows/macOS/Linux)
// Serve o jogo em um servidor HTTP local e abre o navegador.
// Executável autossuficiente: os arquivos do jogo vêm embutidos (EMBEDDED),
// com exceção de assets/music/* na pasta ao lado do executável (opcional),
// permitindo ao jogador pôr a própria música.
'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EMBEDDED = globalThis.__EMBEDDED__ || {};

function exeDir() {
  // No .exe empacotado (stub C) o launcher define GPG_DATA_DIR como a pasta
  // do próprio .exe — é lá que o jogador põe assets/music. Em builds nexe o
  // __dirname é temporário; em dev, é a pasta do script.
  if (process.env.GPG_DATA_DIR) return process.env.GPG_DATA_DIR;
  try {
    const d = path.dirname(process.execPath);
    if (fs.existsSync(path.join(d, 'assets'))) return d;
  } catch (e) {}
  return __dirname;
}

// tipos MIME explícitos (módulos ES exigem text/javascript no navegador)
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
};

function normalize(p) {
  let u;
  try { u = decodeURIComponent(p.split('?')[0]); } catch (e) { u = p.split('?')[0]; }
  if (!u.startsWith('/')) u = '/' + u;
  const parts = [];
  for (const seg of u.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { parts.pop(); continue; }
    parts.push(seg);
  }
  return '/' + parts.join('/');
}

// música local (assets/music/<arquivo> na pasta do .exe) tem prioridade
function localMusic(urlPath) {
  if (!urlPath.startsWith('/assets/music/')) return null;
  const name = path.basename(urlPath);
  const f = path.join(exeDir(), 'assets', 'music', name);
  try {
    if (fs.statSync(f).isFile()) return f;
  } catch (e) {}
  return null;
}

function serve(req, res) {
  let p = normalize(req.url);
  const isHead = req.method === 'HEAD' || req.method === 'GET';
  if (!isHead) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  if (p === '/' || p === '') p = '/index.html';
  const ext = path.extname(p).toLowerCase();
  const local = localMusic(p);
  if (local) {
    fs.readFile(local, (err, data) => {
      if (err) { res.writeHead(500); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
    return;
  }
  const raw = EMBEDDED[p];
  if (raw === undefined) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404: ' + p + ' não encontrado no jogo embutido.');
    return;
  }
  const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'base64');
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': 'no-cache',
    'X-Grand-Pixel-Game': '1',
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

function openBrowser(url) {
  let cmd, args;
  if (process.platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  const child = require('child_process').spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
  child.on('error', () => {}); // navegador não abre → usuário usa a URL impressa
  child.unref();
}

function parseArgs() {
  const a = { port: 8137, noopen: false, quiet: false };
  for (let i = 2; i < process.argv.length; i++) {
    const v = process.argv[i];
    if (v === '--noopen' || v === '-noopen') a.noopen = true;
    else if (v === '--quiet' || v === '-q') a.quiet = true;
    else if (v.startsWith('--port=')) a.port = parseInt(v.slice(7), 10) || 8137;
    else if ((v === '--port' || v === '-p') && process.argv[i + 1]) a.port = parseInt(process.argv[++i], 10) || 8137;
  }
  return a;
}

const args = parseArgs();
const server = http.createServer(serve);
const tries = 60;
let port = args.port;
let ok = false;

function banner() {
  const line = '='.repeat(56);
  console.log(line);
  console.log('  GRAND PIXEL GAME  —  rodando em  http://127.0.0.1:' + server.address().port);
  console.log(line);
  console.log('  Para fechar o jogo: feche esta janela ou pressione Ctrl+C.');
  if (!args.noopen) console.log('  O navegador abriu sozinho; se não abriu, copie o endereço acima.');
  console.log('  Música opcional: coloque MP3/OGG/M4A/WAV na pasta "assets/music"');
  console.log('  ao lado deste executável (nomes: inner-light, intro, music, ost...).');
  console.log(line);
}

server.on('error', e => {
  if (e.code === 'EADDRINUSE' && port - args.port < tries) {
    port++;
    server.listen(port, '127.0.0.1');
  } else {
    console.error('Não foi possível subir o servidor na porta ' + port + ': ' + e.message);
    console.error('Tente: ' + process.execPath + ' --port=9000');
    process.exit(1);
  }
});

server.listen(port, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  if (!args.quiet) banner();
  if (!args.noopen) openBrowser(url);
  else if (args.quiet) console.log('http://127.0.0.1:' + server.address().port + '/');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\nAté logo! Obrigado por jogar GRAND PIXEL GAME.');
    server.close();
    process.exit(0);
  });
}
