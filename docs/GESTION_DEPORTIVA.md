# Especificación — Gestión deportiva

> Alcance: estructura deportiva, grupos y sesiones, asistencia, planificación de entrenamientos, evaluaciones, marcas y rendimiento, competencias, seguimiento del deportista y reportes deportivos.
> Prioridad: **MVP** (Fase 1), **F2** (Fase 2 — fase deportiva), **F3** (Fase 3). Complementa [`PLAN.md`](PLAN.md) y [`GESTION_ADMINISTRATIVA.md`](GESTION_ADMINISTRATIVA.md).

---

## 1. Permisos por rol (deportivo)

| Acción | Propietario/Admin | Coordinador | Profesor | Acudiente | Alumno |
|---|:-:|:-:|:-:|:-:|:-:|
| Configurar estructura deportiva (niveles, categorías, pruebas) | ✅ | ⚙️ | ❌ | ❌ | ❌ |
| Crear grupos y horarios | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancelar / reprogramar sesiones | ✅ | ✅ | ✅ sus grupos | ❌ | ❌ |
| Tomar asistencia | ✅ | ✅ | ✅ sus grupos | ❌ | ❌ |
| Biblioteca de ejercicios y planes | ✅ | ✅ | ✅ (crea y comparte) | ❌ | ❌ |
| Evaluar y promover de nivel | ✅ | ✅ | ✅ propone · ⚙️ aprueba | 👁️ | 👁️ |
| Registrar marcas y resultados | ✅ | ✅ | ✅ | ❌ | ⚙️ registra sus marcas de entreno (validadas por profesor) |
| Crear competencias y convocar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Aceptar convocatoria / autorizar | — | — | — | ✅ | ✅ si es adulto |
| Ver progreso | ✅ todos | ✅ todos | ✅ sus grupos | 👁️ sus hijos | 👁️ propio |

---

## 2. Estructura deportiva

Modelo configurable (sirve para cualquier deporte; patinaje viene como **plantilla**):

```
Deporte (Patinaje)
 ├─ Modalidad (Velocidad, Artístico, Hockey, Freestyle)
 │    ├─ Niveles (ordenados) ─ cada uno con criterios de evaluación
 │    └─ Pruebas / métricas (nombre, unidad, "menor es mejor", tipo)
 └─ Esquema de categorías por edad (fecha de corte configurable)
```

### 2.1 Niveles (plantilla patinaje velocidad — editable)
| Orden | Nivel | Objetivo | Criterios ejemplo (rúbrica 1–5) |
|---|---|---|---|
| 1 | **Iniciación** | Dominio básico del patín | Posición básica, desplazamiento hacia adelante, frenado en "T", caída segura y levantarse |
| 2 | **Formación** | Técnica fundamental | Empuje lateral completo, cruce en curva (ambos lados), frenado en "T" a velocidad, desplazamiento atrás |
| 3 | **Intermedio** | Técnica aplicada a velocidad | Salida, posición aerodinámica sostenida, curva a velocidad, relevos en grupo |
| 4 | **Avanzado** | Táctica y resistencia | Doble empuje, sprints, lectura de carrera, prueba de 1.000 m bajo tiempo objetivo |
| 5 | **Competencia** | Rendimiento federado | Marcas mínimas por categoría, participación en calendario de liga |

### 2.2 Categorías por edad
- **Edad deportiva** = año de la temporada − año de nacimiento (regla común de federaciones); configurable a "edad cumplida a una fecha de corte".
- La categoría se **calcula sola** al cambiar de año; se avisa al admin de los alumnos que cambian de categoría.
- Rangos y nombres **editables**; la plantilla trae un esquema de ejemplo que cada escuela ajusta al **reglamento vigente de su liga / Fedepatín**.

| Ejemplo de esquema | Edades (ilustrativo) |
|---|---|
| Mini / Pre-infantil | ≤ 9 |
| Infantil | 10–11 |
| Pre-juvenil | 12–13 |
| Juvenil | 14–15 |
| Junior | 16–18 |
| Mayores | 19+ |
| Máster | 30+ (por rangos) |

