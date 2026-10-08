-- Periodización (DEP-33): por escuela; las familias no la ven.
ALTER TABLE training_periods ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE training_periods FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON training_periods
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
CREATE POLICY portal_family ON training_periods AS RESTRICTIVE USING (app_portal_user_id() IS NULL);
