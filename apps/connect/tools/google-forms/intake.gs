/**
 * Citizens Connect — Google Form → map Contributor intake.
 *
 * Bound to the responses Sheet "New 219-Connect Contributor (Responses)".
 * Ticking "Approve" on a row is the ONLY manual step: this script sends the
 * row to Connect (HMAC-signed).
 *
 * A new account (C10): the listing goes live in Kingdom Discovery (and on the
 * map when it has a pin) but it is NEVER attached until the owner has signed in
 * and said "Confirm". This script writes Status / Listing URL / Processed at /
 * Notes, then emails the welcome. Status follows the database:
 *   Awaiting owner · 3 days  → Owner confirmed ✓    or    Owner declined
 * refreshStatuses() asks Connect (POST <INTAKE_URL>/status with {slugs}) every
 * ~10 minutes. It is read-only: editing a Status cell changes nothing there.
 *
 * An owner email that already has a citizen account does NOT go live and does
 * NOT get that welcome. Connect emails that account a confirm link. Status
 * becomes "Awaiting confirmation". pollUpgrades() asks Connect (the same
 * /status route, with {ids}) and writes Live ✓, Declined or Expired. The
 * server sends the welcome only after they confirm — this script must not
 * send a second one. Tick Resend to email the confirm link again (same expiry).
 *
 * The join page (intake.html) is a second way into the SAME sheet. doGet serves
 * that page; doPost appends one row and never ticks Approve. A Wear row is
 * stored and then refused here, so Approve cannot publish it on Connect.
 * Setup: see README.md in this folder (run setup() once, then deploy the web app).
 * Server side: apps/connect/src/app/api/intake/google-form/route.ts.
 * Secrets live in Script properties (INTAKE_URL, INTAKE_SECRET) — never here,
 * and never in intake.html.
 */

var SHEET_NAME = 'Form Responses 1';

// Keep in sync with MAX_IMAGE_BYTES in apps/connect/src/lib/intake/googleForm.ts.
// Two images at this size stay under Vercel's ~4.5 MB request limit.
var MAX_IMAGE_BYTES = 1500000;
var RESIZE_WIDTH = { logo: 800, cover: 1600 };

var STATUS_LIVE = 'Live ✓'; // rows approved before the verify-first change keep this
var STATUS_AWAITING_OWNER = 'Awaiting owner'; // written with its age: "Awaiting owner · 3 days"
var STATUS_CONFIRMED = 'Owner confirmed ✓';
var STATUS_OWNER_DECLINED = 'Owner declined';
var STATUS_PROCESSING = 'Processing…';
var STATUS_ERROR = 'Error';
var STATUS_AWAITING_CONFIRMATION = 'Awaiting confirmation';
var STATUS_DECLINED = 'Declined';
var STATUS_EXPIRED = 'Expired';
var STATUS_HELD = 'Held'; // web-form row for an app Approve must not publish (Wear)

// Connect answers for at most this many listings per call (MAX_SLUGS in the status route).
var STATUS_BATCH = 200;

// Columns the founder adds to the right of the Form's columns.
// Request id and Resend are optional so a sheet that has not been updated
// still approves new accounts. setup() and onEdit append them.
var MANUAL_HEADERS = ['Approve', 'Status', 'Listing URL', 'Processed at', 'Notes'];
var OPTIONAL_HEADERS = ['Request id', 'Resend', 'Source', 'App', 'Extra'];

// Join-page answers that are NOT sent to Connect (vetting, or a later app).
// A missing column is not an error: the answer is kept in Extra instead.
var WEB_EXTRA = {
  fullName: 'applicant full name',
  role: 'your role in the organisation',
  phone: 'applicant phone number',
  areas: 'which area',
  team: 'team members to invite',
  events: 'regular events or have venues',
  heard: 'how did you hear',
  delivery: 'delivery options',
};

// Labels Connect already accepts (googleForm.ts). The join page must send these.
var WEB_KINDS = ['Church', 'Christian Nonprofit / Ministry', 'Christian Business', 'Individual'];
var WEB_CATEGORIES = [
  'Church', 'Outreach / Mission', 'Market / Expo', 'Business', 'Sport & Recreation',
  'Social Gathering', 'Arts & Culture', 'Media', 'Retreat / Healing', 'Clinic',
  'Education / Equipping', 'Rehab / Development',
];
var WEB_FIXED_YES = 'Yes';
var WEB_FIXED_NO = "No, we're online, mobile or have no permanent office";
var WEB_AUTO = [
  'No thanks',
  'Yes, suggest updates for my approval',
  'Yes, and publish events automatically',
];

