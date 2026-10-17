/**
 * Screen Free Rewards shared relay (Google Apps Script web app), version 4: email, device pairing, remote controls and the midnight daily summary.
 *
 * One relay serves every family that uses the app. It is built so it cannot be used to spam:
 *  - A parent must verify their own email once with a 6-digit code. Only verified addresses can receive mail.
 *  - The sender name is fixed, only a PDF attachment is accepted, and message sizes are capped.
 *  - Daily limits per address and in total protect your Google account's sending quota.
 *
 * The app posts JSON as text/plain (same style as the Thakazhi Peedika daily summary):
 *   { action: 'verify',  email }                      sends a 6-digit code to that address
 *   { action: 'confirm', email, code }                returns { ok:true, token } when the code is right
 *   { to, subject, message, htmlBody, attachmentName, attachmentBase64, token }   sends the email
 *
 * Pairing and remote controls (parents' phones to the child's device, and the native companion app):
 *   { action: 'pair-start', childName }                          child device creates a room, returns { roomId, secret, code }
 *   { action: 'pair-code', roomId, secret }                       new pairing code for an existing room
 *   { action: 'pair-join', code, parentName }                     parent phone joins with the code, returns { roomId, secret, childName }
 *   { action: 'sync', roomId, secret, usage?, name? }             child device (or companion) pushes usage, gets the latest controls
 *   { action: 'sync-pull', roomId, secret }                       parent phone reads usage, controls and last seen
 *   { action: 'ctrl-set', roomId, secret, controls }              parent sets deviceLocked, message, lockedApps
 *   { action: 'unpair', roomId, secret }                          deletes the room
 *   { action: 'daily-claim' | 'daily-release', roomId, secret, key }   whoever claims 'YYYY-MM-DD:childId' first sends that day's report
 *
 * Midnight summary while the app is closed: the child app keeps a small copy of each child's numbers in the room (sync).
 * Run installMidnightTrigger() once from the editor; the hourly trigger midnightSummaries() then emails every parent
 * the report of the day that just ended, in the family's own time zone, unless the app already sent it.
 * Setup: apps-script/SETUP.md
 */

var APP_NAME = 'Screen Free Rewards';
var MAX_SENDS_PER_ADDRESS_PER_DAY = 40;
var MAX_CODES_PER_ADDRESS_PER_DAY = 4;
var MAX_EMAILS_PER_DAY = 90;          // all families together; free Google accounts allow about 100 a day
var MAX_ATTACHMENT_BASE64 = 200000;   // about 150 KB of PDF
var MAX_HTML = 60000;
var MAX_TEXT = 8000;
var PAIR_TTL = 900;                   // pairing codes last 15 minutes
var MAX_NEW_ROOMS_PER_DAY = 60;
var MAX_CALLS_PER_ROOM_PER_HOUR = 900;
var MAX_ROOM_JSON = 8500;            // keep each room small, script properties are limited
var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = String(d.action || 'send');
    if (action === 'verify') return out(startVerify_(d));
    if (action === 'confirm') return out(confirmVerify_(d));
    if (action === 'pair-start') return out(pairStart_(d));
    if (action === 'pair-code') return out(pairCode_(d));
    if (action === 'pair-join') return out(pairJoin_(d));
    if (action === 'sync') return out(sync_(d));
    if (action === 'sync-pull') return out(syncPull_(d));
    if (action === 'ctrl-set') return out(ctrlSet_(d));
    if (action === 'daily-claim') return out(dailyClaim_(d, true));
    if (action === 'daily-release') return out(dailyClaim_(d, false));
    if (action === 'unpair') return out(unpair_(d));
    return out(send_(d));
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet() {
  return out({ ok: true, service: APP_NAME + ' relay', version: 4 });
}

