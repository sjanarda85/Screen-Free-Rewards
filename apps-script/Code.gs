/**
 * Screen Free Rewards shared mail relay (Google Apps Script web app), version 2.
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
 * Setup: apps-script/SETUP.md
 */

var APP_NAME = 'Screen Free Rewards';
var MAX_SENDS_PER_ADDRESS_PER_DAY = 40;
var MAX_CODES_PER_ADDRESS_PER_DAY = 4;
var MAX_EMAILS_PER_DAY = 90;          // all families together; free Google accounts allow about 100 a day
var MAX_ATTACHMENT_BASE64 = 200000;   // about 150 KB of PDF
var MAX_HTML = 60000;
var MAX_TEXT = 8000;

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = String(d.action || 'send');
    if (action === 'verify') return out(startVerify_(d));
    if (action === 'confirm') return out(confirmVerify_(d));
    return out(send_(d));
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet() {
  return out({ ok: true, service: APP_NAME + ' mail relay', version: 2 });
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
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
