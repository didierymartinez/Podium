-- Evaluaciones (DEP-40 a 44): por escuela; las familias ven las de sus hijos.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['level_criteria', 'evaluations', 'evaluation_scores', 'athlete_levels']
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
CREATE POLICY portal_family ON evaluations AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON athlete_levels AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR athlete_id IN (SELECT portal_athlete_ids()));
--> statement-breakpoint
CREATE POLICY portal_family ON evaluation_scores AS RESTRICTIVE
  USING (app_portal_user_id() IS NULL OR evaluation_id IN (
    SELECT id FROM evaluations WHERE athlete_id IN (SELECT portal_athlete_ids())));
--> statement-breakpoint

-- Rúbricas de la plantilla para los niveles existentes.
INSERT INTO level_criteria (school_id, level_id, name, position)
SELECT l.school_id, l.id, c.name, c.position
FROM levels l
JOIN disciplines d ON d.id = l.discipline_id AND d.code = 'speed'
JOIN (VALUES
  ('Iniciación', 'Posición básica', 1),
  ('Iniciación', 'Desplazamiento hacia adelante', 2),
  ('Iniciación', 'Frenado en "T"', 3),
  ('Iniciación', 'Caída segura y levantarse', 4),
  ('Formación', 'Empuje lateral completo', 1),
  ('Formación', 'Cruce en curva (ambos lados)', 2),
  ('Formación', 'Frenado en "T" a velocidad', 3),
  ('Formación', 'Desplazamiento hacia atrás', 4),
  ('Intermedio', 'Salida', 1),
  ('Intermedio', 'Posición aerodinámica sostenida', 2),
  ('Intermedio', 'Curva a velocidad', 3),
  ('Intermedio', 'Relevos en grupo', 4),
  ('Avanzado', 'Doble empuje', 1),
  ('Avanzado', 'Sprints', 2),
  ('Avanzado', 'Lectura de carrera', 3),
  ('Avanzado', '1.000 m bajo el tiempo objetivo', 4),
  ('Competencia', 'Marcas mínimas de su categoría', 1),
  ('Competencia', 'Participación en el calendario de liga', 2)
) AS c(level_name, name, position) ON c.level_name = l.name;
--> statement-breakpoint
INSERT INTO level_criteria (school_id, level_id, name, position)
SELECT l.school_id, l.id, c.name, c.position
FROM levels l
JOIN disciplines d ON d.id = l.discipline_id AND d.code <> 'speed'
CROSS JOIN (VALUES
  ('Técnica básica de la modalidad', 1),
  ('Control y equilibrio', 2),
  ('Actitud y disciplina', 3)
) AS c(name, position);