### 2.3 Pruebas / métricas
| Campo | Ejemplo |
|---|---|
| Nombre | 500 m sprint |
| Modalidad | Velocidad |
| Tipo | Tiempo · distancia · puntos · repeticiones · puntaje de jueces · posición |
| Unidad y precisión | segundos con milésimas (`45,321`) |
| Mejor = | menor / mayor |
| Contexto | pista · ruta · campo/gimnasio |

**Plantilla patinaje velocidad (editable):**
- **Pista:** 200 m contrarreloj, 500 m sprint, 1.000 m, 10.000 m puntos, 10.000 m eliminación, 15.000 m eliminación.
- **Ruta:** 100 m, 200 m, una vuelta, 10.000 m puntos, 5.000 m, media maratón, maratón.
- **Físicas:** 30 m lanzados, salto horizontal, salto vertical, flexibilidad (sit and reach), test de Cooper, abdominales en 1 min.
- **Artístico (F2):** puntaje técnico y artístico por elemento/rutina.

| ID | Requisito | Prioridad |
|---|---|---|
| DEP-01 | Plantilla de patinaje precargada al crear la escuela (modalidades, niveles, categorías, pruebas) | MVP |
| DEP-02 | Editar/crear niveles, categorías y pruebas | MVP (niveles, categorías) · F2 (pruebas) |
| DEP-03 | Cálculo automático de edad deportiva y categoría; aviso de cambio de categoría al iniciar año | MVP |

---

## 3. Grupos y sesiones

| ID | Requisito | Prioridad |
|---|---|---|
| DEP-10 | **Grupo**: nombre, modalidad, nivel(es), categorías sugeridas, profesor titular y auxiliares, cupo, tarifa sugerida, estado | MVP |
| DEP-11 | **Horario recurrente**: días y horas (p. ej. Lun-Mié-Vie 4:00–6:00 p. m.), vigencia desde/hasta | MVP |
| DEP-12 | Generación automática de **sesiones** para las próximas 8 semanas desde el horario de cada grupo, **incluyendo fines de semana y festivos** (los festivos son solo referencia en el tablero) y omitiendo únicamente los **días sin clase** que configure la escuela. Idempotente: al cambiar el horario se ajustan las clases futuras sin asistencia; el pasado y lo registrado no se tocan | MVP |
| DEP-13 | **Cancelar** sesión (lluvia, pista ocupada, evento) con motivo → aviso a acudientes; **reprogramar** a otra fecha/hora | MVP |
| DEP-14 | Sesión **extra** (entreno adicional, preparación de competencia) con alumnos seleccionados | MVP |
| DEP-15 | **Profesor sustituto** para una sesión | MVP |
| DEP-16 | Calendario por escuela, por profesor y por alumno (vista semana/mes) | MVP |
| DEP-17 | Conflictos: advertir si un profesor queda con dos sesiones a la misma hora | MVP |

---

## 4. Asistencia

### 4.1 Toma de asistencia (móvil del profesor)
1. Abre la app → **"Mis clases de hoy"** → toca la sesión.
2. Lista de alumnos con foto; por defecto todos **sin marcar**. Botón "Todos presentes" y luego se corrigen excepciones.
3. Estados: **Presente · Tarde · Ausente · Excusa** (con motivo opcional: enfermedad, colegio, viaje, lesión).
4. Indicadores junto al nombre: 🟥 en mora (si la escuela lo permite), 🩹 restricción médica, 📄 documento vencido, 🆕 clase de prueba, 🎂 cumpleaños.
5. Guardar → funciona **sin conexión**; se sincroniza al recuperar señal (marca "pendiente de sincronizar").

### 4.2 Reglas
| ID | Requisito | Prioridad |
|---|---|---|
| DEP-20 | Toma de asistencia por sesión con los 4 estados | MVP |
| DEP-21 | **Offline** con sincronización y resolución de conflictos (gana el último registro; queda auditoría) | MVP |
| DEP-22 | Editable hasta 48 h después de la sesión por el profesor; después solo admin | MVP |
| DEP-23 | El acudiente puede **reportar excusa** antes de la clase desde la app → aparece pre-marcada | F2 |
| DEP-24 | **Clase de reposición**: alumno asiste a otra sesión/grupo; cuenta para su asistencia | F2 |
| DEP-25 | **Check-in QR** (alumno muestra su QR o escanea el de la sesión) | F3 |
| DEP-26 | Alerta de deserción: **3 ausencias seguidas** o asistencia < 50 % en el mes → aviso a coordinación (umbral configurable) | MVP |
| DEP-27 | Recordatorio al profesor si una sesión terminó sin asistencia registrada | MVP |