// Open for the join page. Locked apps stay in the list so the page can show them,
// but doPost refuses them. A later app is one line here plus a theme in intake.html.
var WEB_APPS = {
  connect: true,
  wear: true,
  vision: false,
  learn: false,
  play: false,
  move: false,
  impact: false,
};
var WEB_PER_MINUTE = 30;
var WEB_MAX_BODY = 4000000;

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
    if (handler === 'onApproveEdit' || handler === 'pollUpgrades' || handler === 'refreshStatuses') ScriptApp.deleteTrigger(t);
  });
  // An INSTALLABLE trigger: a simple onEdit() may not call UrlFetchApp/MailApp.
  ScriptApp.newTrigger('onApproveEdit').forSpreadsheet(ss).onEdit().create();
  // Both polls are public names on purpose: a trigger cannot call a private function.
  // refreshStatuses follows listing_claims (new accounts). pollUpgrades follows upgrade requests.
  ScriptApp.newTrigger('refreshStatuses').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('pollUpgrades').timeBased().everyMinutes(10).create();
  ss.toast('Intake is ready. Tick "Approve" on a row to publish it. Its Status then follows the owner\'s answer.', 'Citizens Connect', 10);
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
  if (isFinishedStatus_(status)) return; // already done / waiting for its owner / in flight

  // Blank App is a Google Form row (Connect). Anything else is queued, not published.
  var appName = str('App').toLowerCase();
  if (appName && appName !== 'connect') {
    sheet.getRange(row, cols.Status).setValue(STATUS_HELD);
    sheet.getRange(row, cols.Approve).setValue(false);
    sheet.getRange(row, cols.Notes).setValue(
      'This row is a ' + appName + ' application. Approve publishes a Connect listing only, so nothing was sent.'
    );
    return;
  }

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
      // Existing citizen: no listing yet, and no welcome from this sheet.
      cell('Status', STATUS_AWAITING_CONFIRMATION);
      if (cols['Request id']) cell('Request id', outcome.requestId);
      cell('Processed at', new Date());
      if (outcome.message) notes.push(outcome.message);
    } else if (outcome.kind === 'live') {
      // New account: live, and waiting for the owner to confirm it. refreshStatuses() keeps this line true.
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
  if (str('Status') !== STATUS_AWAITING_CONFIRMATION || !str('Request id')) {
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
    if (status === STATUS_AWAITING_CONFIRMATION && id) pending.push({ row: i + 2, id: id });
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

// ── Status (C10) ─────────────────────────────────────────────────────────

function ageLabel_(days) {
  var n = Math.max(0, Math.floor(Number(days) || 0));
  return n < 1 ? 'today' : n === 1 ? '1 day' : n + ' days';
}

/** "Awaiting owner · 3 days", with "(reminded)" once the single 7-day reminder has gone out. */
function awaitingStatus_(days, reminded) {
  return STATUS_AWAITING_OWNER + ' · ' + ageLabel_(days) + (reminded ? ' (reminded)' : '');
}

/** Still waiting for the owner: the only Status the listing poll is allowed to rewrite. */
function isOpenStatus_(status) {
  return String(status).indexOf(STATUS_AWAITING_OWNER) === 0;
}

/** A row that has been processed (or is being): ticking Approve again must not send it twice. */
function isFinishedStatus_(status) {
  var s = String(status);
  return s === STATUS_LIVE || s === STATUS_PROCESSING || s === STATUS_CONFIRMED || s === STATUS_OWNER_DECLINED
    || s === STATUS_AWAITING_CONFIRMATION || s === STATUS_DECLINED || s === STATUS_EXPIRED
    || isOpenStatus_(s);
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
        : entry.status === 'declined' ? STATUS_OWNER_DECLINED
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

/**
 * Signed POST to Connect. which is 'status' or 'resend' (sibling routes) or a path
 * such as '/status' (appended). Returns {code, body}.
 */
function post_(payload, which) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('INTAKE_URL');
  var secret = props.getProperty('INTAKE_SECRET');
  if (!url || !secret) throw new Error('Script properties INTAKE_URL / INTAKE_SECRET are not set.');
  if (which === 'status' || which === 'resend') {
    url = String(url).replace(/\/google-form\/?$/, '/google-form/' + which);
  } else if (which) {
    url += which;
  }

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

// ── Join page (intake.html) ──────────────────────────────────────────────
// Public doGet / doPost. The page never sees INTAKE_SECRET. Approve stays false.

function normWeb_(s) {
  return String(s == null ? '' : s).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}

function cleanLine_(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanBlock_(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function canonical_(list, raw) {
  var want = normWeb_(raw);
  if (!want) return '';
  for (var i = 0; i < list.length; i++) {
    if (normWeb_(list[i]) === want) return list[i];
  }
  return '';
}

function safeNonce_(value) {
  var s = String(value || '');
  if (!s) return '';
  return /^[A-Za-z0-9_-]{8,80}$/.test(s) ? s : '';
}

var WEB_EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,189}\.[A-Za-z]{2,24}$/;

function knownWebPhrases_() {
  var known = {};
  Object.keys(Q).forEach(function (k) { known[Q[k]] = true; });
  Object.keys(WEB_EXTRA).forEach(function (k) { known[WEB_EXTRA[k]] = true; });
  return known;
}

function takeWeb_(raw, known, phrase) {
  if (!known[phrase] || !raw || !Object.prototype.hasOwnProperty.call(raw, phrase)) return '';
  return raw[phrase];
}

/** Shape and consent checks for one join-page submission. Does not touch the sheet. */
function parseWebIntake_(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'This form could not be read. Please try again.' };
  }
  if (cleanLine_(body.company_url, 200)) return { ok: true, skip: true, nonce: safeNonce_(body.nonce) };
  if (body.nonce && !safeNonce_(body.nonce)) {
    return { ok: false, error: 'This form could not be read. Please try again.' };
  }
  var nonce = safeNonce_(body.nonce);
  var app = normWeb_(body.app);
  if (!Object.prototype.hasOwnProperty.call(WEB_APPS, app)) {
    return { ok: false, error: 'Tell us which Citizens app you are joining.' };
  }
  if (!WEB_APPS[app]) return { ok: false, error: 'That Citizens app is not open for applications yet.' };

  var raw = body.answers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'This form could not be read. Please try again.' };
  }
  if (Object.keys(raw).length > 40) return { ok: false, error: 'This form could not be read. Please try again.' };
  var known = knownWebPhrases_();
  var answers = {};

  var fullName = cleanLine_(takeWeb_(raw, known, WEB_EXTRA.fullName), 120);
  if (fullName.length < 2) return { ok: false, error: 'Add your name.' };
  answers[WEB_EXTRA.fullName] = fullName;

  var email = cleanLine_(takeWeb_(raw, known, Q.ownerEmail), 254).toLowerCase();
  if (!WEB_EMAIL.test(email)) return { ok: false, error: 'Add the email you will sign in with.' };
  answers[Q.ownerEmail] = email;

  var listing = cleanLine_(takeWeb_(raw, known, Q.name), 120);
  if (listing.length < 2) return { ok: false, error: 'Add the name people should see.' };
  answers[Q.name] = listing;

  var kind = canonical_(WEB_KINDS, takeWeb_(raw, known, Q.type));
  if (!kind) return { ok: false, error: 'Choose how you are set up.' };
  answers[Q.type] = kind;

  var category = canonical_(WEB_CATEGORIES, takeWeb_(raw, known, Q.category));
  if (!category) return { ok: false, error: 'Choose what you do.' };
  answers[Q.category] = category;

  var faith = cleanLine_(takeWeb_(raw, known, Q.faith), 500);
  if (!faith || /^no\b/i.test(faith)) {
    return { ok: false, error: 'Faith alignment is needed before this can be saved.' };
  }
  answers[Q.faith] = faith;

  var permission = cleanLine_(takeWeb_(raw, known, Q.permission), 500);
  if (!permission || /^no\b/i.test(permission)) {
    return { ok: false, error: 'Permission to publish is needed before this can be saved.' };
  }
  answers[Q.permission] = permission;

  var lines = [
    [WEB_EXTRA.role, 120], [WEB_EXTRA.phone, 40], [WEB_EXTRA.areas, 300], [Q.website, 500],
    [Q.contactEmail, 254], [Q.instagram, 500], [Q.facebook, 500], [Q.tiktok, 500], [Q.youtube, 500],
    [Q.x, 500], [Q.linkedin, 500], [Q.whatsapp, 500], [Q.maps, 500], [WEB_EXTRA.heard, 200],
    [WEB_EXTRA.delivery, 500],
  ];
  for (var i = 0; i < lines.length; i++) {
    var line = cleanLine_(takeWeb_(raw, known, lines[i][0]), lines[i][1]);
    if (line) answers[lines[i][0]] = line;
  }
  var blocks = [[Q.bio, 1000], [Q.address, 300], [WEB_EXTRA.team, 2000], [WEB_EXTRA.events, 500]];
  for (var b = 0; b < blocks.length; b++) {
    var block = cleanBlock_(takeWeb_(raw, known, blocks[b][0]), blocks[b][1]);
    if (block) answers[blocks[b][0]] = block;
  }

  if (answers[Q.contactEmail]) {
    answers[Q.contactEmail] = answers[Q.contactEmail].toLowerCase();
    if (!WEB_EMAIL.test(answers[Q.contactEmail])) {
      return { ok: false, error: 'The public contact email does not look right.' };
    }
  }
  if (answers[Q.website] && !/^https?:\/\//i.test(answers[Q.website])) {
    var site = answers[Q.website];
    if (site.indexOf(' ') === -1 && site.indexOf('.') > 0) answers[Q.website] = ('https://' + site).slice(0, 500);
    else return { ok: false, error: 'The website should start with https://.' };
  }

  var fixedRaw = cleanLine_(takeWeb_(raw, known, Q.fixed), 200);
  if (fixedRaw) {
    var fixedNorm = normWeb_(fixedRaw);
    if (/^yes\b/.test(fixedNorm)) answers[Q.fixed] = WEB_FIXED_YES;
    else if (/^no\b/.test(fixedNorm)) answers[Q.fixed] = WEB_FIXED_NO;
    else return { ok: false, error: 'Choose yes or no for a fixed location.' };
  }

  var autoRaw = cleanLine_(takeWeb_(raw, known, Q.autoUpdate), 200);
  if (autoRaw) {
    var auto = canonical_(WEB_AUTO, autoRaw);
    if (!auto) return { ok: false, error: 'Choose one of the listing-update options, or leave it blank.' };
    answers[Q.autoUpdate] = auto;
  }

  var images = { logo: null, cover: null };
  var imageError = readWebImages_(body.images, images);
  if (imageError) return { ok: false, error: imageError };
  return { ok: true, app: app, answers: answers, images: images, nonce: nonce };
}

