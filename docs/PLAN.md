# Podium — Plan de producto

> SaaS para escuelas deportivas. Deporte inicial: **patinaje** (velocidad, artístico, hockey, freestyle).
> Dos ejes: **deportivo** (entrenamientos, asistencia, rendimiento, competencias) y **administrativo** (matrículas, cartera, pagos, reportes).

## Decisiones tomadas

| Tema | Decisión | Impacto |
|---|---|---|
| Mercado | **Colombia** | COP, zona `America/Bogota`, pasarela Wompi (PSE/Nequi/tarjeta), Ley 1581, documentos CC/TI/RC/CE/PPT, DIAN en fase 3 |
| Modelo de cobro de las escuelas | **Mensualidad** | Facturación recurrente mensual con día de corte; no hay paquetes de clases en el MVP |
| Profesores | **Empleados** | No se calcula pago por clase; reportes de horas solo informativos |
| Multi-sede | **No en el MVP** | Una sede por escuela en la interfaz (la entidad `Venue` existe para no migrar después) |
| Cliente | **PWA primero** | Una sola app web instalable para admin, profesores y acudientes |
| Equipo | **Un desarrollador (fundador)** | Stack mínimo, un solo despliegue, nada de microservicios |
| Alta de escuelas | **Manual por el super admin (Podium)** | Ver [`ONBOARDING_ESCUELAS.md`](ONBOARDING_ESCUELAS.md) |

---

## 1. Visión y propuesta de valor

| Para quién | Dolor actual | Lo que Podium resuelve |
|---|---|---|
| **Dueño / director de escuela** | Cobros en Excel y WhatsApp, no sabe quién debe, no ve números del negocio | Cartera al día, cobro automático, tablero financiero y de crecimiento |
| **Profesor / entrenador** | Lista de asistencia en papel, planes en cuaderno, tiempos en el celular | Asistencia en 2 toques, planes de entrenamiento reutilizables, registro de marcas |
| **Alumno / acudiente** | No sabe cuánto debe, cuándo entrena, cómo va su progreso | App con horario, pagos en línea, progreso, competencias y logros |

**Diferenciador:** combinar lo administrativo (que paga la suscripción) con lo deportivo (que genera uso diario y retención), con un modelo **configurable por deporte** para crecer más allá del patinaje sin reescribir.

---

## 2. Roles y permisos

| Rol | Alcance | Puede |
|---|---|---|
| **Super admin (Podium)** | Toda la plataforma | Dar de alta escuelas, planes de suscripción, soporte — ver [`ONBOARDING_ESCUELAS.md`](ONBOARDING_ESCUELAS.md) |
| **Administrador de escuela** | Su escuela (todas las sedes) | Todo: configuración, finanzas, usuarios, reportes |
| **Coordinador / secretaría** | Su escuela o sede | Matrículas, cartera, pagos, horarios; sin configuración sensible |
| **Profesor / entrenador** | Sus grupos | Asistencia, planes, evaluaciones, marcas, inscribir a competencias; **no ve finanzas** (configurable: ver "al día / en mora") |
| **Alumno** (mayor de edad o adolescente) | Su perfil | Ver horario, progreso, marcas, competencias, pagos |
| **Acudiente** (padre/madre) | Sus hijos (1..n) | Pagar, ver asistencia y progreso, autorizar participaciones, recibir avisos |

Permisos basados en roles (RBAC) con posibilidad de un usuario tener varios roles (p. ej. profesor que también es acudiente).

---

## 3. Módulos

### 3.1 Núcleo / configuración
- Escuela (tenant): datos, logo, colores, NIT, sedes/pistas.
- Deportes y **modalidades** habilitadas (patinaje velocidad, artístico…).
- **Niveles** (iniciación, formación, intermedio, avanzado, competencia/élite) y **categorías** por edad (p. ej. según federación: Mini, Pre-infantil, Infantil, Juvenil, Mayores) — calculadas automáticamente por fecha de nacimiento y año de competencia.
- Temporadas / periodos (año, semestre, ciclo).

### 3.2 Alumnos y matrículas
- Ficha: datos personales, documento, EPS, tipo de sangre, contacto de emergencia, condiciones médicas, tallas (uniforme/patines), foto.
- Acudientes vinculados (uno o varios por alumno; un acudiente con varios hijos).
- Documentos: certificado médico, consentimiento informado, autorización de uso de imagen (con fecha de vencimiento y alertas).
- Matrícula: alumno → **grupo** + **plan de pago**, fecha inicio/fin, estado (activo, congelado, retirado), motivo de retiro (para analizar deserción).
- Inscripción pública: formulario/link para que nuevos alumnos se pre-registren (lead → clase de prueba → matrícula).