### 4.3 Cálculo
- **% asistencia** = (presente + tarde) ÷ (sesiones programadas no canceladas − excusas). Las excusas no penalizan.
- Se calcula por alumno, grupo, profesor y periodo.

---

## 5. Planificación de entrenamientos (F2)

### 5.1 Biblioteca de ejercicios
| Campo | Ejemplo |
|---|---|
| Nombre | Cruce en curva con conos |
| Modalidad / nivel(es) | Velocidad · Formación, Intermedio |
| Componente | Técnica · Físico · Velocidad · Resistencia · Táctica · Juego · Calentamiento · Vuelta a la calma |
| Descripción y variantes | Texto + pasos |
| Multimedia | Foto, video corto o link de YouTube |
| Duración sugerida, materiales, espacio | 15 min · 8 conos · pista |
| Visibilidad | Personal del profesor / compartido con la escuela |

Plantilla inicial con ~40 ejercicios básicos de patinaje.

### 5.2 Planes
| Nivel de planificación | Contenido |
|---|---|
| **Macrociclo** (temporada) | Competencias objetivo, periodos: preparación general → específica → competitiva → transición |
| **Mesociclo** (3–6 semanas) | Objetivo principal (p. ej. "técnica de curva y resistencia aeróbica") |
| **Microciclo** (semana) | Distribución de cargas por día |
| **Plan de sesión** | Calentamiento → parte principal → vuelta a la calma, con ejercicios de la biblioteca, duración y objetivo |

| ID | Requisito | Prioridad |
|---|---|---|
| DEP-30 | Biblioteca de ejercicios con filtros y búsqueda | F2 |
| DEP-31 | Crear plan de sesión desde la biblioteca; **asignarlo** a una o varias sesiones futuras | F2 |
| DEP-32 | Plantillas de sesión reutilizables y duplicables | F2 |
| DEP-33 | Macro/mesociclo por grupo con línea de tiempo y competencias objetivo | F3 |
| DEP-34 | El profesor ve el plan del día al abrir la sesión (junto a la asistencia) | F2 |
| DEP-35 | **Registro post-sesión**: ¿se cumplió el plan? (sí/parcial/no), notas, **RPE** del grupo (esfuerzo 0–10) | F2 |
| DEP-36 | **Carga de entrenamiento** = RPE × minutos (sRPE), por semana y por alumno; alerta de aumentos bruscos (> 30 % semana a semana) | F3 |

---

## 6. Evaluaciones técnicas y promoción de nivel (F2)

### Flujo
1. El coordinador abre una **ventana de evaluación** (p. ej. cada trimestre) o el profesor evalúa individualmente.
2. El profesor califica a cada alumno según la **rúbrica del nivel** (criterios 1–5 + comentario, foto/video opcional).
3. Si cumple el mínimo (p. ej. todos los criterios ≥ 3 y promedio ≥ 3,5, configurable) → **propuesta de promoción**.
4. Admin/coordinador **aprueba** (o la promoción es automática, según configuración) → cambia el nivel, se sugiere el **traslado de grupo** (y cambio de tarifa si aplica, desde el siguiente mes).
5. Acudiente recibe notificación y **certificado de nivel** en PDF; el alumno gana una insignia.

| ID | Requisito | Prioridad |
|---|---|---|
| DEP-40 | Rúbricas por nivel con criterios configurables | F2 |
| DEP-41 | Evaluación individual y por grupo (planilla rápida en móvil) | F2 |
| DEP-42 | Propuesta, aprobación y registro de promoción con historial de niveles | F2 |
| DEP-43 | Informe de evaluación para el acudiente (fortalezas, a mejorar, comentario del profesor) | F2 |
| DEP-44 | Certificado de nivel en PDF | F2 |

---

## 7. Marcas y rendimiento (F2)

