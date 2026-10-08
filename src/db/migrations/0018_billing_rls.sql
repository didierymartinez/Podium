DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['charge_concepts', 'invoices', 'invoice_lines', 'credit_notes', 'payments',
                           'payment_allocations', 'payment_accounts', 'payment_intents']
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
--> statement-breakpoint
ALTER TABLE invoices ADD CONSTRAINT invoices_amounts CHECK (total >= 0 AND credited >= 0 AND paid >= 0 AND credited + paid <= total);
--> statement-breakpoint
ALTER TABLE invoice_lines ADD CONSTRAINT invoice_lines_amounts CHECK (amount >= 0 AND base_amount >= 0 AND sibling_discount >= 0);
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_amount CHECK (amount > 0);
--> statement-breakpoint
ALTER TABLE payment_allocations ADD CONSTRAINT payment_allocations_amount CHECK (amount > 0);
--> statement-breakpoint
ALTER TABLE credit_notes ADD CONSTRAINT credit_notes_amount CHECK (amount > 0);
--> statement-breakpoint
-- Los webhooks de la pasarela llegan sin sesión: ubican la escuela por su URL y luego trabajan con su contexto.
CREATE OR REPLACE FUNCTION school_id_by_slug(slug_input text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM schools WHERE slug = slug_input $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION school_id_by_slug(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION school_id_by_slug(text) TO podium_app;
--> statement-breakpoint
INSERT INTO charge_concepts (school_id, name, default_amount)
SELECT s.id, c.name, NULL FROM schools s
CROSS JOIN (VALUES ('Uniforme'), ('Inscripción a competencia'), ('Evento o salida')) AS c(name)
ON CONFLICT DO NOTHING;