### 3.3 Grupos y horarios
- Grupo: modalidad, nivel, categoría, sede, profesor(es), cupo máximo, horario recurrente (p. ej. Lun-Mié-Vie 4–6 pm).
- Generación automática de **sesiones** a partir del horario; cancelación/reprogramación (lluvia, festivos) con notificación.
- Calendario por sede, por profesor, por alumno.

### 3.4 Asistencia
- Toma de asistencia desde el celular del profesor: lista del grupo, estados **presente / ausente / excusa / tarde**; funciona **offline** y sincroniza.
- Alternativa: check-in con QR del alumno.
- Clases de reposición (recuperar clase en otro grupo).
- Alertas: alumno con X inasistencias seguidas → aviso a coordinación/acudiente (riesgo de deserción).
- Opcional: bloquear/marcar alumnos en mora al tomar asistencia.

### 3.5 Entrenamientos (planificación deportiva)
- **Biblioteca de ejercicios** por modalidad (técnica, físico, velocidad, resistencia, juego), con descripción, video/imagen, duración, materiales.
- **Plan de sesión**: calentamiento → parte principal → vuelta a la calma, armado con ejercicios de la biblioteca.
- **Macro/mesociclos**: plan de temporada por grupo apuntando a competencias objetivo.
- Plantillas reutilizables y compartibles entre profesores de la escuela.
- Registro post-sesión: qué se hizo realmente, carga/RPE (esfuerzo percibido), observaciones.

### 3.6 Evaluación y rendimiento ("números deportivos")
- **Pruebas/marcas** configurables por deporte. Patinaje velocidad: 100 m, 200 m CRI, 300 m, 500 m, 1.000 m, 10.000 m puntos/eliminación, maratón; tiempos con milésimas.
- **Evaluaciones técnicas** por nivel con rúbricas (p. ej. "cruce de piernas en curva: 1–5"). Al cumplir criterios → **promoción de nivel**.
- Pruebas físicas (salto, velocidad 30 m, flexibilidad…) con historial.
- Curvas de progreso, **marcas personales (PB)**, comparación vs. promedio de la categoría, ranking interno.
- Medallero y **logros/insignias** (gamificación para niños: "100 asistencias", "primer podio").

### 3.7 Competencias y participaciones
- Calendario de eventos (internos, ligas, federación, interclubes, festivales).
- Convocatoria: profesor selecciona alumnos → acudiente **acepta/rechaza** y autoriza → se genera **cobro de inscripción** (y transporte/uniforme si aplica).
- Registro de resultados por prueba: posición, tiempo, puntos, medalla.
- Historial competitivo del deportista, medallero de la escuela por temporada.
- Exportar listado de inscritos (formato para la liga/federación).

### 3.8 Cartera, cobros y pagos
- **Conceptos de cobro**: matrícula (anual), **mensualidad**, inscripción a competencia, uniforme, eventos.
- **Mensualidad** (modelo único del MVP):
  - Valor definido por **tarifa** (p. ej. "Iniciación 3 días/semana", "Competencia 5 días/semana"); cada matrícula apunta a una tarifa.
  - La escuela configura el **día de generación** (p. ej. día 1), el **día de vencimiento** (p. ej. día 10) y el **recargo por mora** (valor fijo o %, opcional).
  - Ingreso a mitad de mes: cobrar mes completo, proporcional o desde el mes siguiente (configurable).
  - Descuentos recurrentes: hermanos, pronto pago (si paga antes del día X), becas (% o valor fijo, con fecha fin).
  - Alumno **congelado** (lesión, viaje): no genera mensualidad en esos meses.
- **Facturación recurrente automática**: un job diario genera las cuentas de cobro del mes a cada acudiente responsable (agrupa hermanos en un solo cobro).
- **Estado de cuenta** por alumno/acudiente: saldo, vencidos, edad de la cartera (0–30, 31–60, 61–90, +90).
- **Pagos en línea**: **Wompi** (PSE, tarjeta, Nequi, Bancolombia). Link de pago por cobro; conciliación automática por webhook. Cada escuela usa **su propia cuenta Wompi** (el dinero llega directo a la escuela, Podium no recauda dineros de terceros).
- **Pagos manuales**: efectivo/transferencia registrados por la escuela con soporte (foto del comprobante) y recibo de caja.
- Abonos parciales, notas crédito, anulaciones con auditoría.
- **Recordatorios automáticos** (antes del vencimiento, al vencer, en mora) por email/push y WhatsApp.
- Facturación electrónica DIAN vía proveedor (Alegra, Siigo, Facturatech…) — **fase 3**.
- Egresos básicos (nómina de profesores, arriendo de pista, materiales) para ver utilidad — **fase 3**.

### 3.9 Comunicación
- Avisos a toda la escuela, a un grupo o individuales.
- Notificaciones push, email y **WhatsApp** (canal clave en Latam; API oficial vía proveedor).
- Confirmaciones de lectura para comunicados importantes.

