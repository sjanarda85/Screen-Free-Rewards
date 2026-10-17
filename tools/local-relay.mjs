#!/usr/bin/env node
// Runs apps-script/Code.gs on your own computer as a plain web server, for testing the companion app or the simulator
// without Google. Verification emails are printed to the console instead of being sent.
//   node tools/local-relay.mjs [port]      then use http://localhost:8787 as the link in the companion simulator
import http from 'http';
import { makeRelay } from './relay-harness.mjs';
const port = Number(process.argv[2]) || 8787, relay = makeRelay();
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const out = req.method === 'POST' ? relay.handle(JSON.parse(body || '{}')) : { ok: true, service: 'local relay' };
    while (relay.sent.length) { const m = relay.sent.shift(); console.log('[mail] to ' + m.to + ': ' + m.subject); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
  });
}).listen(port, () => console.log('Local relay on http://localhost:' + port));