### 7.1 Registro de marcas
- Por alumno o **en lote** para un grupo (ej.: "test de 200 m de hoy" → lista con campo de tiempo por alumno).
- Campos: prueba, valor, fecha, contexto (**entreno / control / competencia**), tipo de cronometraje (manual / electrónico), condiciones (pista, ruta, clima), observación.
- **Cronómetro integrado** (F2): el profesor inicia el reloj y toca el nombre de cada alumno al pasar la meta (o por vuelta) → los tiempos se registran solos.
- Las marcas registradas por el alumno quedan **pendientes de validación** del profesor.

### 7.2 Indicadores
| Indicador | Descripción |
|---|---|
| **Mejor marca personal (PB)** | Por prueba; separada para manual y electrónico; resaltada al superarse 🎉 |
| Progresión | Gráfica de marcas en el tiempo con línea de tendencia |
| Comparativo | vs. promedio y mejor de su categoría **dentro de la escuela** |
| Marca mínima | Objetivos por categoría (configurables) y % para alcanzarlos |
| Ranking interno | Por prueba y categoría (visible para profesores; para alumnos solo si la escuela lo activa) |

| ID | Requisito | Prioridad |
|---|---|---|
| DEP-50 | Registro individual y en lote de marcas | F2 |
| DEP-51 | PB automáticas y notificación al superarlas | F2 |
| DEP-52 | Gráficas de progresión y comparativos | F2 |
| DEP-53 | Cronómetro multi-alumno en la app | F2 |
| DEP-54 | Marcas mínimas/objetivo por categoría | F2 |
| DEP-55 | Pruebas físicas periódicas (batería de tests) con informe | F2 |
| DEP-56 | Medidas antropométricas opcionales (peso, talla, envergadura) con permiso del acudiente | F3 |

---

## 8. Competencias y participaciones (F2)

### 8.1 Evento
| Campo | Ejemplo |
|---|---|
| Nombre, tipo | Válida departamental · liga / federación / interclubes / festival / interno |
| Fechas, ciudad, escenario | 14–16 nov · Cali · Patinódromo Mundialista |
| Pruebas ofrecidas por categoría | 200 m CRI, 500 m, 10.000 m puntos… |
| Fecha límite de inscripción | 31 oct |
| Costos | Inscripción, transporte, hospedaje, uniforme (cada uno opcional) |
| Requisitos | Paz y salvo, certificado médico vigente, carné de liga |

### 8.2 Flujo de convocatoria
```
Profesor crea convocatoria → selecciona alumnos y pruebas
        │  (validación: categoría, nivel, documentos, paz y salvo)
        ▼
Acudiente recibe notificación → ACEPTA / RECHAZA (+ autorización firmada en la app)
        │
        ▼ acepta
Se genera cobro de inscripción (+ transporte/hospedaje si eligió) → pago
        │
        ▼
Lista de inscritos confirmados → exportar formato para la liga (Excel)
        │
        ▼
Día del evento: lista de viaje con contactos de emergencia y datos médicos (offline)
        │
        ▼
Registro de resultados por prueba → medallero, PB, insignias, notificación a familias
```

### 8.3 Requisitos
| ID | Requisito | Prioridad |
|---|---|---|
| DEP-60 | Calendario de competencias (crear evento, pruebas, costos, requisitos) | F2 |
| DEP-61 | Convocatoria con validaciones (categoría, documentos, mora según política) | F2 |
| DEP-62 | Aceptación y **autorización digital** del acudiente (fecha, IP, texto aceptado) | F2 |
| DEP-63 | Cobro automático de inscripción y servicios adicionales al aceptar | F2 |
| DEP-64 | Exportar lista de inscritos (documento, fecha de nacimiento, categoría, pruebas) | F2 |
| DEP-65 | **Lista de viaje** con datos de emergencia disponible sin conexión | F2 |
| DEP-66 | Registro de resultados: posición, tiempo/puntos, medalla, observación; importar desde Excel | F2 |
| DEP-67 | Medallero de la escuela por temporada, evento y categoría | F2 |
| DEP-68 | Historial competitivo en el perfil del deportista | F2 |
| DEP-69 | Publicar resultados (tarjeta para redes con foto del podio, respetando autorización de imagen) | F3 |

---

## 9. Seguimiento del deportista

