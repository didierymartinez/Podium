DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['coaches', 'group_coaches', 'invitations']
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
-- Quien abre un link de invitación aún no es miembro: ubicamos la escuela por el hash del token
-- sin exponer nada más. El resto de la lectura se hace luego con el contexto de esa escuela.
CREATE OR REPLACE FUNCTION invitation_school(token_hash_input text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT school_id FROM invitations WHERE token_hash = token_hash_input $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION invitation_school(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION invitation_school(text) TO podium_app;