// ---- verification --------------------------------------------------------------------------------------------
function startVerify_(d) {
  var email = cleanEmail_(d.email);
  if (!email) return { ok: false, error: 'bad email' };
  if (!allow_('code:' + email, MAX_CODES_PER_ADDRESS_PER_DAY)) return { ok: false, error: 'too many codes today, try again tomorrow' };
  if (!allow_('all', MAX_EMAILS_PER_DAY)) return { ok: false, error: 'daily limit reached' };
  var code = ('' + Math.floor(100000 + Math.random() * 900000));
  var cache = CacheService.getScriptCache();
  cache.put('c:' + email, hash_(email + ':' + code), 600);
  cache.put('a:' + email, '0', 600);
  MailApp.sendEmail({
    to: email,
    subject: APP_NAME + ' verification code ' + code,
    body: 'Your ' + APP_NAME + ' verification code is ' + code + '.\n\nEnter it in the app to start receiving your child\'s requests and daily summaries by email. It expires in 10 minutes. If you did not ask for this, ignore this message.',
    name: APP_NAME
  });
  return { ok: true };
}

function confirmVerify_(d) {
  var email = cleanEmail_(d.email);
  var code = String(d.code || '').replace(/\s/g, '');
  if (!email || !/^\d{6}$/.test(code)) return { ok: false, error: 'bad code' };
  var cache = CacheService.getScriptCache();
  var tries = Number(cache.get('a:' + email) || 0);
  var stored = cache.get('c:' + email);
  if (!stored) return { ok: false, error: 'code expired, ask for a new one' };
  if (tries >= 5) return { ok: false, error: 'too many wrong codes, ask for a new one' };
  if (stored !== hash_(email + ':' + code)) {
    cache.put('a:' + email, String(tries + 1), 600);
    return { ok: false, error: 'wrong code' };
  }
  cache.remove('c:' + email);
  return { ok: true, token: token_(email) };
}

// ---- sending -------------------------------------------------------------------------------------------------
function send_(d) {
  var to = cleanEmail_(d.to);
  if (!to) return { ok: false, error: 'bad recipient' };
  if (!d.token || String(d.token) !== token_(to)) return { ok: false, error: 'not verified' };
  if (!allow_('send:' + to, MAX_SENDS_PER_ADDRESS_PER_DAY)) return { ok: false, error: 'daily limit for this address' };
  if (!allow_('all', MAX_EMAILS_PER_DAY)) return { ok: false, error: 'daily limit reached' };
  var mail = {
    to: to,
    subject: clip_(d.subject || APP_NAME, 150),
    body: clip_(d.message || '', MAX_TEXT),
    name: APP_NAME
  };
  if (d.htmlBody) mail.htmlBody = clip_(d.htmlBody, MAX_HTML);
  if (d.attachmentBase64) {
    var b64 = String(d.attachmentBase64).replace(/^data:[^,]*,/, '');
    if (b64.length > MAX_ATTACHMENT_BASE64) return { ok: false, error: 'attachment too large' };
    var bytes = Utilities.base64Decode(b64);
    var head = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
    if (head !== '%PDF-') return { ok: false, error: 'attachment must be a PDF' };
    var name = String(d.attachmentName || 'summary.pdf').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
    mail.attachments = [Utilities.newBlob(bytes, 'application/pdf', name)];
  }
  MailApp.sendEmail(mail);
  return { ok: true };
}


// ---- midnight daily summary ---------------------------------------------------------------------------------
var MAX_SNAPS = 8;

function cleanSnap_(s) {
  function n(v) { return Math.max(0, Math.round(Number(v) || 0)); }
  return {
    date: String(s.date), uid: String(s.uid), name: clip_(s.name || 'Child', 40), age: n(s.age),
    balance: n(s.balance), pending: n(s.pending), earned: n(s.earned), mins: n(s.mins), scheduled: n(s.scheduled),
    tasks: (s.tasks || []).slice(0, 5).map(function (x) { return { t: clip_(x.t, 40), p: n(x.p) }; }),
    open: (s.open || []).slice(0, 4).map(function (x) { return { k: clip_(x.k, 12), n: clip_(x.n, 40), c: n(x.c) }; })
  };
}

