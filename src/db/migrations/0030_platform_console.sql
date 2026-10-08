-- Consola de Podium (#17): lectura entre escuelas sin desactivar RLS. Solo responde si el usuario
-- de la transacción (app.user_id) es super admin; las acciones corren con runInTenant de cada escuela.
CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT EXISTS (SELECT 1 FROM users WHERE id = app_user_id() AND is_platform_admin) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_is_platform_admin() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_is_platform_admin() TO podium_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION platform_schools() RETURNS TABLE (
  id uuid, slug text, name text, city text, status school_status, created_at timestamptz,
  trial_ends_at timestamptz, suspended_at timestamptz, comms_enabled_at timestamptz,
  owner_name text, owner_email text,
  plan_code text, subscription_status subscription_status, billing_interval billing_interval,
  discount_percent integer, discount_until date, current_period_end timestamptz, canceled_at timestamptz,
  active_athletes integer, groups integer, fee_plans integer, coaches integer,
  paid_invoices integer, last_activity timestamptz
)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT s.id, s.slug, s.name, s.city, s.status, s.created_at, s.trial_ends_at, s.suspended_at,
      s.comms_enabled_at, u.name, u.email,
      sub.plan_code, sub.status, sub.interval, sub.discount_percent, sub.discount_until,
      sub.current_period_end, sub.canceled_at,
      (SELECT count(DISTINCT e.athlete_id)::int FROM enrollments e WHERE e.school_id = s.id AND e.status = 'ACTIVE'),
      (SELECT count(*)::int FROM groups g WHERE g.school_id = s.id AND g.active),
      (SELECT count(*)::int FROM fee_plans f WHERE f.school_id = s.id),
      (SELECT count(*)::int FROM coaches c WHERE c.school_id = s.id),
      (SELECT count(*)::int FROM platform_invoices p WHERE p.school_id = s.id AND p.status = 'PAID'),
      (SELECT max(a.created_at) FROM audit_logs a WHERE a.school_id = s.id)
    FROM schools s
    JOIN users u ON u.id = s.owner_user_id
    LEFT JOIN subscriptions sub ON sub.school_id = s.id
    WHERE app_is_platform_admin()
    ORDER BY s.created_at DESC
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_schools() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_schools() TO podium_app;
--> statement-breakpoint

-- Registros de usuarios y escuelas por día (embudo).
CREATE OR REPLACE FUNCTION platform_signups(since date) RETURNS TABLE (day date, users integer, schools integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT d::date,
      (SELECT count(*)::int FROM users u WHERE (u.created_at AT TIME ZONE 'America/Bogota')::date = d::date),
      (SELECT count(*)::int FROM schools s WHERE (s.created_at AT TIME ZONE 'America/Bogota')::date = d::date)
    FROM generate_series(since, (now() AT TIME ZONE 'America/Bogota')::date, interval '1 day') d
    WHERE app_is_platform_admin()
    ORDER BY 1
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_signups(date) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_signups(date) TO podium_app;
