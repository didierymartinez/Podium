-- Insignias (§10): por escuela; las familias ven las de sus hijos.
ALTER TABLE athlete_badges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE athlete_badges FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON athlete_badges
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
CREATE POLICY portal_family ON athlete_badges AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