function readWebImages_(images, out) {
  if (images == null) return '';
  if (typeof images !== 'object' || Array.isArray(images)) return 'A photo could not be read. Please use a JPEG or PNG.';
  var maxB64 = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4;
  var roles = ['logo', 'cover'];
  for (var i = 0; i < roles.length; i++) {
    var item = images[roles[i]];
    if (item == null || item === '') continue;
    if (typeof item !== 'object') return 'A photo could not be read. Please use a JPEG or PNG.';
    var mime = String(item.mime || '').toLowerCase();
    var b64 = String(item.base64 || '');
    if (!b64) continue;
    if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') {
      return 'Photos need to be JPEG, PNG or WebP.';
    }
    if (b64.length > maxB64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
      return 'That photo is too large. Please choose a smaller one.';
    }
    out[roles[i]] = { mime: mime, base64: b64 };
  }
  return '';
}

function sniffWebImage_(bytes) {
  if (!bytes || bytes.length < 3) return '';
  var b = function (i) { return bytes[i] & 0xff; };
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  if (
    bytes.length >= 12 && b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
    b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50
  ) return 'image/webp';
  return '';
}

/** Magic bytes, not the claimed type. {error:true} or {mime, bytes}. */
function checkWebImage_(image) {
  var bytes;
  try { bytes = Utilities.base64Decode(image.base64); } catch (err) { return { error: true }; }
  if (!bytes || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return { error: true };
  var mime = sniffWebImage_(bytes);
  if (!mime || mime !== image.mime) return { error: true };
  return { mime: mime, bytes: bytes };
}

function uploadFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('INTAKE_UPLOAD_FOLDER');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* the folder was deleted; make another */ }
  }
  var folder = DriveApp.createFolder('Citizens intake uploads');
  if (props.setProperty) props.setProperty('INTAKE_UPLOAD_FOLDER', folder.getId());
  return folder;
}

