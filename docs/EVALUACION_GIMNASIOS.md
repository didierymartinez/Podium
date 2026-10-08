# Evaluación: ¿Podium para gimnasios y entrenamiento personalizado?

> Origen: experiencia real como usuario de un gimnasio con plan "con acompañamiento": registro y pago por un link de un software de gimnasios (GymSoft de Sibo Avance), instructor que indica qué hacer, **sin registro de lo que se hace ni del progreso**, y una evaluación InBody hecha por fuera.
> Pregunta: ¿se resuelve con el mismo software o con otro?

---

## 1. Conclusión

**Mismo software y mismo núcleo, como una segunda vertical: "Podium Gym / Entrenamiento". Se construye después de validar las escuelas.**

- Alrededor del **70 %** de lo que necesita un gimnasio ya está en Podium: personas, planes, cobros recurrentes, pagos Wompi, cartera, asistencia, instructores, evaluaciones, métricas, progreso y app PWA.
- Lo que cambia es el **modelo de servicio** (socio adulto e individual, no grupo de niños con acudiente) y el **tipo de entrenamiento** (rutinas de fuerza: series, repeticiones y peso).
- Hacer otro producto duplicaría auth, pagos, cartera, multi-tenant y PWA, es decir, el 70 % del trabajo.
- Atacar ambos mercados en el MVP le quita foco a un solo desarrollador. Además, el mercado de software para gimnasios está **muy disputado** (GymSoft, Virtuagym, Glofox, etc.). El de escuelas deportivas lo está mucho menos.

**Lo que sí se hace desde ya (costo casi cero):** diseñar el núcleo para que la vertical gimnasio encaje sin reescribir (sección 5). Además, algunas ideas del gimnasio **mejoran la escuela** desde la Fase 2 (sección 4).

---

## 2. Qué enseña el flujo de pago del gimnasio (lo que Podium NO debe hacer)

El mensaje que recibe el socio tiene **8 pasos**, advertencias, dos casillas legales en cada compra, un flujo de "suscribir tarjeta y luego pagar" y una nota que dice "a veces se congela, cierra y repite".

| Problema observado | Cómo lo resuelve Podium |
|---|---|
| El socio debe buscar "Afiliarme" → "Renovar plan" → elegir plan cada mes | **Link de pago personal y prellenado** por cada cobro: abre directo en el valor a pagar, sin login (token firmado de un solo uso) |
| Se aceptan términos en **cada** compra | Se aceptan **una vez** al registrarse (versionado); se vuelven a pedir solo si cambian |
| "Primero se suscribe la tarjeta y luego se paga" | Pago directo; guardar la tarjeta para débito automático es **opcional** y se ofrece *después* del primer pago |
| Advertencias confusas ("dale continuar") | Ningún aviso técnico al usuario final; mensajes en lenguaje claro |
| "Se queda congelado: cierra y repite" | Estado de pago visible ("en verificación"), webhook + conciliación diaria, sin pagos duplicados (clave de idempotencia) |
| Instrucciones largas por WhatsApp | El mensaje automático es: "Hola Didier, tu plan vence el 15. Renueva aquí: [link]" — **1 toque** |
| Registro previo por un link aparte | Registro y primer pago en el mismo flujo (invitación → datos → pago) |

**Meta de diseño:** renovar = **≤ 3 toques** desde el mensaje (abrir link → elegir medio → pagar).

---

## 3. Escuela vs. gimnasio: diferencias reales

| Dimensión | Escuela deportiva (MVP) | Gimnasio / entrenamiento personalizado |
|---|---|---|
| Cliente | Niños y jóvenes; paga el **acudiente** | **Adulto**; paga él mismo |
| Servicio | Grupo fijo con horario y profesor | Acceso libre por horario, clases grupales con **reserva** y/o **entrenador personal** |
| Plan | Mensualidad fija por grupo | Membresía por periodo (mes, trimestre, año), **ticketera** (N visitas), plan con acompañamiento (más caro), congelaciones |
| Asistencia | Profesor toma lista | **Check-in** del socio (QR, torniquete, recepción) |
| Entrenamiento | Plan de sesión **grupal** | **Rutina individual**: ejercicio, series, repeticiones, peso, descanso |
| Progreso | Nivel técnico, marcas (tiempos), competencias | Cargas (peso levantado), volumen, **composición corporal** (InBody), medidas, fotos |
| Evaluación | Rúbrica técnica, promoción de nivel | Valoración inicial (salud, objetivos, InBody), re-evaluación periódica |
| Competencias | Centrales | Raras (retos internos) |
| Retención | Ausencias del niño | Socio que deja de venir (el mayor problema de los gimnasios) |
| Ventas | Uniformes | Suplementos, bebidas, entrenamientos personales extra |

---

## 4. Lo que el caso del gimnasio aporta a la escuela (adoptar en F2)

| Idea | Aplicación en la escuela |
|---|---|
| **Registro individual de lo que hace cada uno** | Para el grupo de **Competencia**: rutina individual (gimnasio/físico) además del plan grupal; registro de cargas en preparación física |
| **Composición corporal / InBody** | Ya estaba como antropometría (DEP-56, F3) → subir a **F2** para deportistas de competencia y alumnos adultos, con permiso del acudiente |
| **Valoración inicial** | Al matricular: objetivos, antecedentes, test inicial → punto de partida del progreso |
| **El socio registra su entreno** | El alumno de competencia registra su entreno en casa (rodillo, físico), validado por el profesor |
| **Renovación en 1 toque** | Aplica igual a las mensualidades de la escuela |