// Keeps the room's copy of the child's numbers and the verified parent addresses. Returns true when something changed.
function storeDaily_(room, d) {
  var changed = false;
  if (d.tz && /^[A-Za-z_\/+\-0-9]{1,40}$/.test(String(d.tz)) && d.tz !== room.tz) { room.tz = String(d.tz); changed = true; }
  if (d.snaps && d.snaps.length) {
    room.snaps = room.snaps || {};
    d.snaps.slice(0, 4).forEach(function (s) {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(String(s.date || '')) || !/^\d{1,20}$/.test(String(s.uid || ''))) return;
      var c = cleanSnap_(s), k = c.date + '|' + c.uid;
      if (JSON.stringify(room.snaps[k]) !== JSON.stringify(c)) { room.snaps[k] = c; changed = true; }
    });
    var keys = Object.keys(room.snaps).sort();
    while (keys.length > MAX_SNAPS) { delete room.snaps[keys.shift()]; changed = true; }
  }
  if (d.to && d.to.length) {
    var to = [];
    d.to.slice(0, 4).forEach(function (x) {
      var e = cleanEmail_(x && x.e);
      if (e && x.t && String(x.t) === token_(e)) to.push({ e: e, n: clip_(x.n || '', 40) });
    });
    if (JSON.stringify(to) !== JSON.stringify(room.to || [])) { room.to = to; changed = true; }
  }
  return changed;
}

// Claims (or gives back) the right to send one child's report for one day. Kept apart from the room so sync cannot undo it.
function claimSent_(roomId, key, claim) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties(), pk = 'sent:' + roomId;
    var sent = JSON.parse(props.getProperty(pk) || '{}');
    if (claim) {
      if (sent[key]) return false;
      sent[key] = Date.now();
      var keys = Object.keys(sent).sort();
      while (keys.length > 12) delete sent[keys.shift()];
    } else {
      delete sent[key];
    }
    props.setProperty(pk, JSON.stringify(sent));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function dailyClaim_(d, claim) {
  var a = roomAuth_(d);
  if (!a) return { ok: false, error: 'not paired' };
  var key = String(d.key || '');
  if (!/^\d{4}-\d{2}-\d{2}:\d{1,20}$/.test(key)) return { ok: false, error: 'bad key' };
  var done = claimSent_(a.id, key, claim);
  return claim ? { ok: true, claimed: done } : { ok: true };
}

