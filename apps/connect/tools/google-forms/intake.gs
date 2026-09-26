/**
 * Citizens Connect — Google Form → map Contributor intake.
 *
 * Bound to the responses Sheet "New 219-Connect Contributor (Responses)".
 * Ticking "Approve" on a row is the ONLY manual step: this script sends the
 * row to Connect (HMAC-signed), Connect puts the Contributor live on the map
 * and in Kingdom Discovery, this script writes Status / Listing URL /
 * Processed at / Notes back to the row, then emails the owner a welcome
 * asking them to sign in with Google using their owner email.
 *
 * Setup: see README.md in this folder (run setup() once).
 * Server side: apps/connect/src/app/api/intake/google-form/route.ts.
 * Secrets live in Script properties (INTAKE_URL, INTAKE_SECRET) — never here.
 */

var SHEET_NAME = 'Form Responses 1';

// Keep in sync with MAX_IMAGE_BYTES in apps/connect/src/lib/intake/googleForm.ts.
// Two images at this size stay under Vercel's ~4.5 MB request limit.
var MAX_IMAGE_BYTES = 1500000;
var RESIZE_WIDTH = { logo: 800, cover: 1600 };

var STATUS_LIVE = 'Live ✓';
var STATUS_PROCESSING = 'Processing…';
var STATUS_ERROR = 'Error';

// Columns the founder adds to the right of the Form's columns.
var MANUAL_HEADERS = ['Approve', 'Status', 'Listing URL', 'Processed at', 'Notes'];

// Form columns are found by their "Question N.N:" prefix, never by position —
// Google inserts columns whenever the Form is edited.
var Q = {
  ownerEmail: 'Question 1.3:',
  name: 'Question 2.1:',
  type: 'Question 2.2:',
  category: 'Question 2.3:',
  fixed: 'Question 3.1:',
  address: 'Question 3.2:',
  maps: 'Question 3.3:',
  bio: 'Question 4.1:',
  website: 'Question 4.2:',
  contactEmail: 'Question 4.3:',
  instagram: 'Question 5.1:',
  facebook: 'Question 5.2:',
  tiktok: 'Question 5.3:',
  youtube: 'Question 5.4:',
  x: 'Question 5.5:',
  linkedin: 'Question 5.6:',
  whatsapp: 'Question 5.7:',
  logo: 'Question 6.1:',
  cover: 'Question 6.2:',
  faith: 'Question 7.4:',
  permission: 'Question 7.5:',
};

// ── Setup ────────────────────────────────────────────────────────────────

/** Run once from the Apps Script editor. Safe to re-run. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('INTAKE_URL') || !props.getProperty('INTAKE_SECRET')) {
    throw new Error('Add the Script properties INTAKE_URL and INTAKE_SECRET first (Project Settings → Script properties).');
  }
  columns_(getSheet_()); // throws, naming any missing header

  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onApproveEdit') ScriptApp.deleteTrigger(t);
  });
  // An INSTALLABLE trigger: a simple onEdit() may not call UrlFetchApp/MailApp.
  ScriptApp.newTrigger('onApproveEdit').forSpreadsheet(ss).onEdit().create();
  ss.toast('Intake is ready. Tick "Approve" on a row to publish it.', 'Citizens Connect', 10);
}

/**
 * Optional check after setup: sends a signed EMPTY request. Connect answers
 * "consent_required" when the secret matches (nothing is created) and
 * "unauthorized" when it doesn't.
 */
function testConnection() {
  var res = post_({});
  var verdict = res.code === 400 && res.body.error === 'consent_required'
    ? 'Connected ✓ — the secret matches.'
    : res.code === 401
      ? 'The secret does NOT match Vercel\'s INTAKE_WEBHOOK_SECRET.'
      : res.code === 503
        ? 'Vercel has no INTAKE_WEBHOOK_SECRET yet (add it, then redeploy).'
        : 'Unexpected reply ' + res.code + ': ' + JSON.stringify(res.body);
  Logger.log(verdict);
  SpreadsheetApp.getActive().toast(verdict, 'Citizens Connect', 15);
}

// ── Trigger ──────────────────────────────────────────────────────────────

function onApproveEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  var cols = columns_(sheet);
  var approveCol = cols.Approve;
  if (approveCol < e.range.getColumn() || approveCol > e.range.getLastColumn()) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    sheet.getRange(e.range.getRow(), cols.Notes).setValue('Busy with another row — untick and tick Approve again.');
    sheet.getRange(e.range.getRow(), approveCol).setValue(false);
    return;
  }
  try {
    for (var row = Math.max(2, e.range.getRow()); row <= e.range.getLastRow(); row++) {
      processRow_(sheet, cols, row);
    }
  } finally {
    lock.releaseLock();
  }
}

