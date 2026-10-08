-- Valoración inicial y composición corporal: por escuela; las familias ven las de sus hijos.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['initial_assessments', 'body_consents', 'body_measurements']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id())',
      t
    );
    EXECUTE format(
      'CREATE POLICY portal_family ON %I AS RESTRICTIVE USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()))',
      t
    );
  END LOOP;
END
$$;