function shiftDay_(day, n) {
  var p = day.split('-').map(Number);
  var t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n, 12));
  return t.getUTCFullYear() + '-' + ('0' + (t.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + t.getUTCDate()).slice(-2);
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Dark report in the same layout as the app's email. Every dark panel also carries a bgcolor so Gmail keeps it.
function dailyHtml_(s, day, note) {
  var F = 'font-family:Helvetica,Arial,sans-serif;';
  function bg(c) { return ' bgcolor="' + c + '" style="background:' + c + ';background-image:linear-gradient(' + c + ',' + c + ');'; }
  function sec(t) { return '<tr><td style="padding:18px 0 0 0;"><span style="display:inline-block;background:#2b2d31;color:#d9cfb8;' + F + 'font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;padding:8px 14px;">' + t + '</span></td></tr>'; }
  function row(l, v, c, b) { return '<tr><td style="padding:9px 0;border-bottom:1px solid #2b2d31;' + F + 'font-size:14px;color:' + (b ? '#eeece7' : '#9c9da0') + ';font-weight:' + (b ? 700 : 400) + ';">' + l + '</td><td align="right" style="padding:9px 0;border-bottom:1px solid #2b2d31;' + F + 'font-size:14px;font-weight:' + (b ? 700 : 400) + ';color:' + (c || '#eeece7') + ';">' + v + '</td></tr>'; }
  function box(r) { return '<tr><td' + bg('#202226') + 'padding:4px 18px 8px 18px;"><table width="100%" cellpadding="0" cellspacing="0" border="0">' + r + '</table></td></tr>'; }
  function text(t) { return '<tr><td' + bg('#202226') + 'padding:14px 18px;' + F + 'font-size:14px;color:#eeece7;line-height:1.5;">' + t + '</td></tr>'; }
  var unused = Math.max(0, s.scheduled - s.mins), status = s.open.length ? 'Needs attention' : 'All clear';
  var tasks = s.tasks.length ? s.tasks.map(function (x) { return '&bull; ' + esc_(x.t) + ' (+' + x.p + ' pts)'; }).join('<br>') : 'None.';
  var open = s.open.length ? s.open.map(function (x) { return '&bull; ' + esc_(x.k) + ': ' + esc_(x.n) + (x.c ? ' (' + x.c + ' pts)' : ''); }).join('<br>') : 'None.';
  var comment = esc_(s.name) + ' spent ' + s.mins + ' min screen free and earned ' + s.earned + ' points.' + (s.pending ? ' ' + s.pending + ' points are waiting for your approval.' : '');
  return '<!doctype html><html style="background:#161719;color-scheme:dark;"><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head><body bgcolor="#161719" style="margin:0;padding:0;background:#161719;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0"' + bg('#161719') + '"><tr><td align="center" style="padding:24px 12px;">' +
    '<table width="640" cellpadding="0" cellspacing="0" border="0"' + bg('#1b1d20') + 'width:100%;max-width:640px;"><tr><td style="padding:28px 28px 8px 28px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><div style="' + F + 'font-size:18px;font-weight:700;color:#eeece7;">&#10022; ' + APP_NAME + '</div><div style="' + F + 'font-size:12px;color:#9c9da0;margin-top:3px;">Daily summary &middot; sent at midnight</div></td>' +
    '<td align="right" valign="middle"><div style="' + F + 'font-size:16px;font-weight:700;color:#eeece7;">' + esc_(day) + '</div><div style="' + F + 'font-size:12px;color:#9c9da0;margin-top:3px;">' + esc_(s.name) + '</div></td></tr></table></td></tr>' +
    '<tr><td style="padding:0 28px;"><div' + bg('#d9cfb8') + 'height:3px;line-height:3px;font-size:0;">&nbsp;</div></td></tr>' +
    '<tr><td style="padding:0 28px 28px 28px;"><table width="100%" cellpadding="0" cellspacing="0" border="0">' +
    sec('Child') + box(row('Name', esc_(s.name)) + row('Age', s.age ? String(s.age) : '-') + row('Status', status, s.open.length ? '#f2b45a' : '#54cc88', true)) +
    sec('Points') + box(row('Balance', s.balance + ' pts', null, true) + row('Pending approval', s.pending + ' pts', s.pending ? '#f2b45a' : null) + row('Earned that day', '+' + s.earned + ' pts', '#54cc88')) +
    sec('Screen-free time') + box(row('Scheduled', s.scheduled + ' min') + row('Actual timer', s.mins + ' min', null, true) + row('Unused', unused + ' min')) +
    sec('Open requests (' + s.open.length + ')') + text(open) + sec('Open tasks (' + s.tasks.length + ')') + text(tasks) + sec('Commentary') + text(comment + (note ? '<br><span style="color:#9c9da0;">' + esc_(note) + '</span>' : '')) +
    '</table></td></tr><tr><td style="padding:0 28px 26px 28px;"><div style="border-top:1px solid #2b2d31;padding-top:16px;' + F + 'font-size:12px;color:#9c9da0;line-height:1.6;"><b style="color:#eeece7;font-size:13px;">' + APP_NAME + '</b><br>Open the app and sign in as a parent to approve points and decide requests.<br>The report is attached as a PDF. Balance is as of the last time the child\'s device synced.</div></td></tr>' +
    '</table></td></tr></table></body></html>';
}

function dailyText_(s, day) {
  return [APP_NAME + ' - Daily summary', 'Child: ' + s.name + (s.age ? ' (' + s.age + ')' : ''), 'Day: ' + day, '',
    'Balance: ' + s.balance + ' pts', 'Pending approval: ' + s.pending + ' pts', 'Earned that day: ' + s.earned + ' pts',
    'Screen free: ' + s.mins + ' of ' + s.scheduled + ' min', 'Open requests: ' + s.open.length, 'Open tasks: ' + s.tasks.length, '',
    'Open the app and sign in as a parent to approve points and decide requests.'].join('\n');
}

function dailyPdf_(s, day) {
  try {
    var rows = [['Balance', s.balance + ' pts'], ['Pending approval', s.pending + ' pts'], ['Earned that day', '+' + s.earned + ' pts'], ['Screen free', s.mins + ' min of ' + s.scheduled + ' min']];
    var h = '<html><body style="font-family:Arial,sans-serif;color:#222;"><h1 style="margin:0;">' + APP_NAME + '</h1><p style="color:#666;margin:2px 0 14px;">Daily summary &middot; ' + esc_(day) + ' &middot; ' + esc_(s.name) + (s.age ? ', age ' + s.age : '') + '</p><table style="width:100%;border-collapse:collapse;font-size:14px;">' +
      rows.map(function (r) { return '<tr><td style="padding:8px;border-bottom:1px solid #ddd;color:#555;">' + r[0] + '</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:bold;">' + esc_(r[1]) + '</td></tr>'; }).join('') + '</table>' +
      '<h3>Open requests (' + s.open.length + ')</h3>' + (s.open.length ? s.open.map(function (x) { return '<div>' + esc_(x.k) + ': ' + esc_(x.n) + '</div>'; }).join('') : '<div>None.</div>') +
      '<h3>Open tasks (' + s.tasks.length + ')</h3>' + (s.tasks.length ? s.tasks.map(function (x) { return '<div>' + esc_(x.t) + ' (+' + x.p + ' pts)</div>'; }).join('') : '<div>None.</div>') + '</body></html>';
    var name = 'screen-free-rewards_summary_' + String(s.name).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '_' + day + '.pdf';
    return Utilities.newBlob(h, 'text/html', 'summary.html').getAs('application/pdf').setName(name);
  } catch (err) {
    return null;
  }
}

// Hourly trigger. For every family it sends the report of the day that just ended (in that family's time zone) once.
function midnightSummaries() {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), now = new Date(), count = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('room:') !== 0) return;
    var id = k.slice(5), room = JSON.parse(all[k]);
    if (!room.snaps || !room.to || !room.to.length) return;
    var tz = room.tz || Session.getScriptTimeZone(), local;
    try { local = Utilities.formatDate(now, tz, 'yyyy-MM-dd'); } catch (e) { tz = Session.getScriptTimeZone(); local = Utilities.formatDate(now, tz, 'yyyy-MM-dd'); }
    var yest = shiftDay_(local, -1), uids = {};
    Object.keys(room.snaps).forEach(function (sk) { uids[sk.split('|')[1]] = 1; });
    Object.keys(uids).forEach(function (uid) {
      var snap = room.snaps[yest + '|' + uid], note = '';
      if (!snap) {
        var older = Object.keys(room.snaps).filter(function (sk) { return sk.split('|')[1] === uid && sk.split('|')[0] < yest; }).sort().pop();
        if (!older) return;
        snap = room.snaps[older];
        note = 'The child\'s device did not sync on this day. These are the latest numbers from ' + snap.date + '.';
      }
      var key = yest + ':' + uid;
      if (!claimSent_(id, key, true)) return;
      var pdf = dailyPdf_(snap, yest), sentAny = false;
      room.to.forEach(function (t) {
        var to = cleanEmail_(t.e);
        if (!to || !allow_('send:' + to, MAX_SENDS_PER_ADDRESS_PER_DAY) || !allow_('all', MAX_EMAILS_PER_DAY)) return;
        var mail = { to: to, subject: APP_NAME + ' daily summary: ' + snap.name + ', ' + yest, body: dailyText_(snap, yest), htmlBody: dailyHtml_(snap, yest, note), name: APP_NAME };
        if (pdf) mail.attachments = [pdf];
        try { MailApp.sendEmail(mail); sentAny = true; count++; } catch (err) { /* quota or address problem: try the others */ }
      });
      if (!sentAny) claimSent_(id, key, false);
    });
  });
  return count;
}

