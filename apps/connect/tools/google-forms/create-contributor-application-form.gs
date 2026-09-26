/**
 * ⚠️ SUPERSEDED (2026-09-26) — do not run. The founder built the live Form
 * ("New 219-Connect Contributor") by hand, with different option labels and
 * the 12 Contributor types instead of the event categories below. The live
 * pipeline is intake.gs (Sheet → Connect) — see README.md in this folder.
 * Kept for history only.
 *
 * Citizens Connect: Contributor Application Form builder (Google Apps Script)
 *
 * Builds the Google Form that onboards a new Contributor, plus a linked
 * responses Sheet. Run it ONCE; every run creates a fresh form.
 *
 * HOW TO RUN
 *   1. Go to https://script.google.com and click "New project".
 *   2. Delete the placeholder code, paste this whole file, then click Save.
 *   3. Select `createContributorApplicationForm` in the toolbar and click Run.
 *      Approve the permissions prompt (Forms, Sheets, Drive).
 *   4. Open View → Logs (or Execution log) for the edit link, the live link
 *      and the linked responses Sheet.
 *   5. Add the 3 file-upload questions by hand (Apps Script can't create
 *      them; see the "Branding & photos" section note and the log).
 *
 * Field spec (question → DB column, limits): Drive doc
 * "Citizens Connect — Contributor Application Form (Field Spec)".
 * Every limit below mirrors /api/admin/contributors/create and
 * /api/contributor/profile so a response can be imported without edits.
 * Category labels must match src/lib/categories.ts EVENT_CATEGORIES exactly;
 * CATEGORY_SLUGS is the label → contributor_category map a future
 * onFormSubmit importer will use.
 */

var FORM_TITLE = 'Become a Contributor: Citizens Connect';

// Label → contributor_category slug (src/lib/categories.ts EVENT_CATEGORIES).
var CATEGORY_SLUGS = {
  'Worship & Prayer': 'worship-prayer',
  'Church Services': 'church-services',
  'Outreach & Missions': 'outreach-missions',
  'Markets & Expos': 'markets-expos',
  'Sport & Recreation': 'sport-recreation',
  'Arts & Culture': 'arts-culture',
  'Social Gatherings': 'social-gatherings',
  'Community Upliftment': 'community-upliftment',
  'Education & Equipping': 'education-equipping',
  'Marriage & Family': 'marriage-family',
  "Men's Community": 'mens-community',
  "Women's Community": 'womens-community',
  'Youth & Students': 'youth-students',
  'Kids': 'kids',
  'Care & Recovery': 'care-recovery',
  'Members Only': 'members-only',
  'Conferences & Summits': 'conferences-summits',
};

// Label → contributor_kind. "Individual" has no DB value yet (stored null).
var KIND_VALUES = {
  'Ministry': 'ministry',
  'Organisation': 'organization',
  'Business': 'business',
  'Individual': null,
};

var NO_FIXED_LOCATION = "No, we're online, mobile or have no permanent office";

function maxLen_(n) {
  return FormApp.createTextValidation()
    .setHelpText('Please keep this under ' + n + ' characters.')
    .requireTextLengthLessThanOrEqualTo(n)
    .build();
}

function maxParaLen_(n) {
  return FormApp.createParagraphTextValidation()
    .setHelpText('Please keep this under ' + n + ' characters.')
    .requireTextLengthLessThanOrEqualTo(n)
    .build();
}

function email_() {
  return FormApp.createTextValidation()
    .setHelpText('Please enter a valid email address.')
    .requireTextIsEmail()
    .build();
}

