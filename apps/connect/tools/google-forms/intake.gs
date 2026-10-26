/**
 * Citizens Connect — Google Form → map Contributor intake.
 *
 * Bound to the responses Sheet "New 219-Connect Contributor (Responses)".
 * Ticking "Approve" on a row is the ONLY manual step: this script sends the
 * row to Connect (HMAC-signed), Connect puts the Contributor live in Kingdom
 * Discovery (and on the map when it has a pin), this script writes Status / Listing URL /
 * Processed at / Notes back to the row, then emails the owner a welcome
 * asking them to sign in with their owner email (a 6-digit emailed code, or
 * Google if that address is a Google account).
 *
 * Verify-first (C10): the listing is live at once, but it is NEVER attached to anybody
 * until the owner has signed in and said "Confirm" on a screen in Connect. The Status
 * column follows what the DATABASE says, not what this script did:
 *   Awaiting owner · 3 days  → Owner confirmed ✓    or    Owner declined
 * refreshStatuses() asks Connect (POST <INTAKE_URL>/status, HMAC-signed) every ~10
 * minutes and writes the answer into the row. It is read-only: the Sheet never
 * triggers anything in Connect, so editing a Status cell changes nothing there.
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

var STATUS_LIVE = 'Live ✓'; // rows approved before the verify-first change keep this
var STATUS_AWAITING = 'Awaiting owner'; // written with its age: "Awaiting owner · 3 days"
var STATUS_CONFIRMED = 'Owner confirmed ✓';
var STATUS_DECLINED = 'Owner declined';
var STATUS_PROCESSING = 'Processing…';
var STATUS_ERROR = 'Error';

// Connect answers for at most this many listings per call (MAX_SLUGS in the status route).
var STATUS_BATCH = 200;

// Columns the founder adds to the right of the Form's columns.
var MANUAL_HEADERS = ['Approve', 'Status', 'Listing URL', 'Processed at', 'Notes'];

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
  columns_(getSheet_()); // throws, naming any missing header

  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onApproveEdit') ScriptApp.deleteTrigger(t);
  });
  // An INSTALLABLE trigger: a simple onEdit() may not call UrlFetchApp/MailApp.
  ScriptApp.newTrigger('onApproveEdit').forSpreadsheet(ss).onEdit().create();
  // The status poll (C10): every ~10 minutes, read-only. Public name on purpose: a trigger cannot call a private one.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'refreshStatuses') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('refreshStatuses').timeBased().everyMinutes(10).create();
  ss.toast('Intake is ready. Tick "Approve" on a row to publish it; its Status then follows the owner\'s answer.', 'Citizens Connect', 10);
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
  if (isFinishedStatus_(status)) return; // already done / waiting for its owner / in flight

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
      // Live, and waiting for the owner to confirm it. refreshStatuses() keeps this line true.
      cell('Status', awaitingStatus_(0, false));
      cell('Listing URL', res.body.url);
      cell('Processed at', new Date());
      try {
        // on_map comes from Connect (it resolves the pin: maps link, geocode, MapTiler); anything but true is "no pin".
        // owner_has_account picks the welcome's wording (asked to attach it to their account, or to confirm it is theirs).
        sendWelcome_(payload.owner_email, payload.organisation_name, res.body.url, res.body.on_map === true, res.body.owner_has_account === true);
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

// ── Status (C10) ─────────────────────────────────────────────────────────

function ageLabel_(days) {
  var n = Math.max(0, Math.floor(Number(days) || 0));
  return n < 1 ? 'today' : n === 1 ? '1 day' : n + ' days';
}

/** "Awaiting owner · 3 days", with "(reminded)" once the single 7-day reminder has gone out. */
function awaitingStatus_(days, reminded) {
  return STATUS_AWAITING + ' · ' + ageLabel_(days) + (reminded ? ' (reminded)' : '');
}

/** Still waiting for the owner: the only Status the poll is allowed to rewrite. */
function isOpenStatus_(status) {
  return String(status).indexOf(STATUS_AWAITING) === 0;
}

/** A row that has been processed (or is being): ticking Approve again must not send it twice. */
function isFinishedStatus_(status) {
  var s = String(status);
  return s === STATUS_LIVE || s === STATUS_PROCESSING || s === STATUS_CONFIRMED || s === STATUS_DECLINED || isOpenStatus_(s);
}

/** The slug at the end of a listing link, "https://…/c/grace-point" → "grace-point"; '' when it is not one. */
function slugFromUrl_(url) {
  var m = String(url || '').match(/\/c\/([a-z0-9][a-z0-9-]*)\/?$/);
  return m ? m[1] : '';
}

/**
 * Time-driven (setup() installs it every 10 minutes). Asks Connect where each waiting listing stands and writes it
 * into the row's Status. READ-ONLY toward Connect: the database holds the state and the Sheet only shows it, so
 * nothing here can attach, hide, remind or approve anything. Only rows whose Status still says "Awaiting owner" are
 * touched, and a cell the founder edited meanwhile is left alone.
 */