### 3.10 Reportes y tablero ("números del negocio")
- **Financiero**: ingresos del mes vs. proyectado, recaudo %, cartera vencida, top deudores, ingresos por concepto/sede/grupo.
- **Alumnos**: activos, nuevos, retirados, **tasa de retención/churn**, ocupación de grupos (inscritos/cupo), LTV.
- **Asistencia**: % por grupo/profesor/alumno, tendencias.
- **Deportivo**: alumnos por nivel, promociones, medallas por temporada, mejores marcas.
- **Profesores**: horas dictadas, asistencia promedio de sus grupos (insumo para nómina por clases).
- Exportar a Excel/PDF.

---

## 4. Diseño multi-deporte (clave para escalar)

No "quemar" patinaje en el código. Modelo configurable:

```
Deporte ─┬─ Modalidad (velocidad, artístico, hockey…)
         │     ├─ Nivel (con criterios de evaluación)
         │     └─ Prueba / Métrica (nombre, unidad: tiempo|distancia|puntos|repeticiones, "menor es mejor")
         └─ Esquema de categorías (rangos de edad por fecha de corte)
```

Así, natación (50 m libre, tiempo), fútbol (goles, asistencias), gimnasia (puntaje) entran como **configuración/plantillas**, no como desarrollo nuevo. Se entregan **plantillas pre-cargadas** por deporte (patinaje primero) que cada escuela ajusta.

---

## 5. Modelo de datos (entidades principales)

Todas las tablas de negocio llevan `school_id` (tenant).

| Entidad | Campos clave |
|---|---|
| `School` | nombre, NIT, plan_suscripción, configuración, moneda, zona horaria |
| `Venue` (sede/pista) | school_id, nombre, dirección |
| `User` | email/teléfono, contraseña/OTP; `Membership(user, school, roles[])` |
| `Athlete` | datos personales, fecha_nacimiento, info médica, foto |
| `Guardian` ↔ `Athlete` | relación (padre, madre, tutor), responsable_pago |
| `Sport`, `Discipline`, `Level`, `CategoryScheme`, `Metric` | configuración deportiva |
| `Group` | discipline, level, venue, coaches[], cupo, horario (RRULE) |
| `Enrollment` | athlete, group, price_plan, inicio, fin, estado |
| `Session` | group, fecha/hora, estado, plan_de_sesión |
| `Attendance` | session, athlete, estado, registrado_por, timestamp |
| `Exercise`, `SessionPlan`, `Macrocycle` | planificación |
| `Evaluation`, `MetricResult` | athlete, metric, valor, fecha, contexto (entreno/competencia) |
| `Competition`, `CompetitionEvent`, `Participation`, `Result` | competencias |
| `PricePlan`, `ChargeConcept`, `Discount` | configuración de cobros |
| `Invoice` (cuenta de cobro) + `InvoiceLine` | deudor (acudiente), vencimiento, estado |
| `Payment` + `PaymentAllocation` | método, pasarela, referencia, aplicado a facturas |
| `Notification`, `Announcement` | comunicación |
| `AuditLog` | quién cambió qué (obligatorio en finanzas) |
| Plataforma | `SchoolLead`, `Plan`, `Subscription`, `PlatformInvoice`, `Invitation`, `PaymentProviderAccount`, `LegalAcceptance` — detalle en [`ONBOARDING_ESCUELAS.md`](ONBOARDING_ESCUELAS.md) |

---

## 6. Arquitectura propuesta

**Principio:** un desarrollador → **un solo proyecto, un solo lenguaje (TypeScript), un solo despliegue**. Monolito modular; se separa solo si algún día hace falta.

| Capa | Propuesta | Por qué |
|---|---|---|
| App (admin, profesores, acudientes) | **Next.js (App Router) como PWA** + Tailwind + shadcn/ui | Un solo código para web y "app" instalable en el celular |
| Backend | **Server Actions / Route Handlers de Next.js** (mismo proyecto) | Sin API separada que mantener |
| Base de datos | **PostgreSQL** (Neon o Supabase) con `school_id` en cada tabla + **Row Level Security** | Aislamiento fuerte entre escuelas |
| ORM | **Drizzle** (o Prisma) | Tipado y migraciones |
| Auth | **Better Auth** / Auth.js: email + contraseña y **código OTP por email**; WhatsApp OTP después | Acudientes sin fricción |
| Jobs programados | **Cron del hosting** (Vercel Cron) llamando endpoints idempotentes; `pg-boss` si crece | Sin Redis ni infraestructura extra |
| Archivos | Cloudflare R2 / Supabase Storage | Fotos, comprobantes, documentos |
| Pagos | Interfaz `PaymentProvider` → **Wompi** | Cambiar/añadir pasarela sin tocar el dominio |
| Notificaciones | Interfaz `Notifier` → email (**Resend**), Web Push (PWA); WhatsApp (Meta Cloud API) en fase 2 | |
| Offline (asistencia) | Service Worker + IndexedDB, cola de sincronización | Pistas con mala señal |
| Hosting | **Vercel** + Neon/Supabase (planes gratuitos/baratos al inicio) | Cero servidores que administrar |
| Observabilidad | Sentry | |

