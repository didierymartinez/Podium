-- Marcas (DEP-50): por escuela; las familias ven las de sus hijos. Objetivos: por escuela.
ALTER TABLE performances ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE performances FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON performances
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
CREATE POLICY portal_family ON performances AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
ALTER TABLE performance_targets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE performance_targets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON performance_targets
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