function refreshStatuses() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // a row is being approved right now; the next run catches up
  try {
    var sheet = getSheet_();
    var cols = columns_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var count = lastRow - 1;
    var statuses = sheet.getRange(2, cols.Status, count, 1).getValues();
    var urls = sheet.getRange(2, cols['Listing URL'], count, 1).getValues();

    var open = [];
    for (var i = 0; i < count; i++) {
      if (!isOpenStatus_(statuses[i][0])) continue;
      var slug = slugFromUrl_(urls[i][0]);
      if (slug) open.push({ row: i + 2, slug: slug });
    }
    if (!open.length) return;

    var slugs = [];
    open.forEach(function (o) { if (slugs.indexOf(o.slug) === -1) slugs.push(o.slug); });
    var answers = {};
    for (var from = 0; from < slugs.length; from += STATUS_BATCH) {
      var res = post_({ slugs: slugs.slice(from, from + STATUS_BATCH) }, '/status');
      if (res.code !== 200 || !res.body || !res.body.statuses) {
        Logger.log('Status poll skipped: HTTP ' + res.code + ' ' + JSON.stringify(res.body));
        return;
      }
      Object.keys(res.body.statuses).forEach(function (k) { answers[k] = res.body.statuses[k]; });
    }

    open.forEach(function (o) {
      var entry = answers[o.slug];
      if (!entry) return; // Connect does not know it (an older listing, or one an admin deleted): leave the row alone
      var label = entry.status === 'confirmed' ? STATUS_CONFIRMED
        : entry.status === 'declined' ? STATUS_DECLINED
        : entry.status === 'awaiting' ? awaitingStatus_(entry.age_days, entry.reminded === true)
        : '';
      if (!label) return;
      var cell = sheet.getRange(o.row, cols.Status);
      var current = String(cell.getValue());
      if (!isOpenStatus_(current) || current === label) return; // edited meanwhile, or nothing new to say
      cell.setValue(label);
      if (entry.status === 'declined') {
        var notes = sheet.getRange(o.row, cols.Notes);
        var line = 'The owner said this listing is not theirs. It is hidden. Decide in Admin → Listings whether to Delete it.';
        var existing = String(notes.getValue());
        notes.setValue(existing ? existing + '\n' + line : line);
      }
    });
  } finally {
    lock.releaseLock();
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

/** Signed POST to Connect (INTAKE_URL, plus an optional path such as '/status'). Returns {code, body}. */
function post_(payload, suffix) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('INTAKE_URL');
  var secret = props.getProperty('INTAKE_SECRET');
  if (!url || !secret) throw new Error('Script properties INTAKE_URL / INTAKE_SECRET are not set.');
  if (suffix) url += suffix;

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
// `hasAccount` is whether that address already has a Citizens Connect account (C10): the listing is then OFFERED to the
// account ("Attach it to your account?"), never merged into it, and nothing on the account changes unless they confirm.
// Either way the words say "sign in, then confirm"; the listing is not theirs until they do. Keep in step with
// ownerWelcomeEmail in apps/connect/src/lib/email/templates.ts.
function sendWelcome_(ownerEmail, orgName, listingUrl, onMap, hasAccount) {
  var where = onMap === true ? 'on the map and in Kingdom Discovery' : 'in Kingdom Discovery';
  var appUrl = PropertiesService.getScriptProperties().getProperty('INTAKE_URL').replace(/\/api\/.*$/, '');
  var signInUrl = escapeHtml_(appUrl + '/dashboard');
  var safeListingUrl = escapeHtml_(listingUrl);
  var safeName = escapeHtml_(orgName);
  var safeEmail = escapeHtml_(ownerEmail);
  var askHtml = hasAccount === true
    ? '<p>You already have a Citizens Connect account with <strong>' + safeEmail + '</strong>. When you sign in as usual we will ask: ' +
      '<em>"Attach ' + safeName + ' to your account?"</em> Nothing on your account changes unless you tap <strong>Confirm</strong>. ' +
      'If this listing is not yours, tap <strong>Not me</strong> and we will hide it straight away.</p>'
    : '<p>When you sign in we will ask you to confirm that this listing is yours. ' +
      'If it is not, tap <strong>Not me</strong> and we will hide it straight away.</p>';
  var askText = hasAccount === true
    ? 'You already have a Citizens Connect account with ' + ownerEmail + '. When you sign in as usual we will ask: "Attach ' + orgName +
      ' to your account?" Nothing on your account changes unless you tap Confirm. If this listing is not yours, tap Not me and we will hide it straight away.'
    : 'When you sign in we will ask you to confirm that this listing is yours. If it is not, tap Not me and we will hide it straight away.';

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1f1f1f;line-height:1.55">' +
    '<h2 style="color:#A67C00;margin:0 0 12px">' + safeName + ' is live on Citizens Connect 🎉</h2>' +
    '<p>Thank you for joining the Body on Citizens Connect — you\'re now ' + where + ', ' +
    'where citizens across the city can find, follow and connect with you.</p>' +
    '<p><a href="' + safeListingUrl + '" style="color:#A67C00">View your listing</a></p>' +
    '<p><strong>To see your listing and manage it</strong>, sign in with <strong>' + safeEmail + '</strong>. ' +
    'You don\'t need a Google account:</p>' +
    '<ol style="padding-left:20px;margin:0 0 14px">' +
    '<li>Open <a href="' + signInUrl + '" style="color:#A67C00">Citizens Connect</a> and tap <strong>Continue with email</strong>.</li>' +
    '<li>Enter <strong>' + safeEmail + '</strong>. We\'ll email you a 6-digit code (check your junk folder too).</li>' +
    '<li>Type the code in, then confirm the listing is yours.</li>' +
    '</ol>' +
    askHtml +
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
    'To see your listing and manage it, sign in with ' + ownerEmail + '. You don\'t need a Google account:\n' +
    '1. Open ' + appUrl + '/dashboard and tap "Continue with email".\n' +
    '2. Enter ' + ownerEmail + '. We\'ll email you a 6-digit code (check your junk folder too).\n' +
    '3. Type the code in, then confirm the listing is yours.\n\n' +
    askText + '\n\n' +
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
