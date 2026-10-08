-- Aislamiento entre escuelas con Row Level Security.
-- La app se conecta con el rol `podium_app` (sin BYPASSRLS) y fija por transacción
-- `app.school_id` y `app.user_id` (ver src/db/tenant.ts).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'podium_app') THEN
    CREATE ROLE podium_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO podium_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO podium_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO podium_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO podium_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO podium_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_school_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.school_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

-- Disponibilidad de slug sin exponer las demás escuelas a la app.
CREATE OR REPLACE FUNCTION slug_available(candidate text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT NOT EXISTS (SELECT 1 FROM schools WHERE slug = candidate) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION slug_available(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION slug_available(text) TO podium_app;
--> statement-breakpoint

-- Membresías: visibles desde la escuela activa o para el propio usuario.
ALTER TABLE school_memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE school_memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON school_memberships
  USING (school_id = app_school_id() OR user_id = app_user_id())
  WITH CHECK (school_id = app_school_id());
--> statement-breakpoint

-- Escuelas: la activa, o aquellas donde el usuario tiene membresía.
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE schools FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON schools
  USING (
    id = app_school_id()
    OR id IN (SELECT school_id FROM school_memberships WHERE user_id = app_user_id())
  )
  WITH CHECK (id = app_school_id());
--> statement-breakpoint

-- Auditoría: eventos de plataforma (school_id nulo) solo se escriben.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs
  USING (school_id = app_school_id())
  WITH CHECK (school_id IS NULL OR school_id = app_school_id());
--> statement-breakpoint

-- Tablas de negocio: aislamiento estricto por school_id.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['venues', 'disciplines', 'levels', 'age_categories', 'subscriptions']
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
