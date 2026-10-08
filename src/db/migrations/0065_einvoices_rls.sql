-- Facturación electrónica (ADM-26): por escuela; las familias no ven la conexión ni el registro.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['einvoice_accounts', 'einvoices']
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
