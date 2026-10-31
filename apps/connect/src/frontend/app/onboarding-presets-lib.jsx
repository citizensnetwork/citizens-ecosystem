// ════════════════════════════════════════════════════════════════════
//  Citizens Connect — onboarding presets (issue #202): the Apply wizard's defaults, with no React in it.
//  ------------------------------------------------------------------
//  config/onboarding-presets.json is the reviewed source. This file carries the part of it the wizard reads (the six
//  Contributor presets and which Contributor type names which preset); a test keeps the two equal, so adding a preset is
//  one entry there plus the matching row here. A preset only OFFERS defaults: the Type the wizard starts on (until the
//  person picks one themselves), and, for Care / Recovery, the founder's rules of 2026-10-21:
//    * They MAY list, with EXTRA admin review (the admin card says so).
//    * They OPT IN to the map: the address and pin are not asked for and not stored unless they turn the map on.
//    * Nothing is public before an admin approves, and the discovery routine never auto-publishes for them.
//  The server is the wall (the apply route and the automation routes enforce the same rules); this file only explains them.
//
//  Public surface: window.CCPresets = { PRESETS, CATEGORY_PRESET, presetFor, defaultKindFor, needsExtraReview,
//  keepsOffMap, COPY }.
// ════════════════════════════════════════════════════════════════════
(function () {
  const PRESETS = {
    congregation_ministry: { label: 'Congregation / Ministry', kind: 'ministry', extraReview: false },
    business_retail: { label: 'Business / Retail', kind: 'business', extraReview: false },
    media_creative: { label: 'Media / Creative', kind: 'organization', extraReview: false },
    outreach_npo: { label: 'Outreach / Non-profit', kind: 'organization', extraReview: false },
    care_recovery: { label: 'Care / Recovery', kind: 'organization', extraReview: true },
    education: { label: 'Education', kind: 'organization', extraReview: false },
  };

  // Contributor type (window.DATA.CONTRIBUTOR_TYPES id) -> preset. A type that is not here offers no preset.
  const CATEGORY_PRESET = {
    'churches-ministries': 'congregation_ministry',
    'outreach-missions': 'outreach_npo',
    'christian-businesses': 'business_retail',
    'arts-culture': 'media_creative',
    'media-broadcasting': 'media_creative',
    'retreat-healing': 'care_recovery',
    'clinic': 'care_recovery',
    'rehab-development': 'care_recovery',
    'education-equipping': 'education',
  };

  const COPY = {
    mapToggleLabel: 'Show my address and pin on the map',
    mapToggleDesc: 'Off by default. Your listing is still found in Kingdom Discovery without it.',
    careNote: 'Care and recovery services get an extra look from an admin before anything is public. Nothing of yours is public until they approve it, and what you add afterwards is up to you.',
    reviewMapOn: 'Yes',
    reviewMapOff: 'No, kept private',
    reviewCareNote: 'Because yours is a care or recovery service, an admin takes a closer look before anything is public.',
    adminBadge: 'CARE / RECOVERY · EXTRA REVIEW',
    adminCheck: 'Care / Recovery: the founder asked for extra care here. Read the story and the website first, and approve only when you are satisfied.',
    kindMatched: (label) => ' We matched your Type to ' + label + '; change it above if that is not right.',
  };

  /** The preset a Contributor type names, or null when it names none. */
  const presetFor = (category) => {
    const id = Object.prototype.hasOwnProperty.call(CATEGORY_PRESET, category) ? CATEGORY_PRESET[category] : null;
    return id ? Object.assign({ id: id }, PRESETS[id]) : null;
  };
  const defaultKindFor = (category) => { const p = presetFor(category); return p ? p.kind : null; };
  const needsExtraReview = (category) => { const p = presetFor(category); return !!(p && p.extraReview); };
  /** True while an extra-review applicant has not opted in to the map: no address, no pin, none requested. */
  const keepsOffMap = (form) => !!form && needsExtraReview(form.category) && form.showOnMap !== true;

  window.CCPresets = { PRESETS, CATEGORY_PRESET, presetFor, defaultKindFor, needsExtraReview, keepsOffMap, COPY };
})();
