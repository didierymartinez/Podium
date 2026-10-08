-- Transferencias reportadas (ADM-34): por escuela y, para familias, solo las suyas.
ALTER TABLE payment_reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_reports FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON payment_reports
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
CREATE POLICY portal_family ON payment_reports AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR guardian_id IN (SELECT portal_guardian_ids()));
