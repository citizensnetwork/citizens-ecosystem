-- Migration 114: Add 'suggestion_response' to notifications_type_check
-- =====================================================================
-- Stage J of contributor-dashboard plan: dedicated notification type for
-- admin → submitter responses when a suggestion is actioned or declined.
-- Previously the PATCH route reused 'contributor_approved' as a hack;
-- this gives suggestion notifications their own first-class type so the
-- in-app bell can render the right icon/label and so analytics can split
-- them from genuine contributor-approval flows.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
      'event_reminder',
      'new_event_match',
      'event_cancelled',
      'new_follower',
      'event_update',
      'new_message',
      'review_prompt',
      'admin_elevation_request',
      'friend_convince',
      'friend_attending',
      'contributor_approved',
      'contributor_rejected',
      'contributor_type_change_request',
      'admin_on_behalf_action',
      'broadcast_sent',
      'spam_flag',
      'broadcast_flood',
      'dm_received',
      'dm_response',
      'team_invite',
      'team_invite_response',
      'team_owner_transfer',
      'volunteer_application',
      'volunteer_application_response',
      'suggestion_response'
    ]::text[])
  );

COMMENT ON CONSTRAINT notifications_type_check ON public.notifications IS
  'Closed enum of notification kinds. Extend via migration when adding new flows. Stage J adds suggestion_response.';