function saveWebImage_(checked, role) {
  var ext = checked.mime === 'image/png' ? 'png' : checked.mime === 'image/webp' ? 'webp' : 'jpg';
  var blob = Utilities.newBlob(checked.bytes, checked.mime, role + '-' + new Date().getTime() + '.' + ext);
  var file = uploadFolder_().createFile(blob);
  return 'https://drive.google.com/open?id=' + file.getId();
}

function headerColumn_(sheet, name) {
  var want = normWeb_(name);
  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (normWeb_(headers[i]) === want) return i + 1;
  }
  return 0;
}

function findQuestionColumn_(sheet, phrase) {
  var want = normWeb_(phrase);
  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  var hits = [];
  for (var i = 0; i < headers.length; i++) {
    var m = normWeb_(headers[i]).match(/^question\s+\d+(\.\d+)*\s*:\s*(.*)$/);
    if (m && m[2].indexOf(want) !== -1) hits.push(i + 1);
  }
  return hits.length === 1 ? hits[0] : 0;
}

/** Append one join-page row. Approve is false. Email Address is left blank. */
function appendWebRow_(sheet, record) {
  ensureManualHeaders_(sheet);
  SpreadsheetApp.flush();
  var cols = columns_(sheet);
  var row = sheet.getLastRow() + 1;
  var timestamp = headerColumn_(sheet, 'timestamp');
  if (timestamp) sheet.getRange(row, timestamp).setValue(new Date());

  var leftover = [];
  Object.keys(record.answers).forEach(function (phrase) {
    var value = record.answers[phrase];
    if (!value) return;
    var col = cols[phrase] || findQuestionColumn_(sheet, phrase);
    if (col) sheet.getRange(row, col).setValue(value);
    else leftover.push(phrase + ': ' + value);
  });
  if (leftover.length) {
    if (!cols.Extra) throw new Error('Sheet columns: missing "Extra"');
    sheet.getRange(row, cols.Extra).setValue(leftover.join('\n'));
  }
  if (!cols.App || !cols.Source || !cols.Approve) throw new Error('Sheet columns: missing web-form headers');
  sheet.getRange(row, cols.App).setValue(record.app);
  sheet.getRange(row, cols.Source).setValue('web-form');
  sheet.getRange(row, cols.Approve).setValue(false);
  return row;
}

