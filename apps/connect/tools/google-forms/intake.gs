/**
 * Citizens Connect — Google Form → map Contributor intake.
 *
 * Bound to the responses Sheet "New 219-Connect Contributor (Responses)".
 * Ticking "Approve" on a row is the ONLY manual step: this script sends the
 * row to Connect (HMAC-signed). A new account goes live in Kingdom Discovery
 * (and on the map when it has a pin); this script writes Status / Listing URL /
 * Processed at / Notes back to the row, then emails the owner a welcome.
 * An owner email that already has a citizen account does NOT go live and
 * does NOT get that welcome. Connect emails that account a confirm link.
 * Status becomes "Awaiting confirmation". A 10-minute poll writes Live ✓,
 * Declined or Expired when the owner answers. The server sends the welcome
 * only after they confirm — this script must not send a second one.
 * Tick Resend to email the confirm link again (same expiry).
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
var STATUS_AWAITING = 'Awaiting confirmation';
var STATUS_DECLINED = 'Declined';
var STATUS_EXPIRED = 'Expired';

// Columns the founder adds to the right of the Form's columns.
// Request id and Resend are optional so a sheet that has not been updated
// still approves new accounts. setup() and onEdit append them.
var MANUAL_HEADERS = ['Approve', 'Status', 'Listing URL', 'Processed at', 'Notes'];
var OPTIONAL_HEADERS = ['Request id', 'Resend'];

// Form columns are found by the WORDING of each question (the text after
// "Question N.N:"), never by position or number — Google inserts columns
// whenever the Form is edited, and the founder renumbers questions when he
// reorders a section (2026-10-02: Section 7 was reordered, which silently
// pointed the old "Question 7.4/7.5" lookups at the wrong answers).
// Each phrase must match EXACTLY ONE column; setup() and every approval
// throw, naming the phrase, if one matches none or several.
var Q = {
  ownerEmail: "owner's email",
  name: 'organisation / ministry name',
  type: 'organisation type',
  category: 'primary category',
  fixed: 'fixed physical location',
  address: 'street address',
  maps: 'google maps link',
  bio: 'short bio',
  website: 'website',
  contactEmail: 'public contact email',
  instagram: 'instagram',
  facebook: 'facebook',
  tiktok: 'tiktok',
  youtube: 'youtube',
  x: 'x (twitter)',
  linkedin: 'linkedin',
  whatsapp: 'whatsapp',
  logo: 'logo/profile photo',
  cover: 'cover / banner photo',
  faith: 'faith alignment',
  permission: 'permission to publish',
  autoUpdate: 'keeping your listing up to date',
};

/**
 * "Keeping your listing up to date" answer → the consent level Connect stores.
 *   events_auto — publish events automatically, suggest everything else
 *   suggest     — suggest updates for approval
 *   off         — no reading of website / socials (also: blank, "No thanks", anything unrecognised)
 */
function autoUpdateLevel_(answer, notes) {
  var a = String(answer || '').trim();
  if (!a) return 'off';
  if (/^no\b/i.test(a)) return 'off';
  if (/publish events automatically/i.test(a)) return 'events_auto';
  if (/^yes\b/i.test(a)) return 'suggest';
  notes.push('Unrecognised "Keeping your listing up to date" answer — stored as off: ' + a);
  return 'off';
}

// ── Setup ────────────────────────────────────────────────────────────────