// Run once from the editor (Run, installMidnightTrigger) and approve the permissions.
function installMidnightTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'midnightSummaries') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('midnightSummaries').timeBased().everyHours(1).create();
}

// ---- pairing, sync and remote controls ----------------------------------------------------------------------
function randomText_(n) {
  var s = '';
  for (var i = 0; i < n; i++) s += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
  return s;
}

function roomGet_(id) {
  var raw = PropertiesService.getScriptProperties().getProperty('room:' + String(id));
  return raw ? JSON.parse(raw) : null;
}

function roomPut_(id, room) {
  while (JSON.stringify(room).length > MAX_ROOM_JSON) {
    var days = Object.keys(room.usage || {}).sort();
    if (days.length > 1) { delete room.usage[days[0]]; continue; }
    var snaps = Object.keys(room.snaps || {}).sort();
    if (snaps.length <= 2) break;
    delete room.snaps[snaps[0]];
  }
  PropertiesService.getScriptProperties().setProperty('room:' + String(id), JSON.stringify(room));
}

function roomAuth_(d) {
  var id = String(d.roomId || '');
  var room = id ? roomGet_(id) : null;
  if (!room || !d.secret || String(d.secret) !== room.secret) return null;
  return { id: id, room: room };
}

// Hourly call counter kept in the cache (not in script properties) so polling does not use up storage writes
function roomBusy_(id) {
  var cache = CacheService.getScriptCache();
  var k = 'h:' + id;
  var n = Number(cache.get(k) || 0);
  if (n >= MAX_CALLS_PER_ROOM_PER_HOUR) return true;
  cache.put(k, String(n + 1), 3600);
  return false;
}

