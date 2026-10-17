/**
 * Screen Free Rewards shared relay (Google Apps Script web app), version 3: email, device pairing and remote controls.
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
    if (action === 'unpair') return out(unpair_(d));
    return out(send_(d));
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet() {
  return out({ ok: true, service: APP_NAME + ' relay', version: 3 });
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
    if (days.length <= 1) break;
    delete room.usage[days[0]];
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
  Object.keys(all).forEach(function (k) { if (k.indexOf('room:') === 0) { var r = JSON.parse(all[k]); if (Date.now() - (r.seen || r.created) > 60 * 86400000) props.deleteProperty(k); } });
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