/** Run once from the Apps Script editor. Safe to re-run. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('INTAKE_URL') || !props.getProperty('INTAKE_SECRET')) {
    throw new Error('Add the Script properties INTAKE_URL and INTAKE_SECRET first (Project Settings → Script properties).');
  }
  var sheet = getSheet_();
  ensureManualHeaders_(sheet);
  columns_(sheet); // throws, naming any missing question

  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var handler = t.getHandlerFunction();
    if (handler === 'onApproveEdit' || handler === 'pollUpgrades') ScriptApp.deleteTrigger(t);
  });
  // An INSTALLABLE trigger: a simple onEdit() may not call UrlFetchApp/MailApp.
  ScriptApp.newTrigger('onApproveEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('pollUpgrades').timeBased().everyMinutes(10).create();
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
  ensureManualHeaders_(sheet);
  var cols = columns_(sheet);
  var approveCol = cols.Approve;
  var resendCol = cols.Resend || 0;
  var start = e.range.getColumn();
  var end = e.range.getLastColumn();
  var touchesApprove = approveCol >= start && approveCol <= end;
  var touchesResend = resendCol && resendCol >= start && resendCol <= end;
  if (!touchesApprove && !touchesResend) return;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    sheet.getRange(e.range.getRow(), cols.Notes).setValue('Busy with another row — untick and tick Approve again.');
    if (touchesApprove) sheet.getRange(e.range.getRow(), approveCol).setValue(false);
    if (touchesResend) sheet.getRange(e.range.getRow(), resendCol).setValue(false);
    return;
  }
  try {
    for (var row = Math.max(2, e.range.getRow()); row <= e.range.getLastRow(); row++) {
      if (touchesResend) resendRow_(sheet, cols, row);
      if (touchesApprove) processRow_(sheet, cols, row);
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
  // Awaiting confirmation is waiting on the owner, not an error. Leave it.
  if (status === STATUS_LIVE || status === STATUS_PROCESSING || status === STATUS_AWAITING) return;

  var cell = function (header, value) { sheet.getRange(row, cols[header]).setValue(value); };
  cell('Status', STATUS_PROCESSING);
  cell('Notes', '');
  SpreadsheetApp.flush();

  var notes = [];
  try {
    var payload = buildPayload_(str, notes);
    var res = post_(payload);
    var outcome = intakeOutcome_(res);
    notes = notes.concat((res.body && res.body.warnings) || []);
    if (outcome.kind === 'awaiting') {
      cell('Status', STATUS_AWAITING);
      if (cols['Request id']) cell('Request id', outcome.requestId);
      cell('Processed at', new Date());
      if (outcome.message) notes.push(outcome.message);
    } else if (outcome.kind === 'live') {
      cell('Status', STATUS_LIVE);
      cell('Listing URL', res.body.url);
      cell('Processed at', new Date());
      try {
        // on_map comes from Connect (it resolves the pin: maps link, geocode, MapTiler); anything but true is "no pin"
        sendWelcome_(payload.owner_email, payload.organisation_name, res.body.url, res.body.on_map === true);
      } catch (mailErr) {
        notes.push('Listing is live, but the welcome email failed: ' + mailErr.message);
      }
    } else {
      throw new Error(outcome.message);
    }
  } catch (err) {
    cell('Status', STATUS_ERROR);
    notes.unshift(err.message);
    cell('Approve', false); // fix the row, then tick again to retry
  }
  cell('Notes', notes.join('\n'));
}

/**
 * What a signed intake reply means for the row. Pure so the tests can pin it.
 * Awaiting confirmation must not send the welcome. Live still does.
 */
function intakeOutcome_(res) {
  var body = res && res.body;
  if (res && res.code === 200 && body && body.success && body.status === 'awaiting_confirmation') {
    if (!body.request_id) return { kind: 'error', message: body.message || 'Confirmation started, but no request id came back.' };
    return { kind: 'awaiting', requestId: body.request_id, message: body.message || '' };
  }
  if (res && res.code === 200 && body && body.success) {
    return { kind: 'live' };
  }
  var reason = (body && (body.message || body.error)) || ('HTTP ' + (res && res.code));
  return { kind: 'error', message: reason };
}

/** What a status-poll row means. confirmed does not send a welcome from the sheet. */
function pollOutcome_(row) {
  if (!row || !row.status) return { kind: 'unchanged' };
  if (row.status === 'confirmed' && row.url) return { kind: 'live', url: row.url, onMap: row.on_map === true };
  if (row.status === 'declined') return { kind: 'declined' };
  if (row.status === 'expired') return { kind: 'expired' };
  return { kind: 'unchanged' };
}

