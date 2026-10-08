-- Cobros de Podium a la escuela (#21): cada escuela ve solo los suyos.
ALTER TABLE platform_invoices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_invoices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON platform_invoices
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint

-- El webhook de Wompi de Podium llega sin escuela: la referencia dice a cuál pertenece.
CREATE OR REPLACE FUNCTION platform_invoice_school(ref text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT school_id FROM platform_invoices WHERE reference = ref $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_invoice_school(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_invoice_school(text) TO podium_app;
--> statement-breakpoint

-- El cron necesita el estado para decidir qué tareas corren (solo lectura no genera cobros).
DROP FUNCTION IF EXISTS cron_schools();
--> statement-breakpoint
CREATE FUNCTION cron_schools() RETURNS TABLE (id uuid, slug text, timezone text, status school_status)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id, slug, timezone, status FROM schools WHERE status <> 'CANCELED' ORDER BY created_at $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cron_schools() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cron_schools() TO podium_app;