function cacheKey_(prefix, text) {
  var h = 5381;
  var s = String(text);
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return prefix + '-' + h.toString(16);
}

function webIntakeAllowed_() {
  var cache = CacheService.getScriptCache();
  var key = 'web-intake-n';
  var n = Number(cache.get(key) || '0');
  if (n >= WEB_PER_MINUTE) return false;
  cache.put(key, String(n + 1), 60);
  return true;
}

function formField_(body, name) {
  var parts = String(body).split('&');
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf('=');
    var key = decodeURIComponent(String(eq < 0 ? parts[i] : parts[i].slice(0, eq)).replace(/\+/g, ' '));
    if (key !== name) continue;
    return decodeURIComponent(String(eq < 0 ? '' : parts[i].slice(eq + 1)).replace(/\+/g, ' '));
  }
  return '';
}

function webBody_(e) {
  if (!e) return null;
  var fromField = e.parameter && e.parameter.payload;
  if (!fromField && e.postData && e.postData.contents && e.postData.contents.charAt(0) !== '{') {
    fromField = formField_(e.postData.contents, 'payload');
  }
  if (fromField) {
    if (String(fromField).length > WEB_MAX_BODY) return { tooLarge: true };
    try { return JSON.parse(fromField); } catch (err) { return null; }
  }
  var contents = e.postData && e.postData.contents;
  if (!contents) return null;
  if (String(contents).length > WEB_MAX_BODY) return { tooLarge: true };
  try { return JSON.parse(contents); } catch (err) { return null; }
}

function wantsHtml_(e) {
  return !!(e && e.parameter && e.parameter.reply === 'html');
}