function resendRow_(sheet, cols, row) {
  if (!cols.Resend || !cols['Request id']) return;
  var values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  var val = function (key) { return values[cols[key] - 1]; };
  var str = function (key) { var v = val(key); return v === null || v === undefined ? '' : String(v).trim(); };
  if (val('Resend') !== true) return;
  var cell = function (header, value) { sheet.getRange(row, cols[header]).setValue(value); };
  cell('Resend', false);
  if (str('Status') !== STATUS_AWAITING || !str('Request id')) {
    cell('Notes', 'Resend only works while Status is Awaiting confirmation and a Request id is present.');
    return;
  }
  var res = post_({ id: str('Request id') }, 'resend');
  if (res.code === 200 && res.body && res.body.success) {
    cell('Notes', res.body.message || 'Confirmation email sent again.');
    return;
  }
  if (res.code === 429) {
    cell('Notes', 'Resend is limited. Try again later.');
    return;
  }
  cell('Notes', (res.body && (res.body.message || res.body.error)) || ('HTTP ' + res.code));
}

/** Every 10 minutes: rows left on Awaiting confirmation. Never sends a welcome. */
function pollUpgrades() {
  var sheet = getSheet_();
  var cols = columns_(sheet);
  if (!cols['Request id']) return;
  var last = sheet.getLastRow();
  if (last < 2) return;
  var values = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  var pending = [];
  for (var i = 0; i < values.length; i++) {
    var status = String(values[i][cols.Status - 1] || '').trim();
    var id = String(values[i][cols['Request id'] - 1] || '').trim();
    if (status === STATUS_AWAITING && id) pending.push({ row: i + 2, id: id });
  }
  for (var start = 0; start < pending.length; start += 40) {
    var batch = pending.slice(start, start + 40);
    var res = post_({ ids: batch.map(function (p) { return p.id; }) }, 'status');
    var results = (res.body && res.body.results) || [];
    var byId = {};
    results.forEach(function (r) { if (r && r.id) byId[r.id] = r; });
    batch.forEach(function (p) {
      var outcome = pollOutcome_(byId[p.id]);
      if (outcome.kind === 'live') {
        sheet.getRange(p.row, cols.Status).setValue(STATUS_LIVE);
        sheet.getRange(p.row, cols['Listing URL']).setValue(outcome.url);
        sheet.getRange(p.row, cols['Processed at']).setValue(new Date());
      } else if (outcome.kind === 'declined') {
        sheet.getRange(p.row, cols.Status).setValue(STATUS_DECLINED);
        sheet.getRange(p.row, cols.Approve).setValue(false);
      } else if (outcome.kind === 'expired') {
        sheet.getRange(p.row, cols.Status).setValue(STATUS_EXPIRED);
        sheet.getRange(p.row, cols.Approve).setValue(false);
      }
    });
  }
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
    auto_update: autoUpdateLevel_(str(Q.autoUpdate), notes),
    auto_update_answer: str(Q.autoUpdate),
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

/** Signed POST to Connect. which is 'status' or 'resend' for the follow-up routes. Returns {code, body}. */
function post_(payload, which) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('INTAKE_URL');
  if (which === 'status' || which === 'resend') {
    url = String(url || '').replace(/\/google-form\/?$/, '/google-form/' + which);
  }
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

// `onMap` is whether Connect gave the listing a map pin (tracker C21): everyone is in Kingdom Discovery, but an
// online-only Contributor, or one whose address could not be placed, is not on the map and must not be told so.
function sendWelcome_(ownerEmail, orgName, listingUrl, onMap) {
  var where = onMap === true ? 'on the map and in Kingdom Discovery' : 'in Kingdom Discovery';
  var appUrl = PropertiesService.getScriptProperties().getProperty('INTAKE_URL').replace(/\/api\/.*$/, '');
  var signInUrl = escapeHtml_(appUrl + '/dashboard');
  var safeListingUrl = escapeHtml_(listingUrl);
  var safeName = escapeHtml_(orgName);
  var safeEmail = escapeHtml_(ownerEmail);

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1f1f1f;line-height:1.55">' +
    '<h2 style="color:#A67C00;margin:0 0 12px">' + safeName + ' is live on Citizens Connect 🎉</h2>' +
    '<p>Thank you for joining the Body on Citizens Connect — you\'re now ' + where + ', ' +
    'where citizens across the city can find, follow and connect with you.</p>' +
    '<p><a href="' + safeListingUrl + '" style="color:#A67C00">View your listing</a></p>' +
    '<p><strong>To manage your profile</strong>, sign in with <strong>' + safeEmail + '</strong>. ' +
    'You don\'t need a Google account:</p>' +
    '<ol style="padding-left:20px;margin:0 0 14px">' +
    '<li>Open <a href="' + signInUrl + '" style="color:#A67C00">Citizens Connect</a> and tap <strong>Continue with email</strong>.</li>' +
    '<li>Enter <strong>' + safeEmail + '</strong>. We\'ll email you a 6-digit code (check your junk folder too).</li>' +
    '<li>Type the code in. You\'ll land on your Contributor dashboard.</li>' +
    '</ol>' +
    '<p><a href="' + signInUrl + '" style="display:inline-block;background:#A67C00;color:#fff;padding:12px 20px;' +
    'border-radius:10px;text-decoration:none;font-weight:bold">Sign in to your Contributor Portal</a></p>' +
    '<p style="font-size:13px;color:#555">Is ' + safeEmail + ' a Google account? You can tap the Google button instead. ' +
    'Signed in with a different address by mistake? Sign out, then sign in again with ' + safeEmail +
    ' — your listing belongs to that address.</p>' +
    '<p>Connecting the Kingdom — one citizen, one contributor, one need at a time.<br>The Citizens Connect team</p>' +
    '</div>';

  var text =
    orgName + ' is live on Citizens Connect.\n\n' +
    'View your listing: ' + listingUrl + '\n\n' +
    'To manage your profile, sign in with ' + ownerEmail + '. You don\'t need a Google account:\n' +
    '1. Open ' + appUrl + '/dashboard and tap "Continue with email".\n' +
    '2. Enter ' + ownerEmail + '. We\'ll email you a 6-digit code (check your junk folder too).\n' +
    '3. Type the code in. You\'ll land on your Contributor dashboard.\n\n' +
    'Is ' + ownerEmail + ' a Google account? You can tap the Google button instead.\n' +
    'Signed in with a different address by mistake? Sign out, then sign in again with ' + ownerEmail + '.\n\n' +
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

/**
 * {header or question phrase → 1-based column}. Throws naming anything missing or ambiguous.
 * Manual headers match exactly (ignoring capitals and extra spaces: "Processed At" = "Processed at").
 * Form questions match when the text AFTER "Question N.N:" contains the phrase.
 */
/** Append any manual column this sheet does not have yet. Safe to re-run. */
function ensureManualHeaders_(sheet) {
  var last = Math.max(sheet.getLastColumn(), 1);
  var norm = function (s) {
    return String(s).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  };
  var headers = sheet.getRange(1, 1, 1, last).getValues()[0].map(norm);
  MANUAL_HEADERS.concat(OPTIONAL_HEADERS).forEach(function (name) {
    if (headers.indexOf(norm(name)) === -1) {
      last += 1;
      sheet.getRange(1, last).setValue(name);
      headers.push(norm(name));
    }
  });
}

function columns_(sheet) {
  var norm = function (s) {
    return String(s).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(norm);
  // "question 7.2: permission to publish" → "permission to publish"
  var questionText = headers.map(function (h) {
    var m = h.match(/^question\s+\d+(\.\d+)*\s*:\s*(.*)$/);
    return m ? m[2] : null;
  });
  var cols = {};
  var problems = [];
  MANUAL_HEADERS.forEach(function (name) {
    var i = headers.indexOf(norm(name));
    if (i === -1) problems.push('missing "' + name + '"'); else cols[name] = i + 1;
  });
  OPTIONAL_HEADERS.forEach(function (name) {
    var i = headers.indexOf(norm(name));
    if (i !== -1) cols[name] = i + 1;
  });
  Object.keys(Q).forEach(function (key) {
    var phrase = norm(Q[key]);
    var hits = [];
    for (var c = 0; c < questionText.length; c++) {
      if (questionText[c] !== null && questionText[c].indexOf(phrase) !== -1) hits.push(c);
    }
    if (hits.length === 0) problems.push('no question containing "' + Q[key] + '"');
    else if (hits.length > 1) problems.push('"' + Q[key] + '" matches ' + hits.length + ' questions');
    else cols[Q[key]] = hits[0] + 1;
  });
  if (problems.length) throw new Error('Sheet columns: ' + problems.join('; '));
  return cols;
}
