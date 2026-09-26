# Citizens Connect — Categories Reference

Complete listing of all place and event categories used in the Citizens Connect platform, with their hex colors and associated Lucide React icons.

---

## Event Categories (17)

| ID | Name | Short | Hex Color | Icon | Swatch |
|---|---|---|---|---|---|
| `worship-prayer` | Worship & Prayer | Worship | `#B8860B` | `HeartHandshake` | ![](https://via.placeholder.com/30/B8860B/B8860B) |
| `church-services` | Church Services | Church | `#D4AF37` | `Building2` | ![](https://via.placeholder.com/30/D4AF37/D4AF37) |
| `outreach-missions` | Outreach & Missions | Outreach | `#1ABC9C` | `Globe` | ![](https://via.placeholder.com/30/1ABC9C/1ABC9C) |
| `markets-expos` | Markets & Expos | Markets | `#F39C12` | `Store` | ![](https://via.placeholder.com/30/F39C12/F39C12) |
| `sport-recreation` | Sport & Recreation | Sport | `#2ECC71` | `CircleDot` | ![](https://via.placeholder.com/30/2ECC71/2ECC71) |
| `arts-culture` | Arts & Culture | Arts | `#FF6B35` | `Palette` | ![](https://via.placeholder.com/30/FF6B35/FF6B35) |
| `social-gatherings` | Social Gatherings | Social | `#E91E63` | `Wine` | ![](https://via.placeholder.com/30/E91E63/E91E63) |
| `community-upliftment` | Community Upliftment | Upliftment | `#9B59B6` | `HeartHandshake` | ![](https://via.placeholder.com/30/9B59B6/9B59B6) |
| `education-equipping` | Education & Equipping | Education | `#3498DB` | `GraduationCap` | ![](https://via.placeholder.com/30/3498DB/3498DB) |
| `marriage-family` | Marriage & Family | Family | `#E74C3C` | `Users` | ![](https://via.placeholder.com/30/E74C3C/E74C3C) |
| `mens-community` | Men's Community | Men's | `#34495E` | `User` | ![](https://via.placeholder.com/30/34495E/34495E) |
| `womens-community` | Women's Community | Women's | `#C71585` | `UserRound` | ![](https://via.placeholder.com/30/C71585/C71585) |
| `youth-students` | Youth & Students | Youth | `#FF8C42` | `Flame` | ![](https://via.placeholder.com/30/FF8C42/FF8C42) |
| `kids` | Kids | Kids | `#00BCD4` | `Candy` | ![](https://via.placeholder.com/30/00BCD4/00BCD4) |
| `care-recovery` | Care & Recovery | Care | `#8E44AD` | `HandHeart` | ![](https://via.placeholder.com/30/8E44AD/8E44AD) |
| `members-only` | Members Only | Members | `#212121` | `KeyRound` | ![](https://via.placeholder.com/30/212121/212121) |
| `conferences-summits` | Conferences & Summits | Conferences | `#5D6D7E` | `Mic` | ![](https://via.placeholder.com/30/5D6D7E/5D6D7E) |

---

## Place Categories (10)

| ID | Name | Short | Hex Color | Icon | Swatch |
|---|---|---|---|---|---|
| `churches-ministries` | Churches & Ministries | Churches | `#D4AF37` | `Building2` | ![](https://via.placeholder.com/30/D4AF37/D4AF37) |
| `hospitality-cafes` | Hospitality & Cafés | Cafés | `#8B4513` | `Coffee` | ![](https://via.placeholder.com/30/8B4513/8B4513) |
| `recreation-sport` | Recreation & Sport | Recreation | `#2ECC71` | `Dumbbell` | ![](https://via.placeholder.com/30/2ECC71/2ECC71) |
| `media-broadcasting` | Media & Broadcasting | Media | `#9B59B6` | `Radio` | ![](https://via.placeholder.com/30/9B59B6/9B59B6) |
| `retail-shopping` | Retail & Shopping | Retail | `#E91E63` | `ShoppingBag` | ![](https://via.placeholder.com/30/E91E63/E91E63) |
| `health-wellness` | Health & Wellness | Health | `#E74C3C` | `Stethoscope` | ![](https://via.placeholder.com/30/E74C3C/E74C3C) |
| `education-training` | Education & Training | Training | `#3498DB` | `BookOpen` | ![](https://via.placeholder.com/30/3498DB/3498DB) |
| `arts-creative` | Arts & Creative | Creative | `#FF6B35` | `Palette` | ![](https://via.placeholder.com/30/FF6B35/FF6B35) |
| `christian-businesses` | Christian Businesses | Business | `#A67C00` | `Store` | ![](https://via.placeholder.com/30/A67C00/A67C00) |
| `safe-spaces` | Safe Spaces | Safe | `#B59CD9` | `Heart` | ![](https://via.placeholder.com/30/B59CD9/B59CD9) |

---

## Contributor Types (12) — founder, 2026-09-26

What a Contributor **does**. This is a separate list from the event categories above, which are
unchanged. Slugs are reused where the meaning is identical, so existing pins, filters and rows keep
working; three are new (★).

Every **new** write of `profiles.contributor_category` must use one of these: the Apply wizard, Admin
Create, and the Google Form intake. Older event/place slugs already stored on a row still render.
Source of truth: `CONTRIBUTOR_TYPES` in `src/lib/categories.ts` (server) and in `src/frontend/app/data.jsx`
(UI). A test pins the two together (`src/__tests__/lib/contributorTypes.test.ts`).

| ID | Name (= Google Form label) | Short | Hex Color | Icon |
|---|---|---|---|---|
| `churches-ministries` | Church | Church | `#D4AF37` | `Church` |
| `outreach-missions` | Outreach / Mission | Outreach | `#1ABC9C` | `Globe` |
| `markets-expos` | Market / Expo | Market | `#F39C12` | `Store` |
| `christian-businesses` | Business | Business | `#A67C00` | `Store` |
| `sport-recreation` | Sport & Recreation | Sport | `#2ECC71` | `CircleDot` |
| `social-gatherings` | Social Gathering | Social | `#E91E63` | `Wine` |
| `arts-culture` | Arts & Culture | Arts | `#FF6B35` | `Palette` |
| `media-broadcasting` | Media | Media | `#9B59B6` | `Radio` |
| `retreat-healing` ★ | Retreat / Healing | Retreat | `#6FA89A` | `Leaf` |
| `clinic` ★ | Clinic | Clinic | `#C0392B` | `Stethoscope` |
| `education-equipping` | Education / Equipping | Education | `#3498DB` | `GraduationCap` |
| `rehab-development` ★ | Rehab / Development | Rehab | `#5B2C6F` | `HandHeart` |

**Resolution:** on a Contributor (map pin, card, profile), `window.DATA.getItemCategory()` looks up the
Contributor type **first**. So `churches-ministries` shows "Church" with the Church glyph on a
Contributor, and "Churches & Ministries" with Building2 on a Place. The map's single pill row
(`FILTER_CATEGORIES`) = events + places + the three ★ types.

**Contributor kind** (how you're set up, not what you do; `profiles.contributor_kind`): `ministry` ·
`organization` · `business` · `individual` (mig 173). Individual means a person serving in their own
capacity. Source: `CONTRIBUTOR_KINDS` in `src/types/db.ts`.

---

## Icon Library

All icons are from **Lucide React** (https://lucide.dev). The icons used across all categories are:

### Event Categories
- `HeartHandshake` — used in Worship & Prayer, Community Upliftment
- `Building2` — Church Services
- `Globe` — Outreach & Missions
- `Store` — Markets & Expos
- `CircleDot` — Sport & Recreation
- `Palette` — Arts & Culture
- `Wine` — Social Gatherings
- `GraduationCap` — Education & Equipping
- `Users` — Marriage & Family
- `User` — Men's Community
- `UserRound` — Women's Community
- `Flame` — Youth & Students
- `Candy` — Kids
- `HandHeart` — Care & Recovery
- `KeyRound` — Members Only
- `Mic` — Conferences & Summits

### Place Categories
- `Building2` — Churches & Ministries
- `Coffee` — Hospitality & Cafés
- `Dumbbell` — Recreation & Sport
- `Radio` — Media & Broadcasting
- `ShoppingBag` — Retail & Shopping
- `Stethoscope` — Health & Wellness
- `BookOpen` — Education & Training
- `Palette` — Arts & Creative
- `Store` — Christian Businesses
- `Heart` — Safe Spaces

---

## Color Reference

### Brand Colors
- **Gold** — `#D4AF37` (Church Services, Churches & Ministries)
- **Dark Gold** — `#B8860B` (Worship & Prayer)

### Primary Colors
- **Teal** — `#1ABC9C` (Outreach & Missions)
- **Orange** — `#F39C12` (Markets & Expos), `#FF8C42` (Youth & Students)
- **Bright Orange** — `#FF6B35` (Arts & Culture, Arts & Creative)
- **Green** — `#2ECC71` (Sport & Recreation, Recreation & Sport)
- **Pink** — `#E91E63` (Social Gatherings, Retail & Shopping)
- **Teal/Cyan** — `#00BCD4` (Kids)

### Secondary Colors
- **Purple** — `#9B59B6` (Community Upliftment, Media & Broadcasting)
- **Deep Purple** — `#8E44AD` (Care & Recovery)
- **Blue** — `#3498DB` (Education & Equipping, Education & Training)
- **Red** — `#E74C3C` (Marriage & Family, Health & Wellness)

### Neutral Colors
- **Brown** — `#8B4513` (Hospitality & Cafés)
- **Dark Brown** — `#A67C00` (Christian Businesses)
- **Slate Gray** — `#34495E` (Men's Community)
- **Dark Gray** — `#5D6D7E` (Conferences & Summits)
- **Black** — `#212121` (Members Only)
- **Light Purple** — `#B59CD9` (Safe Spaces)

---

## Implementation Notes

### Accessing Categories in Code

```javascript
// From window.DATA (frontend)
const category = window.DATA.getEventCategory('worship-prayer');
const category = window.DATA.getPlaceCategory('churches-ministries');

// All categories
window.DATA.EVENT_CATEGORIES   // Array of 17 event categories
window.DATA.PLACE_CATEGORIES   // Array of 10 place categories
```

### Category Object Structure

```javascript
{
  id: string,        // Unique identifier (kebab-case)
  name: string,      // Full display name
  short: string,     // Short form for compact UI
  hex: string,       // Hex color code
  icon: string       // Lucide React icon component name
}
```

### Rendering Icons

```jsx
// Using Lucide React
import { HeartHandshake } from 'lucide-react';

const category = window.DATA.getEventCategory('worship-prayer');
<HeartHandshake color={category.hex} size={24} />
```

---

## Source

Categories are defined in [`src/frontend/app/data.jsx`](src/frontend/app/data.jsx) and are available globally as `window.DATA`.

Last updated: **2026-06-18**
