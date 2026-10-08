-- Egresos e inventario (ADM-52, ADM-53): por escuela; las familias no los ven.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['expenses', 'products', 'stock_movements']
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
