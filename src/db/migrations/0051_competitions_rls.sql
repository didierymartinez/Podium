-- Competencias (DEP-60 a 68): por escuela; las familias solo ven las convocatorias de sus hijos.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['competitions', 'competition_entries', 'competition_results']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id())',
      t
    );
  END LOOP;
END
$$;
--> statement-breakpoint
CREATE POLICY portal_family ON competition_entries AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON competitions AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR id IN (
    SELECT competition_id FROM competition_entries WHERE athlete_id IN (SELECT portal_athlete_ids())));
--> statement-breakpoint
CREATE POLICY portal_family ON competition_results AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR entry_id IN (
    SELECT id FROM competition_entries WHERE athlete_id IN (SELECT portal_athlete_ids())));
