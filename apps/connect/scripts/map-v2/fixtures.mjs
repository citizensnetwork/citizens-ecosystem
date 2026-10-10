// Map v2 measurement fixtures: deterministic, synthetic, no real organisation.
//
// Live data has about 45 pins (tracker P1-04), so the 150-pin test (M3) needs a
// synthetic fixture. Everything here is generated from a seeded PRNG so two runs
// on one machine produce the same pixels; names are obviously fictional and the
// only e-mail/URL hosts are reserved (.example, .test).
//
// Rows use the shapes /api/v1/{contributors,places,events} return, which
// store.jsx maps with adaptContributor / adaptPlace / adaptEvent.

export const PRETORIA = { lat: -25.7479, lng: 28.2293 };

// Small deterministic PRNG (mulberry32).
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// UUID v4 shaped, deterministic (the router only accepts UUIDs for /e and /p).
function uuid(prefix, n) {
  const hex = n.toString(16).padStart(12, '0');
  return `${prefix}-0000-4000-8000-${hex}`;
}

const EVENT_CATS = ['worship-prayer', 'church-services', 'outreach-missions', 'markets-expos', 'sport-recreation', 'arts-culture', 'social-gatherings', 'community-upliftment', 'education-equipping', 'youth-students', 'kids', 'care-recovery'];
const PLACE_CATS = ['churches-ministries', 'hospitality-cafes', 'recreation-sport', 'media-broadcasting', 'retail-shopping', 'health-wellness', 'education-training', 'arts-creative', 'christian-businesses', 'safe-spaces'];
const KINDS = ['ministry', 'organization', 'business', 'individual'];

// A logo as a data: URI (the CSP allows data: images). Initials on a flat colour;
// a wide wordmark variant exists because real logos are not all square.
export function logoDataUri(label, hue, wide = false) {
  const w = wide ? 300 : 120;
  const h = wide ? 80 : 120;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="hsl(${hue} 55% 38%)"/>` +
    `<text x="${w / 2}" y="${h / 2 + 14}" text-anchor="middle" font-size="${wide ? 38 : 44}" font-family="Arial" font-weight="700" fill="#fff">${label}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/**
 * @param {object} o
 * @param {number} o.contributors  how many Contributor pins
 * @param {number} o.places        how many Place pins
 * @param {number} o.events        how many (upcoming) Event pins
 * @param {number} [o.now]         epoch ms the page's clock is fixed to
 * @param {number} [o.spread]      degrees of lat/lng half-width around Pretoria
 * @param {number} [o.seed]
 * @param {boolean} [o.withLogos]  give Contributors a logo (else glyph pins)
 * @param {(i:number)=>string[]} [o.galleryFor]  gallery urls per contributor index
 */
export function makeSeed({ contributors = 12, places = 20, events = 8, now = Date.UTC(2026, 9, 10, 8, 0, 0), spread = 0.09, seed = 42, withLogos = true, galleryFor } = {}) {
  const rnd = prng(seed);
  const at = () => ({
    lat: PRETORIA.lat + (rnd() - 0.5) * 2 * spread,
    lng: PRETORIA.lng + (rnd() - 0.5) * 2 * spread * 1.15,
  });
  const created = new Date(now - 30 * 86_400_000).toISOString();
  const cRows = [];
  for (let i = 0; i < contributors; i++) {
    const p = at();
    const kind = KINDS[i % KINDS.length];
    const label = String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + ((i * 7) % 26));
    cRows.push({
      id: uuid('c0000000', i + 1),
      full_name: `Fixture Fellowship ${i + 1}`,
      role: 'contributor',
      contributor_kind: kind,
      // Most live Contributors are uncategorised; keep that shape for half.
      category: i % 2 === 0 ? PLACE_CATS[i % PLACE_CATS.length] : null,
      contributor_slug: `fixture-fellowship-${i + 1}`,
      bio: 'A fictional fellowship used only to measure the map.',
      avatar_url: null,
      logo_url: withLogos ? logoDataUri(label, (i * 47) % 360, i % 5 === 4) : null,
      website_url: 'https://fixture.example',
      instagram_handle: null,
      facebook_url: null,
      tiktok_handle: null,
      youtube_url: null,
      physical_address: `${10 + i} Fixture Street, Pretoria`,
      physical_latitude: p.lat,
      physical_longitude: p.lng,
      no_fixed_location: false,
      cover_photo_urls: null,
      gallery_urls: galleryFor ? galleryFor(i) : [],
      contact_email: null,
      created_at: created,
    });
  }
  const pRows = [];
  for (let i = 0; i < places; i++) {
    const p = at();
    pRows.push({
      id: uuid('d0000000', i + 1),
      name: `Fixture Place ${i + 1}`,
      description: 'A fictional place used only to measure the map.',
      address: `${20 + i} Sample Road, Pretoria`,
      category: PLACE_CATS[i % PLACE_CATS.length],
      custom_category: null,
      image_url: null,
      phone: '',
      website: '',
      open_hours: i % 3 === 0 ? 'Mon-Fri 08:00-17:00' : '',
      instagram_url: null, facebook_url: null, tiktok_url: null, youtube_url: null, x_url: null, linkedin_url: null, whatsapp_url: null,
      latitude: p.lat,
      longitude: p.lng,
      created_by: cRows.length ? cRows[i % cRows.length].id : null,
      verified: true,
      status: 'published',
      volunteer_openings: false,
    });
  }
  const eRows = [];
  for (let i = 0; i < events; i++) {
    const p = at();
    const start = now + (i + 1) * 7_200_000 + (i % 3) * 86_400_000;
    eRows.push({
      id: uuid('e0000000', i + 1),
      title: `Fixture Gathering ${i + 1}`,
      description: 'A fictional gathering used only to measure the map.',
      date: new Date(start).toISOString(),
      end_time: new Date(start + 7_200_000).toISOString(),
      location: `${30 + i} Example Avenue, Pretoria`,
      category: EVENT_CATS[i % EVENT_CATS.length],
      image_url: null,
      website_url: 'https://fixture.example/event',
      instagram_url: null, facebook_url: null, tiktok_url: null, youtube_url: null, x_url: null, linkedin_url: null, whatsapp_url: null,
      latitude: p.lat,
      longitude: p.lng,
      created_by: cRows.length ? cRows[i % cRows.length].id : null,
      created_at: created,
      community_contributor: false,
      volunteer_openings: false,
    });
  }
  return { contributors: cRows, places: pRows, events: eRows };
}

// The three-pin set the committed screenshots use: small enough to read, one of
// each shape, one Contributor with a logo (the case D8 changes by zoom).
export function smallSeed(now) {
  return makeSeed({ contributors: 3, places: 3, events: 2, now, spread: 0.02, seed: 7 });
}
