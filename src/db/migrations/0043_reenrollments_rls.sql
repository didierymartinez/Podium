-- Re-matrícula (ADM-18): por escuela; las familias ven y confirman solo lo de sus hijos.
ALTER TABLE reenrollment_campaigns ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reenrollment_campaigns FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON reenrollment_campaigns
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
ALTER TABLE reenrollments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reenrollments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON reenrollments
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
CREATE POLICY portal_family ON reenrollments AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