function htmlReply_(nonce, result) {
  var payload = JSON.stringify({ source: 'citizens-intake', nonce: nonce || '', result: result }).replace(/</g, '\\u003c');
  // Google nests this page inside its own frame, so tell every parent. The join page
  // then replaces the form with "You're on the list."
  var page = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>' +
      '(function(){var m=' + payload + ';function up(w){try{w.postMessage(m,"*");}catch(e){}' +
      'if(w.parent&&w.parent!==w)up(w.parent);}if(window.parent&&window.parent!==window)up(window.parent);})();' +
    '</script></body></html>'
  );
  return page.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function respond_(e, nonce, result) {
  if (wantsHtml_(e)) return htmlReply_(nonce, result);
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function receiveWebIntake_(e) {
  var parsedBody = webBody_(e);
  if (parsedBody && parsedBody.tooLarge) {
    return { nonce: '', body: { ok: false, error: 'That is too large to send. Please use smaller photos.' } };
  }
  if (!parsedBody) return { nonce: '', body: { ok: false, error: 'This form could not be read. Please try again.' } };

  var parsed = parseWebIntake_(parsedBody);
  var nonce = parsed.nonce || '';
  if (!parsed.ok) return { nonce: nonce, body: { ok: false, error: parsed.error } };
  if (!webIntakeAllowed_()) {
    return {
      nonce: nonce,
      body: { ok: false, error: 'Too many people are joining at once. Please wait a minute and try again.' },
    };
  }
  if (parsed.skip) return { nonce: nonce, body: { ok: true } };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { nonce: nonce, body: { ok: false, error: 'We could not save this just now. Please try again in a minute.' } };
  }
  try {
    var cache = CacheService.getScriptCache();
    var seenKey = cacheKey_('seen', parsed.app + '\n' + parsed.answers[Q.ownerEmail]);
    if (cache.get(seenKey)) return { nonce: nonce, body: { ok: true, app: parsed.app } };

    var photosSkipped = [];
    var roles = ['logo', 'cover'];
    for (var i = 0; i < roles.length; i++) {
      var role = roles[i];
      if (!parsed.images[role]) continue;
      var checked = checkWebImage_(parsed.images[role]);
      if (checked.error) {
        photosSkipped.push(role === 'logo' ? 'Logo' : 'Cover photo');
        continue;
      }
      try {
        parsed.answers[role === 'logo' ? Q.logo : Q.cover] = saveWebImage_(checked, role);
      } catch (err) {
        Logger.log('web intake image: ' + (err && err.message ? err.message : role));
        photosSkipped.push(role === 'logo' ? 'Logo' : 'Cover photo');
      }
    }
    appendWebRow_(getSheet_(), parsed);
    cache.put(seenKey, '1', 120);
    return { nonce: nonce, body: { ok: true, app: parsed.app, photosSkipped: photosSkipped } };
  } finally {
    lock.releaseLock();
  }
}

/**
 * The join page. Apps Script adds ".html" itself, so the file is created as intakepage
 * and the sidebar shows intakepage.html. A rename that types the extension again stores
 * intakepage.html.html, which this also accepts. The web app serves the last deployment,
 * not the latest save, so a new version is required after the file exists.
 */
function joinPageTemplate_() {
  var names = ['intakepage', 'intakepage.html'];
  var last = null;
  for (var i = 0; i < names.length; i++) {
    try {
      return HtmlService.createTemplateFromFile(names[i]);
    } catch (err) {
      last = err;
    }
  }
  throw last || new Error('No HTML file named intakepage was found.');
}

/** Web app: the join page. */
function webAppUrlOk_(url) {
  return /^https:\/\/script\.google\.com\/(?:macros\/s\/|a\/macros\/[a-z0-9.-]+\/s\/)[A-Za-z0-9_-]+\/(?:exec|dev)$/i.test(String(url || ''));
}

function doGet() {
  var tpl = joinPageTemplate_();
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (err) { url = ''; }
  if (!webAppUrlOk_(url)) url = '';
  tpl.execUrl = url;
  return tpl.evaluate().setTitle('Join Citizens').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Web app: append one sheet row. Deploy as "execute as me", anyone even anonymous. */
function doPost(e) {
  var nonce = '';
  try {
    var out = receiveWebIntake_(e);
    nonce = out.nonce || '';
    return respond_(e, nonce, out.body);
  } catch (err) {
    var detail = err && err.message ? String(err.message).replace(/\s+/g, ' ').slice(0, 240) : '';
    Logger.log('web intake: ' + (detail || 'failed'));
    return respond_(e, nonce, {
      ok: false,
      error: detail ? 'We could not save this. ' + detail : 'We could not save this just now. Please try again in a minute.',
    });
  }
}

/** Run from the editor after deploying, to show the public link. */
function webAppUrl() {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (err) { url = ''; }
  var message = url || 'Deploy as a web app first (see the README).';
  Logger.log(message);
  try { SpreadsheetApp.getActive().toast(message, 'Citizens intake', 15); } catch (err) { /* no sheet UI */ }
  return url;
}
