-- Portal de familias (#44): defensa adicional a nivel de base de datos. Si la consulta se hace como
-- familia (app.portal_user_id), solo se ven los hijos, cuentas, pagos y avisos de esa persona.
CREATE OR REPLACE FUNCTION app_portal_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.portal_user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION portal_guardian_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM guardians WHERE school_id = app_school_id() AND user_id = app_portal_user_id() $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION portal_athlete_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT a.id FROM athletes a WHERE a.school_id = app_school_id() AND a.user_id = app_portal_user_id()
    UNION
    SELECT ag.athlete_id FROM athlete_guardians ag JOIN guardians g ON g.id = ag.guardian_id
    WHERE g.school_id = app_school_id() AND g.user_id = app_portal_user_id()
  $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION portal_invoice_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM invoices WHERE school_id = app_school_id() AND guardian_id IN (SELECT portal_guardian_ids()) $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION portal_guardian_ids(), portal_athlete_ids(), portal_invoice_ids() TO podium_app;
--> statement-breakpoint
CREATE POLICY portal_family ON athletes AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON guardians AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR id IN (SELECT portal_guardian_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON athlete_guardians AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON enrollments AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON attendance AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON athlete_documents AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON invoices AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR guardian_id IN (SELECT portal_guardian_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON invoice_lines AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR invoice_id IN (SELECT portal_invoice_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON credit_notes AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR invoice_id IN (SELECT portal_invoice_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON payments AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR guardian_id IN (SELECT portal_guardian_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON payment_allocations AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR invoice_id IN (SELECT portal_invoice_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON payment_intents AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR guardian_id IN (SELECT portal_guardian_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON announcement_recipients AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR user_id = app_portal_user_id() OR guardian_id IN (SELECT portal_guardian_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON notifications AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR user_id = app_portal_user_id());