function createContributorApplicationForm() {
  var form = FormApp.create(FORM_TITLE);
  form
    .setDescription(
      'Connecting the Kingdom. Ephesians 2:19–21\n\n' +
      'Citizens Connect helps people find Christian ministries, organisations, ' +
      'businesses, events and places near them. Fill in this form and we will ' +
      'create your Contributor listing. Once it is live, sign in to Citizens ' +
      'Connect with the Google email you give below to claim and manage it.\n\n' +
      'It takes about 5 minutes. Only the questions marked * are required.'
    )
    .setProgressBar(true)
    .setAllowResponseEdits(false)
    .setLimitOneResponsePerUser(false)
    .setConfirmationMessage(
      'Thank you! We will review your application and let you know when your ' +
      'listing is live. To claim it, sign in to Citizens Connect with Google ' +
      'using the owner email you gave us.'
    );

  // ── Section 1: About you ──────────────────────────────────────────
  form.addSectionHeaderItem()
    .setTitle('About you')
    .setHelpText('This helps us confirm who is applying. It is not shown publicly.');

  form.addTextItem().setTitle('Your full name').setRequired(true)
    .setValidation(maxLen_(120));

  form.addTextItem()
    .setTitle('Your role in the organisation')
    .setHelpText('e.g. Pastor, Founder, Director, Administrator');

  form.addTextItem()
    .setTitle("Owner's email: the Google account you will sign in to Citizens Connect with")
    .setHelpText(
      'Use a Gmail or Google Workspace address you can sign in with. Your ' +
      'listing is linked to this email, and signing in with it is how you ' +
      'claim your listing. If this email already has a Citizens account, ' +
      'please apply from inside the app instead.'
    )
    .setRequired(true)
    .setValidation(email_());

  form.addTextItem()
    .setTitle('Your phone number')
    .setHelpText('Only used if we need to follow up with you. Not shown publicly.');

  // ── Section 2: Listing basics ─────────────────────────────────────
  form.addPageBreakItem()
    .setTitle('Your listing')
    .setHelpText('How you will appear on the Citizens Connect map and in Kingdom Discovery.');

  form.addTextItem()
    .setTitle('Organisation / ministry name')
    .setHelpText('Exactly as it should appear on the map, e.g. "New Wine Fellowship".')
    .setRequired(true)
    .setValidation(maxLen_(120));

  var kind = form.addMultipleChoiceItem();
  kind.setTitle('What kind of Contributor are you?')
    .setChoiceValues(Object.keys(KIND_VALUES));

  form.addListItem()
    .setTitle('Primary category')
    .setHelpText('This sets your colour and icon on the map. Choose the one that fits you best.')
    .setChoiceValues(Object.keys(CATEGORY_SLUGS))
    .setRequired(true);

  // ── Section 3: Location (branches on fixed location) ─────────────
  form.addPageBreakItem()
    .setTitle('Location')
    .setHelpText('Listings with a fixed address get a pin on the map. Online or mobile ' +
      'Contributors are still listed in Kingdom Discovery, just without a pin.');

  var fixed = form.addMultipleChoiceItem();
  fixed.setTitle('Do you have a fixed physical location people can visit?').setRequired(true);

  form.addTextItem()
    .setTitle('Which area(s) or suburbs do you serve?')
    .setHelpText('e.g. Hatfield, Pretoria East, all of Tshwane');

  var addressPage = form.addPageBreakItem()
    .setTitle('Your address')
    .setHelpText('We use this to place your pin on the map.');

  form.addParagraphTextItem()
    .setTitle('Street address')
    .setHelpText('Full address including suburb and city, e.g. "123 Church St, Hatfield, Pretoria".')
    .setRequired(true)
    .setValidation(maxParaLen_(300));

  form.addTextItem()
    .setTitle('Google Maps link to your location (optional)')
    .setHelpText('In Google Maps, find your location, tap Share and paste the link here. ' +
      'This gives the most accurate pin.')
    .setValidation(maxLen_(500));

  // ── Section 4: Story & contact ────────────────────────────────────
  var storyPage = form.addPageBreakItem()
    .setTitle('Your story and contact details');

  form.addParagraphTextItem()
    .setTitle('Short bio')
    .setHelpText('Who you are and who you serve, in up to 240 characters. This appears on your listing card.')
    .setValidation(maxParaLen_(240));

  form.addTextItem()
    .setTitle('Website')
    .setHelpText('e.g. https://yourministry.org')
    .setValidation(maxLen_(500));

  form.addTextItem()
    .setTitle('Public contact email (shown on your listing)')
    .setHelpText('Can be different from the owner email, e.g. info@yourchurch.org.')
    .setValidation(email_());

  // Wire the branch now that both target pages exist.
  fixed.setChoices([
    fixed.createChoice('Yes', addressPage),
    fixed.createChoice(NO_FIXED_LOCATION, storyPage),
  ]);

  // ── Section 5: Social media ───────────────────────────────────────
  form.addPageBreakItem()
    .setTitle('Social media')
    .setHelpText('All optional. A handle (@name) or a full link both work.');

  ['Instagram', 'Facebook', 'TikTok', 'YouTube', 'X (Twitter)', 'LinkedIn'].forEach(function (network) {
    form.addTextItem().setTitle(network).setValidation(maxLen_(500));
  });
  form.addTextItem()
    .setTitle('WhatsApp')
    .setHelpText('A number, wa.me link or group invite link.')
    .setValidation(maxLen_(500));

  // ── Section 6: Branding & photos ──────────────────────────────────
  // Apps Script cannot create File upload questions. Add them in the Form
  // editor directly under this section header (see the log).
  form.addPageBreakItem()
    .setTitle('Branding and photos')
    .setHelpText('Optional. Your logo and photos are the first thing people see.');

  // ── Section 7: Team, alignment & consent ─────────────────────────
  form.addPageBreakItem().setTitle('Team, alignment and consent');

  form.addParagraphTextItem()
    .setTitle('Team members to invite (optional)')
    .setHelpText('Name and email, one per line. We will invite them once your listing is claimed.');

  form.addCheckboxItem()
    .setTitle('Do you run regular events or have venues you would like to list?')
    .setChoiceValues([
      'Weekly services / meetings',
      'One-off events',
      'A venue / place people can visit',
      'Not yet',
    ]);

  form.addMultipleChoiceItem()
    .setTitle('How did you hear about Citizens?')
    .setChoiceValues(['A friend or church member', 'Social media', 'A Citizens event', 'WhatsApp group'])
    .showOtherOption(true);

  form.addCheckboxItem()
    .setTitle('Faith alignment')
    .setHelpText('Citizens is an unapologetically Christian community platform.')
    .setChoiceValues([
      "We are a Christian or faith-rooted organisation, ministry, business or initiative, " +
      "and we affirm Citizens' Christian identity.",
    ])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('Permission to publish')
    .setHelpText('Required under POPIA. We only publish the listing details you gave us, not your ' +
      'personal name, phone number or owner email.')
    .setChoiceValues([
      'I am authorised to represent this organisation and I consent to Citizens publishing ' +
      'the listing details above publicly on Citizens Connect.',
    ])
    .setRequired(true);

  // ── Linked responses Sheet ────────────────────────────────────────
  var sheet = SpreadsheetApp.create(FORM_TITLE + ' (Responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  Logger.log('Form created.');
  Logger.log('  Edit:      ' + form.getEditUrl());
  Logger.log('  Share:     ' + form.getPublishedUrl());
  Logger.log('  Responses: ' + sheet.getUrl());
  Logger.log('');
  Logger.log('ONE MANUAL STEP: open the Edit link, go to the "Branding and photos" section,');
  Logger.log('and add 3 "File upload" questions (only images allowed):');
  Logger.log('  1. Logo / profile photo (square works best): 1 file, max 10 MB');
  Logger.log('  2. Cover / banner photo (wide): 1 file, max 10 MB');
  Logger.log('  3. Gallery photos: up to 5 files, max 10 MB each');
  Logger.log('     (Google Forms allows 1, 5 or 10 files, and the app keeps up to 6.)');
}
