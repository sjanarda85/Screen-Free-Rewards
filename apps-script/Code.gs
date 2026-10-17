/**
 * Screen Free Rewards mail relay (Google Apps Script web app).
 *
 * Same contract as the Thakazhi Peedika daily summary: the app builds a PDF in the browser and posts JSON as text/plain:
 *   { to, subject, message, htmlBody, fromName, attachmentName, attachmentBase64 }
 * This script emails it from your Google account. No activation and no mail app.
 * Setup: apps-script/SETUP.md
 */

// Only these addresses can receive mail through this link. Leave empty to allow any address.
var ALLOWED_RECIPIENTS = []; // example: ['sam@example.com', 'alex@example.com']
var MAX_PER_DAY = 60;        // safety limit, Google also caps free accounts at about 100 a day

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var to = String(d.to || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return out({ ok: false, error: 'bad recipient' });
    if (ALLOWED_RECIPIENTS.length && ALLOWED_RECIPIENTS.map(function (x) { return x.toLowerCase(); }).indexOf(to.toLowerCase()) < 0) {
      return out({ ok: false, error: 'recipient not allowed' });
    }
    var props = PropertiesService.getScriptProperties();
    var key = 'sent-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var count = Number(props.getProperty(key) || 0);
    if (count >= MAX_PER_DAY) return out({ ok: false, error: 'daily limit reached' });

    var mail = {
      to: to,
      subject: String(d.subject || 'Screen Free Rewards'),
      body: String(d.message || ''),
      name: String(d.fromName || 'Screen Free Rewards')
    };
    if (d.htmlBody) mail.htmlBody = String(d.htmlBody);
    if (d.attachmentBase64) {
      var b64 = String(d.attachmentBase64).replace(/^data:[^,]*,/, '');
      mail.attachments = [Utilities.newBlob(Utilities.base64Decode(b64), 'application/pdf', String(d.attachmentName || 'summary.pdf'))];
    }
    MailApp.sendEmail(mail);
    props.setProperty(key, String(count + 1));
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doGet() {
  return out({ ok: true, service: 'Screen Free Rewards mail relay' });
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
