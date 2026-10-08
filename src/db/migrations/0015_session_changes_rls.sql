ALTER TABLE session_athletes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE session_athletes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON session_athletes
  USING (school_id = app_school_id())
  WITH CHECK (school_id = app_school_id());
