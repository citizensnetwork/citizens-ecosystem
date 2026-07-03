/**
 * Maps each of the 17 event categories to interest slugs from the
 * onboarding system. Used by notify-interested-users and send-daily-digest
 * to match new events to users based on their profile interests.
 *
 * Interest slugs reference items seeded by migration 011_interest_profile.sql.
 */
export const CATEGORY_INTEREST_MAP: Record<string, string[]> = {
  "worship-prayer": [
    "worship-gatherings", "prayer-meetings", "intercessory-prayer",
    "worship-ministry",
  ],
  "church-services": [
    "worship-gatherings", "prayer-meetings", "bible-studies",
    "worship-ministry", "intercessory-prayer",
  ],
  "outreach-missions": [
    "evangelism-outreach", "community-service", "strategic-networking",
    "mentoring-others", "non-profit",
  ],
  "markets-expos": [
    "business", "finance", "strategic-networking", "social-mixers",
    "art-crafts", "cultural-events",
  ],
  "sport-recreation": [
    "sports-events", "obstacle-races", "fitness",
  ],
  "arts-culture": [
    "music-concerts", "cultural-events", "social-mixers", "music-playing",
    "dance", "art-exhibitions", "photography", "gaming",
  ],
  "social-gatherings": [
    "social-mixers", "cultural-events", "travel", "cooking", "gaming",
    "art-crafts", "dance",
  ],
  "community-upliftment": [
    "community-service", "volunteering", "evangelism-outreach", "non-profit",
    "mentoring-others",
  ],
  "education-equipping": [
    "deeper-education", "leadership-conferences", "being-mentored",
    "personal-development", "reading", "writing", "technology", "education",
    "mentoring-others", "business", "finance",
  ],
  "marriage-family": [
    "married", "building-connections", "new-parent",
  ],
  "mens-community": [
    "fitness", "strategic-networking", "bible-studies", "mentoring-others",
    "personal-development",
  ],
  "womens-community": [
    "personal-development", "building-connections", "bible-studies",
    "mentoring-others", "art-crafts",
  ],
  "youth-students": [
    "youth-rallies", "student", "personal-development",
  ],
  kids: [
    "youth-rallies", "new-parent", "student",
  ],
  "care-recovery": [
    "inner-healing", "personal-development", "being-mentored",
    "intercessory-prayer",
  ],
  "members-only": [
    "building-connections", "strategic-networking", "deeper-education",
  ],
  "conferences-summits": [
    "leadership-conferences", "deeper-education", "strategic-networking",
    "social-mixers", "travel",
  ],
};