function processRow_(sheet, cols, row) {
  var values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  var val = function (key) { return values[cols[key] - 1]; };
  var str = function (key) { var v = val(key); return v === null || v === undefined ? '' : String(v).trim(); };

  if (val('Approve') !== true) return;
  var status = str('Status');
  if (status === STATUS_LIVE || status === STATUS_PROCESSING) return; // already done / in flight

  var cell = function (header, value) { sheet.getRange(row, cols[header]).setValue(value); };
  cell('Status', STATUS_PROCESSING);
  cell('Notes', '');
  SpreadsheetApp.flush();

  var notes = [];
  try {
    var payload = buildPayload_(str, notes);
    var res = post_(payload);
    if (res.code === 200 && res.body.success) {
      notes = notes.concat(res.body.warnings || []);
      cell('Status', STATUS_LIVE);
      cell('Listing URL', res.body.url);
      cell('Processed at', new Date());
      try {
        sendWelcome_(payload.owner_email, payload.organisation_name, res.body.url);
      } catch (mailErr) {
        notes.push('Listing is live, but the welcome email failed: ' + mailErr.message);
      }
    } else {
      var reason = (res.body && (res.body.message || res.body.error)) || ('HTTP ' + res.code);
      throw new Error(reason);
    }
  } catch (err) {
    cell('Status', STATUS_ERROR);
    notes.unshift(err.message);
    cell('Approve', false); // fix the row, then tick again to retry
  }
  cell('Notes', notes.join('\n'));
}

// ── Payload ──────────────────────────────────────────────────────────────

function buildPayload_(str, notes) {
  var address = str(Q.address);
  var payload = {
    owner_email: str(Q.ownerEmail),
    organisation_name: str(Q.name),
    organisation_type: str(Q.type),
    primary_category: str(Q.category),
    fixed_location: str(Q.fixed),
    street_address: address,
    maps_link: resolveMapsLink_(str(Q.maps)),
    bio: str(Q.bio),
    website: str(Q.website),
    contact_email: str(Q.contactEmail),
    instagram: str(Q.instagram),
    facebook: str(Q.facebook),
    tiktok: str(Q.tiktok),
    youtube: str(Q.youtube),
    x: str(Q.x),
    linkedin: str(Q.linkedin),
    whatsapp: str(Q.whatsapp),
    faith_alignment: str(Q.faith) !== '',
    permission_to_publish: str(Q.permission) !== '' && !/^no\b/i.test(str(Q.permission)),
    logo: image_(str(Q.logo), 'logo', notes),
    cover: image_(str(Q.cover), 'cover', notes),
  };
  // Google's own geocoder (free inside Apps Script) as a location hint — used
  // by Connect only when the Maps link carries no coordinates.
  if (address && !/^no\b/i.test(payload.fixed_location)) payload.geocoded = geocode_(address);
  return payload;
}

/** maps.app.goo.gl / goo.gl/maps short links → the long URL (which carries coordinates). */
function resolveMapsLink_(link) {
  var url = link;
  for (var hop = 0; hop < 5 && /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(url); hop++) {
    try {
      var res = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
      var headers = res.getHeaders();
      var next = headers.Location || headers.location;
      if (!next) break;
      url = next;
    } catch (err) {
      break;
    }
  }
  return url;
}

function geocode_(address) {
  try {
    var result = Maps.newGeocoder().setRegion('za').geocode(address);
    var loc = result.status === 'OK' && result.results[0] && result.results[0].geometry.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch (err) {
    return null;
  }
}

/** First Drive file in a Form upload cell → {mime, base64}, or null (+ a note why). */
function image_(cellValue, role, notes) {
  var label = role === 'logo' ? 'Logo' : 'Cover photo';
  var m = cellValue && (cellValue.match(/[?&]id=([\w-]{10,})/) || cellValue.match(/\/d\/([\w-]{10,})/));
  if (!m) {
    if (cellValue) notes.push(label + ' skipped: no Drive file link in the cell.');
    return null;
  }
  try {
    var file = DriveApp.getFileById(m[1]);
    var blob = file.getSize() <= MAX_IMAGE_BYTES ? file.getBlob() : resized_(m[1], RESIZE_WIDTH[role]);
    if (!blob || blob.getBytes().length > MAX_IMAGE_BYTES) {
      notes.push(label + ' skipped: too large even after resizing — the owner can add it from the dashboard.');
      return null;
    }
    return { mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
  } catch (err) {
    notes.push(label + ' skipped: ' + err.message);
    return null;
  }
}

/** A smaller copy via Drive's thumbnail service (phone photos are often 3–6 MB). */
function resized_(fileId, width) {
  var auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  var meta = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?fields=thumbnailLink',
    { headers: auth, muteHttpExceptions: true }
  );
  if (meta.getResponseCode() !== 200) return null;
  var link = JSON.parse(meta.getContentText()).thumbnailLink;
  if (!link) return null;
  var res = UrlFetchApp.fetch(link.replace(/=s\d+$/, '=w' + width), { headers: auth, muteHttpExceptions: true });
  return res.getResponseCode() === 200 ? res.getBlob() : null;
}

// ── Transport ────────────────────────────────────────────────────────────

/** Signed POST to Connect. Returns {code, body}. */
function post_(payload) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('INTAKE_URL');
  var secret = props.getProperty('INTAKE_SECRET');
  if (!url || !secret) throw new Error('Script properties INTAKE_URL / INTAKE_SECRET are not set.');

  // Pure-ASCII JSON (non-ASCII escaped as \uXXXX) so the bytes Connect
  // verifies are byte-for-byte the string signed here, whatever the charset.
  var body = JSON.stringify(payload).replace(/[\u007f-￿]/g, function (c) {
    return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
  var ts = String(Math.floor(Date.now() / 1000));
  var signature = Utilities.computeHmacSha256Signature(ts + '.' + body, secret)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
    .join('');

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    headers: { 'X-Intake-Timestamp': ts, 'X-Intake-Signature': signature },
    muteHttpExceptions: true,
    followRedirects: false,
  });
  var code = res.getResponseCode();
  if (code >= 300 && code < 400) {
    return { code: code, body: { error: 'redirect', message: 'INTAKE_URL redirects — set it to the exact https://www… address in the README.' } };
  }
  var parsed = {};
  try { parsed = JSON.parse(res.getContentText()); } catch (err) { /* non-JSON error page */ }
  return { code: code, body: parsed };
}

