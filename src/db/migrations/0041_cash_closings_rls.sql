-- Cierre de caja (ADM-50): solo administración.
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cash_closings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON cash_closings
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
CREATE POLICY portal_family ON cash_closings AS RESTRICTIVE USING (app_portal_user_id() IS NULL);
