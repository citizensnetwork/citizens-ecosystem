-- Phase 17: Indemnity Forms
-- Indemnity forms that organisers must sign when creating events/places
-- Attendees can also sign indemnity waivers for specific events

-- ── Indemnity templates (admin-managed) ──────────────────
CREATE TABLE IF NOT EXISTS indemnity_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,           -- full legal text (markdown)
  version     int NOT NULL DEFAULT 1,
  applies_to  text NOT NULL DEFAULT 'events' CHECK (applies_to IN ('events', 'places', 'both')),
  required    boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Signed indemnities ───────────────────────────────────
CREATE TABLE IF NOT EXISTS indemnity_signatures (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES indemnity_templates(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id      uuid REFERENCES events(id) ON DELETE SET NULL,
  place_id      uuid REFERENCES places(id) ON DELETE SET NULL,
  full_name     text NOT NULL,               -- name as typed at signing
  agreed_at     timestamptz NOT NULL DEFAULT now(),
  ip_address    text,                        -- for audit trail
  template_version int NOT NULL DEFAULT 1,   -- version at time of signing
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, user_id, event_id),
  UNIQUE(template_id, user_id, place_id)
);

-- ── RLS ──────────────────────────────────────────────────
ALTER TABLE indemnity_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE indemnity_signatures ENABLE ROW LEVEL SECURITY;

-- Templates: anyone can read, only admins can write
CREATE POLICY "Anyone can read indemnity templates"
  ON indemnity_templates FOR SELECT USING (true);
CREATE POLICY "Admins can manage indemnity templates"
  ON indemnity_templates FOR ALL USING (is_admin());

-- Signatures: users can read their own, can insert their own
CREATE POLICY "Users can read own signatures"
  ON indemnity_signatures FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can sign indemnities"
  ON indemnity_signatures FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can read all signatures"
  ON indemnity_signatures FOR SELECT
  USING (is_admin());

-- ── Seed default organiser indemnity template ────────────
INSERT INTO indemnity_templates (slug, title, body, applies_to, required)
VALUES (
  'organiser-event-liability',
  'Event Organiser Liability Waiver',
  E'## Event Organiser Liability Waiver\n\nBy creating this event on Citizens Connect, I acknowledge and agree to the following:\n\n1. **Responsibility**: I am solely responsible for the planning, execution, and safety of this event.\n2. **Accuracy**: All information provided about this event is accurate and not misleading.\n3. **Compliance**: This event complies with all applicable local laws, bylaws, and regulations.\n4. **Liability**: Citizens Connect, its operators, and affiliates shall not be held liable for any injuries, damages, losses, or claims arising from this event.\n5. **Insurance**: I understand that Citizens Connect does not provide insurance coverage for events listed on the platform.\n6. **Indemnification**: I agree to indemnify and hold harmless Citizens Connect from any claims, damages, or expenses arising from my event.\n7. **Content**: I have the right to use all content (images, descriptions, etc.) associated with this event listing.\n\nThis agreement is binding from the moment of event publication.',
  'events',
  true
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO indemnity_templates (slug, title, body, applies_to, required)
VALUES (
  'attendee-participation-waiver',
  'Event Participation Waiver',
  E'## Event Participation Waiver\n\nBy RSVPing to this event, I acknowledge and agree:\n\n1. **Voluntary Participation**: My attendance is voluntary and at my own risk.\n2. **Assumption of Risk**: I understand that events may involve inherent risks.\n3. **Release**: I release the event organiser and Citizens Connect from liability for any injuries or losses during the event.\n4. **Emergency Contact**: I confirm I have provided accurate contact information in my profile.\n5. **Media Consent**: I consent to being photographed or recorded at the event unless I opt out with the organiser.',
  'events',
  false
)
ON CONFLICT (slug) DO NOTHING;

-- ── Indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_indemnity_signatures_user
  ON indemnity_signatures (user_id);
CREATE INDEX IF NOT EXISTS idx_indemnity_signatures_event
  ON indemnity_signatures (event_id);
CREATE INDEX IF NOT EXISTS idx_indemnity_signatures_template_user
  ON indemnity_signatures (template_id, user_id);
