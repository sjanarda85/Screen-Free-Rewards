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
var MAX_LOGO_BASE64 = 20000;        // the small PNG logo shown at the top of the email
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
  var logo = logoBlob_(d.logoBase64);
  if (logo && d.htmlBody) mail.inlineImages = { logo: logo };
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
// Accepts only a small real PNG (checked by its first bytes) so the logo cannot be used to send anything else.
function logoBlob_(b64) {
  if (!b64) return null;
  b64 = String(b64).replace(/^data:[^,]*,/, '');
  if (b64.length > MAX_LOGO_BASE64) return null;
  try {
    var bytes = Utilities.base64Decode(b64);
    if (bytes.length < 8 || (bytes[0] & 255) !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return null;
    return Utilities.newBlob(bytes, 'image/png', 'logo.png');
  } catch (err) {
    return null;
  }
}

var LOGO_PNG = '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';

function dailyHtml_(s, day, note) {
  var F = 'font-family:Helvetica,Arial,sans-serif;';
  var C = { page: '#eaf0fb', card: '#ffffff', band: '#2563eb', band2: '#1d4ed8', bar: '#60a5fa', tile: '#f3f7ff', tl: '#dbe7ff', ink: '#0f172a', mut: '#64748b', line: '#e5eaf3', blue: '#1d4ed8', chip: '#e0ebff', box: '#f6f8fc', pos: '#059669', warn: '#b45309', foot: '#f1f5fb' };
  function sec(t) { return '<tr><td style="padding:22px 0 8px 0;"><span style="display:inline-block;background:' + C.chip + ';color:' + C.blue + ';' + F + 'font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:7px 14px;border-radius:999px;">' + t + '</span></td></tr>'; }
  function row(l, v, c, b) { return '<tr><td style="padding:10px 0;border-bottom:1px solid ' + C.line + ';' + F + 'font-size:14px;color:' + (b ? C.ink : C.mut) + ';font-weight:' + (b ? 700 : 400) + ';">' + l + '</td><td align="right" style="padding:10px 0;border-bottom:1px solid ' + C.line + ';' + F + 'font-size:14px;font-weight:' + (b || c ? 700 : 400) + ';color:' + (c || C.ink) + ';">' + v + '</td></tr>'; }
  function box(r) { return '<tr><td bgcolor="' + C.box + '" style="background:' + C.box + ';padding:4px 18px 8px 18px;border-radius:10px;border:1px solid ' + C.line + ';"><table width="100%" cellpadding="0" cellspacing="0" border="0">' + r + '</table></td></tr>'; }
  function text(t) { return '<tr><td bgcolor="' + C.box + '" style="background:' + C.box + ';padding:14px 18px;' + F + 'font-size:14px;color:#1e293b;line-height:1.6;border-radius:10px;border:1px solid ' + C.line + ';">' + t + '</td></tr>'; }
  function tile(label, val, sub, c) { return '<td width="50%" valign="top" style="padding:0 6px 12px 6px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="' + C.tile + '" style="background:' + C.tile + ';border:1px solid ' + C.tl + ';border-radius:12px;padding:14px 16px;"><div style="' + F + 'font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:' + C.mut + ';font-weight:700;">' + label + '</div><div style="' + F + 'font-size:30px;font-weight:700;color:' + c + ';line-height:1.2;margin-top:4px;">' + val + '</div><div style="' + F + 'font-size:12px;color:' + C.mut + ';margin-top:2px;">' + sub + '</div></td></tr></table></td>'; }
  var unused = Math.max(0, s.scheduled - s.mins), status = s.open.length ? 'Needs attention' : 'All clear';
  var tasks = s.tasks.length ? s.tasks.map(function (x) { return '&bull; ' + esc_(x.t) + ' (+' + x.p + ' pts)'; }).join('<br>') : 'None.';
  var open = s.open.length ? s.open.map(function (x) { return '&bull; <b>' + esc_(x.k) + '</b>: ' + esc_(x.n) + (x.c ? ' (' + x.c + ' pts)' : ''); }).join('<br>') : 'None.';
  var comment = esc_(s.name) + ' spent ' + s.mins + ' min screen free and earned ' + s.earned + ' points.' + (s.pending ? ' ' + s.pending + ' points are waiting for your approval.' : '');
  var band = 'background:' + C.band + ';background-image:linear-gradient(135deg,' + C.band2 + ',' + C.band + ' 60%,#3b82f6);';
  var body = '<tr><td style="padding:18px 0 0 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' + tile('Balance', s.balance, 'points', C.blue) + tile('Earned that day', '+' + s.earned, 'points', C.pos) + '</tr><tr>' + tile('Pending', s.pending, 'awaiting approval', s.pending ? C.warn : C.ink) + tile('Screen free', s.mins, 'of ' + s.scheduled + ' min', C.ink) + '</tr></table></td></tr>' +
    sec('Child') + box(row('Name', esc_(s.name)) + row('Age', s.age ? String(s.age) : '-') + row('Status', status, s.open.length ? C.warn : C.pos, true)) +
    sec('Points') + box(row('Balance', s.balance + ' pts', C.blue, true) + row('Pending approval', s.pending + ' pts', s.pending ? C.warn : null) + row('Earned that day', '+' + s.earned + ' pts', C.pos)) +
    sec('Screen-free time') + box(row('Scheduled', s.scheduled + ' min') + row('Actual timer', s.mins + ' min', C.blue, true) + row('Unused', unused + ' min')) +
    sec('Open requests (' + s.open.length + ')') + text(open) + sec('Open tasks (' + s.tasks.length + ')') + text(tasks) +
    sec('Commentary') + text(comment + (note ? '<br><span style="color:' + C.mut + ';">' + esc_(note) + '</span>' : ''));
  return '<!doctype html><html style="background:' + C.page + ';color-scheme:light only;"><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"></head><body bgcolor="' + C.page + '" style="margin:0;padding:0;background:' + C.page + ';">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.page + '" style="background:' + C.page + ';"><tr><td align="center" style="padding:28px 12px;">' +
    '<table width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.card + '" style="width:100%;max-width:640px;background:' + C.card + ';border-radius:14px;border:1px solid ' + C.tl + ';">' +
    '<tr><td bgcolor="' + C.band + '" style="' + band + 'padding:26px 28px;border-radius:14px 14px 0 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td width="68" valign="middle"><img src="cid:logo" width="56" height="56" alt="&#10022;" style="display:block;border:0;border-radius:14px;width:56px;height:56px;"></td>' +
    '<td valign="middle"><div style="' + F + 'font-size:20px;font-weight:700;color:#ffffff;">' + APP_NAME + '</div><div style="' + F + 'font-size:12px;color:#dbeafe;margin-top:4px;">Daily summary &middot; sent at midnight</div></td>' +
    '<td align="right" valign="middle"><div style="' + F + 'font-size:16px;font-weight:700;color:#ffffff;">' + esc_(day) + '</div><div style="' + F + 'font-size:12px;color:#dbeafe;margin-top:4px;">' + esc_(s.name) + '</div></td></tr></table></td></tr>' +
    '<tr><td bgcolor="' + C.bar + '" style="background:' + C.bar + ';height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>' +
    '<tr><td bgcolor="' + C.card + '" style="padding:8px 28px 28px 28px;background:' + C.card + ';"><table width="100%" cellpadding="0" cellspacing="0" border="0">' + body + '</table></td></tr>' +
    '<tr><td bgcolor="' + C.foot + '" style="background:' + C.foot + ';padding:20px 28px 24px 28px;border-radius:0 0 14px 14px;border-top:1px solid ' + C.line + ';"><div style="' + F + 'font-size:12px;color:' + C.mut + ';line-height:1.7;"><b style="color:' + C.blue + ';font-size:13px;">' + APP_NAME + '</b><br>Open the app and sign in as a parent to approve points and decide requests.<br>The report is attached as a PDF. Balance is as of the last time the child\'s device synced.</div></td></tr>' +
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
        var lg = logoBlob_(LOGO_PNG);
        if (lg) mail.inlineImages = { logo: lg };
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