**Perfil deportivo** (vista unificada para profesor, acudiente y alumno):
- Encabezado: foto, edad, categoría, nivel actual, grupo(s), profesor, años en la escuela.
- **Línea de tiempo**: ingreso, promociones de nivel, PB, competencias, medallas, lesiones, logros.
- Pestañas: Asistencia · Evaluaciones · Marcas · Competencias · Observaciones · Salud.

| ID | Requisito | Prioridad |
|---|---|---|
| DEP-70 | Perfil deportivo con línea de tiempo | MVP (asistencia) · F2 (resto) |
| DEP-71 | **Observaciones del profesor** (privadas para staff o compartidas con familia) | MVP |
| DEP-72 | **Novedades médicas / lesiones**: tipo, fecha, restricción ("no saltos por 2 semanas"), fecha de alta; visible como alerta en la asistencia | F2 |
| DEP-73 | Objetivos del deportista (p. ej. "bajar de 48 s en 500 m para diciembre") con seguimiento | F3 |

---

## 10. Logros y motivación (F2)

Insignias automáticas, pensadas para niños y familias:
| Insignia | Regla |
|---|---|
| 🔥 Racha | 10 / 25 / 50 clases seguidas sin falta |
| 💯 Centenario | 100 asistencias |
| ⬆️ Subí de nivel | Promoción aprobada |
| ⏱️ Récord personal | Nueva PB |
| 🏅 Primer podio | Primera medalla en competencia |
| 🎂 Un año patinando | Aniversario en la escuela |

Configurables (activar/desactivar). Se muestran en el perfil y generan notificación al acudiente.

---

## 11. Reportes deportivos

| Reporte | Prioridad |
|---|---|
| Asistencia por grupo, profesor y alumno (mes, rango) | MVP |
| Alumnos en riesgo (ausencias seguidas, baja asistencia) | MVP |
| Sesiones dictadas vs. canceladas (motivos) | MVP |
| Alumnos por nivel y categoría | MVP |
| Promociones de nivel por periodo | F2 |
| Mejores marcas por prueba y categoría | F2 |
| Medallero por temporada | F2 |
| Cumplimiento de planes de sesión y carga por grupo | F2 / F3 |

**Tablero del profesor:** clases de hoy, asistencia promedio de sus grupos, alumnos en riesgo, evaluaciones pendientes, próximas competencias, cumpleaños de la semana.

---

## 12. Pantallas principales

| Rol | Pantallas |
|---|---|
| **Profesor** (móvil primero) | Hoy (clases y plan del día) · Tomar asistencia · Mis grupos · Perfil del alumno · Evaluar · Registrar marcas / cronómetro · Biblioteca y planes · Competencias y convocatorias · Avisos a mis grupos |
| **Admin / coordinador** | Estructura deportiva · Grupos y horarios · Calendario · Asistencia (consolidado) · Evaluaciones y promociones · Competencias · Reportes deportivos |
| **Acudiente / alumno** | Horario y próximas clases · Asistencia · Progreso (nivel, evaluaciones, marcas, gráficas) · Competencias (convocatorias, aceptar/autorizar, resultados) · Logros |

---

## 13. Conexión con la gestión administrativa

| Evento deportivo | Efecto administrativo |
|---|---|
| Promoción de nivel → traslado de grupo | Cambio de tarifa desde el siguiente periodo |
| Convocatoria aceptada | Cobro de inscripción/servicios |
| Convocatoria con alumno en mora | Bloqueo o advertencia según política (ADM-05) |
| Ausencias seguidas | Alerta de deserción → gestión de retención |
| Lesión con incapacidad larga | Sugerencia de **congelar** matrícula |
| Sesiones dictadas por profesor | Reporte de horas |

---

## 14. Resumen por fase

| Fase | Deportivo |
|---|---|
| **MVP** | Plantilla de patinaje, niveles y categorías automáticas, grupos y horarios, sesiones (festivos como referencia), días sin clase, cancelaciones, asistencia offline, alertas de deserción, observaciones, reportes de asistencia |
| **F2** | Biblioteca y planes de sesión, evaluaciones y promociones, marcas y PB, cronómetro, competencias completas, lesiones, logros, perfil deportivo completo |
| **F3** | Macrociclos, carga de entrenamiento, check-in QR, objetivos, antropometría, publicaciones para redes, segundo deporte |
