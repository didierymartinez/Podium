-- Lesiones (DEP-72): aislamiento por escuela y, para familias, solo las de sus hijos.
ALTER TABLE injuries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE injuries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON injuries
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
CREATE POLICY portal_family ON injuries AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON session_athletes AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
