-- Planificación (DEP-30 a 35): por escuela; las familias no la ven.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exercises', 'session_plans', 'session_plan_items', 'plan_assignments', 'session_reports']
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
--> statement-breakpoint
-- Biblioteca inicial de ejercicios para las escuelas existentes (DEP-30).
INSERT INTO exercises (school_id, name, component, minutes, materials, space, description)
SELECT s.id, e.name, e.component::exercise_component, e.minutes, e.materials, e.space, e.description
FROM schools s
CROSS JOIN (VALUES
  ('Movilidad articular', 'WARMUP', 8, '', 'Zona seca', 'Tobillos, rodillas, cadera, hombros y cuello, 10 repeticiones por articulación.', ARRAY[]::text[]),
  ('Trote suave con cambios de ritmo', 'WARMUP', 8, '', 'Zona seca', 'Trote continuo; al silbato, 10 s más rápido y volver al ritmo base.', ARRAY[]::text[]),
  ('Skipping y talones', 'WARMUP', 6, 'Conos', 'Zona seca', 'Dos series de 15 m de skipping, talones a glúteo y desplazamiento lateral.', ARRAY[]::text[]),
  ('Patinaje suave de activación', 'WARMUP', 10, '', 'Pista', 'Vueltas a ritmo cómodo, posición relajada, respiración controlada.', ARRAY[]::text[]),
  ('Juego de la lleva en patines', 'GAME', 10, 'Petos', 'Pista o parque', 'Un perseguidor; quien es tocado cambia de rol. Delimitar el área con conos.', ARRAY['Iniciación', 'Formación']::text[]),
  ('Sentadillas isométricas en posición', 'PHYSICAL', 8, 'Cronómetro', 'Zona seca', '3 series de 30–45 s en posición de patinaje, descanso de 30 s.', ARRAY[]::text[]),
  ('Saltos laterales (skater jumps)', 'PHYSICAL', 8, '', 'Zona seca', 'Saltos de un pie al otro con estabilización de 1 s; 3 series de 12.', ARRAY[]::text[]),
  ('Plancha y core', 'PHYSICAL', 8, 'Colchonetas', 'Zona seca', 'Plancha frontal, lateral y puente de glúteo; 3 rondas de 30 s.', ARRAY[]::text[]),
  ('Escalera de coordinación', 'PHYSICAL', 10, 'Escalera de agilidad', 'Zona seca', 'Dentro-fuera, lateral y en zigzag; énfasis en apoyos rápidos.', ARRAY[]::text[]),
  ('Equilibrio en un pie', 'PHYSICAL', 6, '', 'Zona seca', '30 s por pierna con ojos abiertos y luego cerrados; progresar a superficie inestable.', ARRAY[]::text[]),
  ('Fondo aeróbico en zona seca', 'ENDURANCE', 20, '', 'Zona seca', 'Trote continuo a intensidad moderada (puede hablar con frases cortas).', ARRAY['Intermedio', 'Avanzado', 'Competencia']::text[]),
  ('Vuelta a la calma patinando', 'COOLDOWN', 5, '', 'Pista', 'Vueltas muy suaves, posición alta, respiración profunda.', ARRAY[]::text[]),
  ('Estiramientos de tren inferior', 'COOLDOWN', 8, 'Colchonetas', 'Zona seca', 'Cuádriceps, isquiotibiales, aductores, glúteo y gemelos; 30 s cada uno.', ARRAY[]::text[]),
  ('Respiración y cierre del grupo', 'COOLDOWN', 4, '', 'Cualquiera', 'Respiraciones lentas y retroalimentación breve de lo trabajado en la clase.', ARRAY[]::text[])
) AS e(name, component, minutes, materials, space, description, level_names);
--> statement-breakpoint
INSERT INTO exercises (school_id, discipline_id, level_ids, name, component, minutes, materials, space, description)
SELECT d.school_id, d.id,
  coalesce((SELECT array_agg(l.id) FROM levels l WHERE l.discipline_id = d.id AND l.name = ANY (e.level_names)), '{}'::uuid[]),
  e.name, e.component::exercise_component, e.minutes, e.materials, e.space, e.description