// ── Welcome email ────────────────────────────────────────────────────────

function sendWelcome_(ownerEmail, orgName, listingUrl) {
  var appUrl = PropertiesService.getScriptProperties().getProperty('INTAKE_URL').replace(/\/api\/.*$/, '');
  var signInUrl = escapeHtml_(appUrl + '/dashboard');
  var safeListingUrl = escapeHtml_(listingUrl);
  var safeName = escapeHtml_(orgName);
  var safeEmail = escapeHtml_(ownerEmail);

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1f1f1f;line-height:1.55">' +
    '<h2 style="color:#A67C00;margin:0 0 12px">' + safeName + ' is live on Citizens Connect 🎉</h2>' +
    '<p>Thank you for joining the Body on Citizens Connect — you\'re now on the map and in Kingdom Discovery, ' +
    'where citizens across the city can find, follow and connect with you.</p>' +
    '<p><a href="' + safeListingUrl + '" style="color:#A67C00">View your listing</a></p>' +
    '<p><strong>To manage your profile</strong>, sign in with <strong>Google</strong> using exactly ' +
    '<strong>' + safeEmail + '</strong>:</p>' +
    '<p><a href="' + signInUrl + '" style="display:inline-block;background:#A67C00;color:#fff;padding:12px 20px;' +
    'border-radius:10px;text-decoration:none;font-weight:bold">Sign in to your Contributor Portal</a></p>' +
    '<p style="font-size:13px;color:#555">Signed in with a different Google account by mistake? Sign out, then sign in ' +
    'again with ' + safeEmail + ' — your listing belongs to that address.</p>' +
    '<p>Connecting the Kingdom — one citizen, one contributor, one need at a time.<br>The Citizens Connect team</p>' +
    '</div>';

  var text =
    orgName + ' is live on Citizens Connect.\n\n' +
    'View your listing: ' + listingUrl + '\n\n' +
    'To manage your profile, sign in with Google using exactly ' + ownerEmail + ':\n' + appUrl + '/dashboard\n\n' +
    'Signed in with a different Google account? Sign out, then sign in again with ' + ownerEmail + '.\n\n' +
    'The Citizens Connect team';

  MailApp.sendEmail({
    to: ownerEmail,
    subject: 'You\'re live on Citizens Connect — ' + orgName,
    body: text,
    htmlBody: html,
    name: 'Citizens Connect',
  });
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ── Sheet helpers ────────────────────────────────────────────────────────

function getSheet_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No tab named "' + SHEET_NAME + '" in this spreadsheet.');
  return sheet;
}

/** {header or "Question N.N:" prefix → 1-based column}. Throws naming anything missing. */
function columns_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) {
    return String(h).trim();
  });
  var cols = {};
  var missing = [];
  MANUAL_HEADERS.forEach(function (name) {
    var i = headers.indexOf(name);
    if (i === -1) missing.push(name); else cols[name] = i + 1;
  });
  Object.keys(Q).forEach(function (key) {
    var prefix = Q[key];
    var i = -1;
    for (var c = 0; c < headers.length; c++) {
      if (headers[c].indexOf(prefix) === 0) { i = c; break; }
    }
    if (i === -1) missing.push(prefix); else cols[prefix] = i + 1;
  });
  if (missing.length) throw new Error('Missing column header(s): ' + missing.join(', '));
  return cols;
}
