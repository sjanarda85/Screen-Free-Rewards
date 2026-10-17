#!/usr/bin/env node
// Pretends to be the native companion app on the child's phone, so you can see the whole loop work:
// it reports app usage to the parent phone and reads the locks the parent sets.
//
//   node tools/companion-simulator.mjs '<setup JSON>' [--apps "YouTube=45,Chrome=20,Minecraft=30"] [--watch]
//
// The setup JSON comes from Parent controls, Apps, Copy companion setup: {"link":"...","roomId":"...","secret":"..."}
// For a local test use the link http://localhost:8787 from tools/local-relay.mjs.
const args = process.argv.slice(2);
if (!args[0]) { console.log('Usage: node tools/companion-simulator.mjs \'{"link":"...","roomId":"...","secret":"..."}\' [--apps "YouTube=45,Chrome=20"] [--watch]'); process.exit(1); }
const setup = JSON.parse(args[0]);
const opt = n => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : null; };
const apps = (opt('--apps') || 'YouTube=45,Chrome=20,Minecraft=30').split(',').map(s => { const [n, m] = s.split('='); return { k: 'com.sim.' + n.toLowerCase().replace(/[^a-z0-9]/g, ''), n: n.trim(), m: Number(m) || 0 }; });
const total = apps.reduce((a, x) => a + x.m, 0), date = new Date().toISOString().slice(0, 10);
async function call(payload) { const r = await fetch(setup.link, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }); const j = await r.json(); if (!j.ok) throw new Error(j.error || 'rejected'); return j; }
async function once() {
  const r = await call({ action: 'sync', roomId: setup.roomId, secret: setup.secret, date, usage: { date, src: 'companion', total, apps } });
  const c = r.controls, locked = Object.keys(c.lockedApps || {});
  console.log(new Date().toLocaleTimeString() + ' reported ' + total + ' min across ' + apps.length + ' apps. Device locked: ' + (c.deviceLocked ? 'YES' + (c.message ? ' ("' + c.message + '")' : '') : 'no') + '. Locked apps: ' + (locked.length ? locked.join(', ') : 'none'));
  return c;
}
await once();
if (args.includes('--watch')) { console.log('Watching for changes every 10 seconds. Press Ctrl+C to stop.'); setInterval(() => once().catch(e => console.log('error: ' + e.message)), 10000); }
