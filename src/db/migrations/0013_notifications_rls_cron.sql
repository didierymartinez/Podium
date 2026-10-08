ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON notifications
  USING (school_id = app_school_id())
  WITH CHECK (school_id = app_school_id());
--> statement-breakpoint
-- Las tareas programadas recorren las escuelas vigentes; luego trabajan dentro del contexto de cada una.
CREATE OR REPLACE FUNCTION cron_schools() RETURNS TABLE (id uuid, slug text, timezone text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id, slug, timezone FROM schools WHERE status <> 'CANCELED' ORDER BY created_at $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cron_schools() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cron_schools() TO podium_app;
