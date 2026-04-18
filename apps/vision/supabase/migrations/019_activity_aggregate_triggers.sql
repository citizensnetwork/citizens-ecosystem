-- Phase 15c: Real-time aggregate freshness via triggers
--
-- Phase 15 introduced activity_daily_aggregates with a 30-min cron
-- refresh. That leaves up to 30 minutes of staleness after any
-- create/update/delete. This migration adds AFTER triggers on the
-- activities table that call refresh_activity_day() for every
-- (org_id, date) tuple touched by the statement.
--
-- Design notes:
--   * Statement-level trigger over row-level: a bulk insert touches a
--     handful of distinct (org_id, day) pairs, so refreshing each pair
--     once is much cheaper than per-row.
--   * SECURITY DEFINER on refresh_activity_day already exists; the
--     trigger function inherits its privilege model.
--   * UPDATE handles row migration between days/orgs by refreshing
--     both the OLD and NEW (org_id, day) pairs.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION trg_refresh_activities_aggregates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec record;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    FOR rec IN SELECT DISTINCT org_id, date FROM new_table LOOP
      PERFORM refresh_activity_day(rec.org_id, rec.date);
    END LOOP;
  ELSIF (TG_OP = 'DELETE') THEN
    FOR rec IN SELECT DISTINCT org_id, date FROM old_table LOOP
      PERFORM refresh_activity_day(rec.org_id, rec.date);
    END LOOP;
  ELSE -- UPDATE
    FOR rec IN
      SELECT DISTINCT org_id, date FROM old_table
      UNION
      SELECT DISTINCT org_id, date FROM new_table
    LOOP
      PERFORM refresh_activity_day(rec.org_id, rec.date);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS activities_aggregate_insert ON activities;
CREATE TRIGGER activities_aggregate_insert
  AFTER INSERT ON activities
  REFERENCING NEW TABLE AS new_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_refresh_activities_aggregates();

DROP TRIGGER IF EXISTS activities_aggregate_update ON activities;
CREATE TRIGGER activities_aggregate_update
  AFTER UPDATE ON activities
  REFERENCING OLD TABLE AS old_table NEW TABLE AS new_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_refresh_activities_aggregates();

DROP TRIGGER IF EXISTS activities_aggregate_delete ON activities;
CREATE TRIGGER activities_aggregate_delete
  AFTER DELETE ON activities
  REFERENCING OLD TABLE AS old_table
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_refresh_activities_aggregates();
