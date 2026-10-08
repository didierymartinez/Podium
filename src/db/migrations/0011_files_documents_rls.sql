DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['files', 'document_types', 'athlete_documents', 'coach_certifications']
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
ALTER TABLE athlete_documents ADD CONSTRAINT athlete_documents_dates CHECK (expires_on IS NULL OR expires_on >= issued_on);
--> statement-breakpoint
ALTER TABLE document_types ADD CONSTRAINT document_types_validity CHECK (validity_months IS NULL OR validity_months BETWEEN 1 AND 120);
--> statement-breakpoint
-- Documentos sugeridos para las escuelas existentes (las nuevas los reciben al crearse).
INSERT INTO document_types (school_id, name, required, validity_months, position)
SELECT s.id, d.name, d.required, d.validity, d.position
FROM schools s
CROSS JOIN (VALUES
  ('Certificado médico', true, 12::smallint, 0::smallint),
  ('Consentimiento informado', true, NULL::smallint, 1::smallint),
  ('Copia del documento de identidad', false, NULL::smallint, 2::smallint)
) AS d(name, required, validity, position)
ON CONFLICT DO NOTHING;