**Estructura del proyecto:**
```
src/
  app/
    (platform)/admin/      # consola super admin de Podium (alta de escuelas)
    (school)/[slug]/...    # app de cada escuela (admin, profesor, acudiente)
    api/                   # webhooks (Wompi), cron
  modules/                 # dominio por módulo: schools, athletes, groups,
                           # attendance, billing, payments, training, ...
  db/                      # esquema Drizzle y migraciones
  lib/                     # auth, tenant, notifier, payment-provider
```

**Identificación de la escuela (tenant):** por ruta `podium.app/<slug>` en el MVP (sin DNS ni certificados extra). Subdominios `<slug>.podium.app` o dominio propio pueden añadirse después.

---

## 7. Requisitos no funcionales
- **Protección de datos de menores**: cumplimiento Ley 1581 de 2012 (Habeas Data, Colombia) — consentimiento del acudiente, política de tratamiento, acceso mínimo (profesor no ve datos financieros), cifrado de datos sensibles (salud).
- **Offline-first** en asistencia (pistas sin buena señal).
- **Auditoría** de todo movimiento financiero; nada se borra, se anula.
- Multi-moneda / multi-zona horaria preparado (expansión Latam).
- Idioma: español primero, i18n listo.
- Backups diarios, RPO ≤ 24 h.

---

## 8. Roadmap

### Fase 0 — Descubrimiento (2–3 semanas)
- Entrevistar 5–10 escuelas de patinaje (dueños, profesores, padres).
- Validar: ¿cómo cobran hoy?, ¿qué pagarían?, ¿qué los haría cambiar de Excel/WhatsApp?
- Prototipo navegable (Figma) de los 5 flujos clave.

### Fase 1 — MVP "administrativo + asistencia" (≈10–12 semanas, 1 dev)
Objetivo: que una escuela deje Excel para cobrar y tomar lista.

| Semanas | Entregable |
|---|---|
| 1–2 | Proyecto base, auth, multi-tenant (RLS), **consola super admin y alta de escuelas** |
| 3–4 | Configuración de escuela, alumnos, acudientes, importación desde Excel |
| 5 | Grupos, horarios y generación de sesiones |
| 6 | Asistencia en la PWA (con modo offline) |
| 7–8 | Tarifas, matrículas, generación mensual de cobros, estado de cuenta, pagos manuales |
| 9 | Wompi (link de pago + webhook) y recordatorios por email |
| 10 | Portal del acudiente (cobros, pagos, asistencia de sus hijos) |
| 11–12 | Tablero (recaudo, cartera, activos, asistencia), pulido y **piloto con 1–3 escuelas** |

### Fase 2 — Deportivo (≈8 semanas)
- Niveles y evaluaciones, registro de marcas y progreso.
- Competencias, convocatorias, autorizaciones y resultados.
- Biblioteca de ejercicios y planes de sesión.
- Progreso y logros visibles para alumno/acudiente.
- Recordatorios por WhatsApp.

### Fase 3 — Crecimiento
- Facturación electrónica DIAN, egresos.
- Registro autónomo de escuelas (self-service) con prueba gratis y cobro automático de la suscripción.
- Multi-sede, inscripción pública / clase de prueba, check-in QR, gamificación.
- Segundo deporte vía plantilla (natación o fútbol).
- App nativa (Expo) solo si la PWA se queda corta.

---

## 9. Modelo de negocio (hipótesis a validar)
- Suscripción mensual por escuela, escalonada por **alumnos activos** (p. ej. hasta 50 / 150 / 400 / ilimitado).
- Prueba gratis 30 días; onboarding asistido (importar Excel de alumnos).
- Ingreso adicional opcional: pequeña comisión por pago en línea procesado.
- Métricas propias del SaaS: MRR, escuelas activas, churn de escuelas, % de pagos en línea, uso semanal de asistencia por profesores.

---

## 10. Métricas de éxito del MVP
- ≥ 3 escuelas piloto usando cobros + asistencia durante 2 meses.
- ≥ 80 % de sesiones con asistencia registrada en la app.
- ≥ 40 % del recaudo procesado en línea.
- Reducción medible de la cartera vencida de las escuelas piloto.

---

## 11. Preguntas abiertas
1. ¿Nombre/marca final "Podium" confirmado y dominio disponible?
2. ¿Precio de la suscripción por rango de alumnos? (validar en Fase 0).
3. ¿Escuelas piloto identificadas para la Fase 0?
