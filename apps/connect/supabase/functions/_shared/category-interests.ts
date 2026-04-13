/**
 * Maps each of the 15 event categories to interest slugs from the
 * onboarding system. Used by notify-interested-users and send-daily-digest
 * to match new events to users based on their profile interests.
 *
 * Interest slugs reference items seeded by migration 011_interest_profile.sql.
 */
export const CATEGORY_INTEREST_MAP: Record<string, string[]> = {
  entertainment: [
    "music-concerts", "cultural-events", "social-mixers", "music-playing",
    "dance", "art-exhibitions", "photography", "gaming",
  ],
  "sport-fun": [
    "sports-events", "obstacle-races", "fitness",
  ],
  "social-fun": [
    "social-mixers", "cultural-events", "travel", "cooking", "gaming",
    "art-crafts", "dance",
  ],
  "community-upliftment": [
    "community-service", "volunteering", "evangelism-outreach", "non-profit",
    "mentoring-others",
  ],
  education: [
    "deeper-education", "leadership-conferences", "being-mentored",
    "personal-development", "reading", "writing", "technology", "education",
  ],
  church: [
    "worship-gatherings", "prayer-meetings", "bible-studies",
    "worship-ministry", "intercessory-prayer",
  ],
  missional: [
    "evangelism-outreach", "community-service", "strategic-networking",
    "mentoring-others", "non-profit",
  ],
  "marriage-and-couples": [
    "married", "building-connections",
  ],
  mens: [
    "fitness", "strategic-networking", "bible-studies", "mentoring-others",
    "personal-development",
  ],
  womens: [
    "personal-development", "building-connections", "bible-studies",
    "mentoring-others", "art-crafts",
  ],
  kids: [
    "youth-rallies", "new-parent", "student",
  ],
  recovery: [
    "inner-healing", "personal-development", "being-mentored",
    "intercessory-prayer",
  ],
  equip: [
    "deeper-education", "mentoring-others", "leadership-conferences",
    "personal-development", "technology", "business", "finance",
  ],
  weekend: [
    "social-mixers", "travel", "cultural-events", "fitness",
    "gardening", "photography",
  ],
  "members-only": [
    "building-connections", "strategic-networking", "deeper-education",
  ],
};