---

## 5. Cómo dejar el núcleo listo desde ya (sin construir el gimnasio)

| Decisión de diseño | Escuela la usa así | Gimnasio la usará así |
|---|---|---|
| `School.type`: `SPORTS_SCHOOL` · `GYM` | Escuela | Gimnasio / centro de entrenamiento |
| **Cliente = Persona** con "responsable de pago" opcional | Acudiente paga por el niño | El socio es su propio responsable (ya contemplado para alumnos adultos) |
| **Plan** con tipo: `MONTHLY_GROUP` (MVP) · `PERIOD_MEMBERSHIP` · `VISIT_PACK` · `PERSONAL_TRAINING` | Solo `MONTHLY_GROUP` | Membresías, ticketeras, plan con acompañamiento |
| **Asistencia** con origen: `COACH_ROLL_CALL` · `CHECK_IN` | Lista del profesor | Check-in QR del socio |
| **Métricas** genéricas (ya diseñadas: tiempo, distancia, puntos, repeticiones…) + tipo `WEIGHT` y `PERCENT` | Tiempos de 500 m | Peso en sentadilla, % de grasa, masa muscular |
| **Evaluación** = conjunto de métricas en una fecha | Test físico trimestral | Evaluación InBody / valoración |
| Módulos activables por tipo de organización | Competencias, niveles, acudientes | Rutinas, reservas, check-in, InBody |

Costo: unas pocas columnas y enums en el modelo de datos. No hay pantallas nuevas en el MVP.

---

## 6. Vertical "Podium Gym" (cuando se decida)

### 6.1 Módulos específicos
| Módulo | Contenido |
|---|---|
| **Membresías** | Mensual, trimestral, anual, ticketera de N visitas, plan con acompañamiento; congelación con días máximos; vencimiento y renovación en 1 toque; débito automático con tarjeta |
| **Check-in** | QR personal en la PWA, escaneo en recepción (tablet) o autoservicio; valida membresía vigente; (F+) integración con torniquetes |
| **Rutinas** | Biblioteca de ejercicios (con video), rutina por días (A/B/C), series × repeticiones × peso × descanso, asignada por el instructor al socio |
| **Registro del entreno** | El socio (o el instructor) marca series hechas y peso real en la app → historial |
| **Progreso** | Gráficas por ejercicio (peso máximo, volumen, 1RM estimado), asistencia, racha |
| **Composición corporal** | Registro de evaluaciones InBody: peso, masa muscular esquelética, masa grasa, % grasa, grasa visceral, agua corporal, metabolismo basal; foto/PDF del resultado; gráficas de evolución |
| **Instructores** | Cartera de socios asignados, agenda de valoraciones, alertas ("Didier no viene hace 10 días", "toca re-evaluación") |
| **Clases grupales** | Spinning, funcional, yoga: horario, cupo, **reserva** desde la app, lista de espera |
| **Retención** | Socios inactivos, membresías por vencer, campañas de reactivación |

### 6.2 InBody
- **Fase 1 de la vertical:** registro **manual** de los valores clave + foto del resultado impreso.
- **Después:** integración con la plataforma de InBody para importar resultados automáticamente. **Requiere validar** con InBody Colombia la disponibilidad de su API y su costo.
- El mismo módulo sirve para otras básculas de bioimpedancia, sin atarse a una marca.

### 6.3 El caso real, resuelto con Podium Gym
1. Recibe un WhatsApp con su link → registro + pago del "plan con acompañamiento" en 3 toques.
2. Valoración inicial: objetivos y InBody cargado en su perfil.
3. El instructor le asigna la rutina en la app.
4. Cada visita: check-in con QR → ve la rutina del día → marca series y pesos (o el instructor los registra).
5. Cada mes: gráficas de cargas, asistencia y re-evaluación InBody comparada con la anterior.
6. Antes del vencimiento: "Renueva aquí" → 1 toque (o débito automático).

---

## 7. Recomendación de roadmap

| Momento | Acción |
|---|---|
| **Ahora (MVP escuelas)** | Aplicar la sección 5 en el modelo de datos; flujo de pago de ≤ 3 toques |
| **Fase 2 (deportivo)** | Valoración inicial, composición corporal y rutina individual para el grupo de competencia (sección 4) |
| **Validación gimnasio** (en paralelo, sin código) | Entrevistar a 5 gimnasios pequeños y estudios de entrenamiento personal: ¿pagarían por el seguimiento del socio? ¿qué usan hoy? |
| **Fase 3** | Si la validación es positiva: lanzar **Podium Gym** enfocado en **estudios pequeños y entrenadores personales con seguimiento**. Ese es el hueco que muestra el caso real; no se compite de frente con el software de gimnasios grandes en control de acceso |

**Posicionamiento posible:** "El software que sí registra tu progreso". Para los gimnasios es un diferencial frente a las herramientas actuales, que se concentran en cobrar y controlar el acceso.