FROM disciplines d
CROSS JOIN (VALUES
  ('Posición básica en parado', 'TECHNIQUE', 8, '', 'Pista', 'Rodillas flexionadas, peso al centro, manos adelante; mantener 20 s y relajar.', ARRAY['Iniciación']::text[]),
  ('Marcha de pato', 'TECHNIQUE', 8, '', 'Pista', 'Pasos cortos con puntas hacia afuera para ganar confianza y empuje.', ARRAY['Iniciación']::text[]),
  ('Caída segura y levantarse', 'TECHNIQUE', 8, 'Protecciones', 'Pista', 'Caer hacia adelante sobre rodilleras y muñequeras; levantarse en tres apoyos.', ARRAY['Iniciación']::text[]),
  ('Frenado en T', 'TECHNIQUE', 10, 'Conos', 'Pista', 'Arrastre del patín trasero perpendicular; frenar antes de la línea de conos.', ARRAY['Iniciación', 'Formación']::text[]),
  ('Slalom de conos', 'TECHNIQUE', 10, '10 conos', 'Pista', 'Conos a 1,5 m; pasar en zigzag con ambos pies sin levantar los patines.', ARRAY['Iniciación', 'Formación']::text[]),
  ('Deslizamiento en un pie', 'TECHNIQUE', 10, 'Conos', 'Pista', 'Impulso y deslizar el mayor tiempo posible en un patín; alternar piernas.', ARRAY['Iniciación', 'Formación']::text[]),
  ('Empuje lateral completo', 'TECHNIQUE', 12, '', 'Pista', 'Extensión total de la pierna hacia el lado y recogida bajo la cadera.', ARRAY['Formación', 'Intermedio']::text[]),
  ('Cruce en curva con conos', 'TECHNIQUE', 15, '8 conos', 'Pista', 'Curva marcada con conos; cruces continuos sin perder la posición baja.', ARRAY['Formación', 'Intermedio']::text[]),
  ('Patinaje hacia atrás', 'TECHNIQUE', 10, '', 'Pista', 'Medias lunas hacia atrás mirando por encima del hombro.', ARRAY['Formación']::text[]),
  ('Recta en posición aerodinámica', 'TECHNIQUE', 12, '', 'Pista', 'Rectas con espalda horizontal y manos atrás; corregir altura de cadera.', ARRAY['Intermedio', 'Avanzado']::text[]),
  ('Salida desde parado', 'SPEED', 12, 'Silbato', 'Pista', 'Posición de salida, primeros 4 pasos de carrera y transición al empuje.', ARRAY['Intermedio', 'Avanzado', 'Competencia']::text[]),
  ('Sprints de 50 m', 'SPEED', 15, 'Cronómetro, conos', 'Pista', '6–8 sprints al máximo con recuperación completa (2 min).', ARRAY['Intermedio', 'Avanzado', 'Competencia']::text[]),
  ('Doble empuje', 'TECHNIQUE', 15, '', 'Pista', 'Empuje hacia adentro y hacia afuera en cada zancada; progresar de lento a rápido.', ARRAY['Avanzado', 'Competencia']::text[]),
  ('Curva a velocidad', 'SPEED', 15, 'Conos', 'Pista', 'Entrada lanzada a la curva, cruces rápidos y salida explosiva.', ARRAY['Intermedio', 'Avanzado', 'Competencia']::text[]),
  ('Series de 400 m', 'ENDURANCE', 20, 'Cronómetro', 'Pista', '4–6 repeticiones a ritmo de 1.000 m con recuperación de 2 min.', ARRAY['Avanzado', 'Competencia']::text[]),
  ('Fondo continuo en pista', 'ENDURANCE', 25, '', 'Pista o ruta', 'Patinaje continuo a intensidad moderada; controlar postura con la fatiga.', ARRAY['Intermedio', 'Avanzado', 'Competencia']::text[]),
  ('Relevos en grupo', 'TACTICS', 15, '', 'Pista', 'Tren de 4–6 patinadores; el primero sale por fuera y se ubica al final.', ARRAY['Intermedio', 'Avanzado']::text[]),
  ('Ataque y respuesta', 'TACTICS', 15, 'Silbato', 'Pista', 'En grupo, al silbato un patinador ataca y el resto debe cerrar el hueco.', ARRAY['Avanzado', 'Competencia']::text[]),
  ('Lectura de carrera: posición en el pelotón', 'TACTICS', 15, '', 'Pista', 'Simulación de carrera por puntos; ubicarse y elegir cuándo adelantar.', ARRAY['Avanzado', 'Competencia']::text[]),
  ('Simulación de 1.000 m', 'SPEED', 15, 'Cronómetro', 'Pista', 'Prueba controlada a ritmo de competencia con parciales por vuelta.', ARRAY['Competencia']::text[]),
  ('Carrera de eliminación', 'GAME', 12, 'Silbato', 'Pista', 'Cada vuelta sale el último; trabaja velocidad y ubicación.', ARRAY['Formación', 'Intermedio', 'Avanzado']::text[]),
  ('Relevos por equipos', 'GAME', 12, 'Testigos, conos', 'Pista', 'Equipos de 3–4 con entrega de testigo; mezcla de niveles.', ARRAY[]::text[]),
  ('Saltos de obstáculos bajos', 'TECHNIQUE', 10, 'Vallas bajas', 'Pista', 'Saltar vallas de 10–15 cm con ambos pies y aterrizar estable.', ARRAY['Formación', 'Intermedio']::text[]),
  ('Cambios de dirección', 'TECHNIQUE', 10, 'Conos', 'Pista', 'Recorrido en 8 y giros de 180°; mirar hacia donde se va.', ARRAY['Iniciación', 'Formación']::text[]),
  ('Técnica de llegada (lanzamiento de patín)', 'TECHNIQUE', 10, 'Línea de meta', 'Pista', 'Adelantar el patín en la línea de meta manteniendo el equilibrio.', ARRAY['Avanzado', 'Competencia']::text[]),
  ('Fuerza en cuestas', 'PHYSICAL', 15, '', 'Ruta con pendiente', 'Subidas cortas de 20–30 s con empuje completo, bajar recuperando.', ARRAY['Avanzado', 'Competencia']::text[])
) AS e(name, component, minutes, materials, space, description, level_names)
WHERE d.code = 'speed';
