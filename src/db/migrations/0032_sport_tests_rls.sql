-- Pruebas por escuela (DEP-02): aislamiento por school_id.
ALTER TABLE sport_tests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sport_tests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON sport_tests
  USING (school_id = app_school_id()) WITH CHECK (school_id = app_school_id());
--> statement-breakpoint

-- Plantilla para las escuelas existentes: físicas comunes y las de velocidad si tienen esa modalidad.
INSERT INTO sport_tests (school_id, discipline_id, name, kind, unit, lower_is_better, context, position)
SELECT s.id, NULL, t.name, t.kind, t.unit, t.lower_is_better, t.context, t.position
FROM schools s CROSS JOIN (VALUES
  ('30 m lanzados', 'TIME'::test_kind, 's', true, 'FIELD'::test_context, 1),
  ('Salto horizontal', 'DISTANCE'::test_kind, 'cm', false, 'FIELD'::test_context, 2),
  ('Salto vertical', 'DISTANCE'::test_kind, 'cm', false, 'FIELD'::test_context, 3),
  ('Flexibilidad (sit and reach)', 'DISTANCE'::test_kind, 'cm', false, 'FIELD'::test_context, 4),
  ('Test de Cooper', 'DISTANCE'::test_kind, 'm', false, 'FIELD'::test_context, 5),
  ('Abdominales en 1 min', 'REPS'::test_kind, 'reps', false, 'FIELD'::test_context, 6)
) AS t(name, kind, unit, lower_is_better, context, position);
--> statement-breakpoint
INSERT INTO sport_tests (school_id, discipline_id, name, kind, unit, lower_is_better, context, position)
SELECT d.school_id, d.id, t.name, t.kind, t.unit, t.lower_is_better, t.context, t.position
FROM disciplines d CROSS JOIN (VALUES
  ('200 m contrarreloj', 'TIME'::test_kind, 's', true, 'TRACK'::test_context, 1),
  ('500 m sprint', 'TIME'::test_kind, 's', true, 'TRACK'::test_context, 2),
  ('1.000 m', 'TIME'::test_kind, 's', true, 'TRACK'::test_context, 3),
  ('10.000 m puntos', 'POINTS'::test_kind, 'pts', false, 'TRACK'::test_context, 4),
  ('10.000 m eliminación', 'POSITION'::test_kind, 'puesto', true, 'TRACK'::test_context, 5),
  ('15.000 m eliminación', 'POSITION'::test_kind, 'puesto', true, 'TRACK'::test_context, 6),
  ('100 m ruta', 'TIME'::test_kind, 's', true, 'ROAD'::test_context, 7),
  ('200 m ruta', 'TIME'::test_kind, 's', true, 'ROAD'::test_context, 8),
  ('Una vuelta', 'TIME'::test_kind, 's', true, 'ROAD'::test_context, 9),
  ('5.000 m ruta', 'TIME'::test_kind, 's', true, 'ROAD'::test_context, 10),
  ('Media maratón', 'TIME'::test_kind, 's', true, 'ROAD'::test_context, 11),
  ('Maratón', 'TIME'::test_kind, 's', true, 'ROAD'::test_context, 12)
) AS t(name, kind, unit, lower_is_better, context, position)
WHERE d.code = 'speed';