function newCode_(roomId) {
  var code = randomText_(8);
  CacheService.getScriptCache().put('p:' + code, roomId, PAIR_TTL);
  return { code: code.slice(0, 4) + '-' + code.slice(4), expires: Date.now() + PAIR_TTL * 1000 };
}

function pairStart_(d) {
  if (!allow_('rooms', MAX_NEW_ROOMS_PER_DAY)) return { ok: false, error: 'daily limit reached' };
  var id = randomText_(10);
  var room = {
    secret: Utilities.getUuid().replace(/-/g, ''),
    childName: clip_(d.childName || 'Child', 40),
    created: Date.now(), seen: 0, parents: [], usage: {},
    controls: { rev: 0, deviceLocked: false, message: '', lockedApps: {}, by: '' }
  };
  roomPut_(id, room);
  var c = newCode_(id);
  return { ok: true, roomId: id, secret: room.secret, code: c.code, expires: c.expires };
}

function pairCode_(d) {
  var a = roomAuth_(d);
  if (!a) return { ok: false, error: 'not paired' };
  var c = newCode_(a.id);
  return { ok: true, code: c.code, expires: c.expires, parents: a.room.parents.map(function (p) { return p.name; }) };
}

function pairJoin_(d) {
  if (!allow_('joins', 300)) return { ok: false, error: 'too many tries, wait a while' };
  var code = String(d.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var id = code.length === 8 ? CacheService.getScriptCache().get('p:' + code) : null;
  var room = id ? roomGet_(id) : null;
  if (!room) return { ok: false, error: 'invalid or expired code' };
  if (room.parents.length >= 4) return { ok: false, error: 'too many parent phones' };
  room.parents.push({ name: clip_(d.parentName || 'Parent', 40), at: Date.now() });
  roomPut_(id, room);
  return { ok: true, roomId: id, secret: room.secret, childName: room.childName };
}

function sync_(d) {
  var a = roomAuth_(d);
  if (!a) return { ok: false, error: 'not paired' };
  if (roomBusy_(a.id)) return { ok: false, error: 'too many requests, slow down' };
  var room = a.room, changed = false;
  if (d.name && clip_(d.name, 40) !== room.childName) { room.childName = clip_(d.name, 40); changed = true; }
  var u = d.usage, date = '';
  if (u && /^\d{4}-\d{2}-\d{2}$/.test(String(u.date || ''))) {
    date = u.date;
    var rec = room.usage[date] || { total: null, inApp: 0, src: 'app', apps: [], appsApp: [] };
    var apps = (u.apps || []).slice(0, 60).map(function (x) {
      return { k: clip_(x.k, 120), n: clip_(x.n || x.k, 60), m: Math.max(0, Math.round(Number(x.m) || 0)) };
    }).sort(function (p, q) { return q.m - p.m; }).slice(0, 30);
    if (u.src === 'companion') {
      // the native companion owns the device-wide total and the per-app list
      rec.total = u.total === null || u.total === undefined ? null : Math.max(0, Math.round(Number(u.total) || 0));
      rec.apps = apps;
      rec.src = 'companion';
    } else {
      // the web app owns its own minutes and the apps parents logged by hand
      rec.inApp = Math.max(0, Math.round(Number(u.inApp) || 0));
      rec.appsApp = apps.slice(0, 15);
    }
    rec.at = Date.now();
    room.usage[date] = rec;
    var days = Object.keys(room.usage).sort();
    while (days.length > 7) delete room.usage[days.shift()];
    changed = true;
  }
  if (storeDaily_(room, d)) changed = true;
  if (Date.now() - (room.seen || 0) > 120000) { room.seen = Date.now(); changed = true; }
  if (changed) roomPut_(a.id, room);
  var q = String(d.date || date || '');
  var rd = q && room.usage[q] && room.usage[q].src === 'companion' ? room.usage[q] : null;
  return {
    ok: true, controls: room.controls, parents: room.parents.map(function (p) { return p.name; }),
    companion: rd ? { total: rd.total, apps: rd.apps, at: rd.at } : null
  };
}

function syncPull_(d) {
  var a = roomAuth_(d);
  if (!a) return { ok: false, error: 'not paired' };
  if (roomBusy_(a.id)) return { ok: false, error: 'too many requests, slow down' };
  var r = a.room;
  return { ok: true, childName: r.childName, usage: r.usage, controls: r.controls, seen: r.seen, parents: r.parents.map(function (p) { return p.name; }) };
}

function ctrlSet_(d) {
  var a = roomAuth_(d);
  if (!a) return { ok: false, error: 'not paired' };
  if (roomBusy_(a.id)) return { ok: false, error: 'too many requests, slow down' };
  var c = d.controls || {};
  var locked = {};
  var keys = Object.keys(c.lockedApps || {}).slice(0, 60);
  keys.forEach(function (k) { if (c.lockedApps[k]) locked[clip_(k, 120)] = true; });
  a.room.controls = { rev: (a.room.controls.rev || 0) + 1, deviceLocked: !!c.deviceLocked, message: clip_(c.message || '', 140), lockedApps: locked, by: clip_(d.by || 'parent', 20) };
  roomPut_(a.id, a.room);
  return { ok: true, controls: a.room.controls };
}

function unpair_(d) {
  var a = roomAuth_(d);
  if (!a) return { ok: false, error: 'not paired' };
  PropertiesService.getScriptProperties().deleteProperty('room:' + a.id);
  PropertiesService.getScriptProperties().deleteProperty('sent:' + a.id);
  return { ok: true };
}

// ---- helpers -------------------------------------------------------------------------------------------------
function cleanEmail_(s) {
  s = String(s || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 120 ? s : '';
}

function clip_(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n) : s;
}

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SECRET', s); }
  return s;
}

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function hash_(text) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, secret_() + '|' + text));
}

function token_(email) {
  return hex_(Utilities.computeHmacSha256Signature(email, secret_()));
}

function allow_(key, limit) {
  var props = PropertiesService.getScriptProperties();
  var day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var k = 'n:' + day + ':' + key;
  var n = Number(props.getProperty(k) || 0);
  if (n >= limit) return false;
  props.setProperty(k, String(n + 1));
  return true;
}

// Run this from the editor now and then to remove old counters
function cleanup() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  Object.keys(all).forEach(function (k) { if (k.indexOf('n:') === 0 && k.indexOf('n:' + today + ':') !== 0) props.deleteProperty(k); });
  // rooms not used for 60 days
  Object.keys(all).forEach(function (k) { if (k.indexOf('room:') === 0) { var r = JSON.parse(all[k]); if (Date.now() - (r.seen || r.created) > 60 * 86400000) { props.deleteProperty(k); props.deleteProperty('sent:' + k.slice(5)); } } });
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
