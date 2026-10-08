-- Rutinas y entrenos (#73): por escuela; las familias ven y registran los de sus hijos.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['routines', 'routine_days', 'routine_exercises', 'workout_logs', 'workout_sets']
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
CREATE POLICY portal_family ON routines AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON routine_days AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR routine_id IN (
    SELECT id FROM routines WHERE athlete_id IN (SELECT portal_athlete_ids())));
--> statement-breakpoint
CREATE POLICY portal_family ON routine_exercises AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR day_id IN (
    SELECT d.id FROM routine_days d JOIN routines r ON r.id = d.routine_id
    WHERE r.athlete_id IN (SELECT portal_athlete_ids())));
--> statement-breakpoint
CREATE POLICY portal_family ON workout_logs AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON workout_sets AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
