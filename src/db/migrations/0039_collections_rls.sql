-- Gestión de cobro (ADM-44/45): solo administración; las familias no la ven.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['collection_notes', 'payment_plans', 'payment_plan_installments']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id())',
      t
    );
    EXECUTE format('CREATE POLICY portal_family ON %I AS RESTRICTIVE USING (app_portal_user_id() IS NULL)', t);
  END LOOP;
END
$$;
