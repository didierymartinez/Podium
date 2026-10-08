# Podium — Plan de producto

> SaaS para escuelas deportivas. Deporte inicial: **patinaje** (velocidad, artístico, hockey, freestyle).
> Dos ejes: **deportivo** (entrenamientos, asistencia, rendimiento, competencias) y **administrativo** (matrículas, cartera, pagos, reportes).

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
| **Super admin (Podium)** | Toda la plataforma | Gestionar escuelas (tenants), planes de suscripción, soporte |
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
- **Conceptos de cobro**: matrícula, mensualidad, clase suelta, paquete de clases, inscripción a competencia, uniforme, patines/alquiler, eventos.
- **Planes**: mensual, trimestral, por número de clases, con descuentos (hermanos, pronto pago, becas/beneficios) y recargos por mora.
- **Facturación recurrente automática**: generar cuentas de cobro cada periodo según matrícula.
- **Estado de cuenta** por alumno/acudiente: saldo, vencidos, edad de la cartera (0–30, 31–60, 61–90, +90).
- **Pagos en línea**: pasarela local (Colombia: Wompi, PayU, Mercado Pago, ePayco → PSE, tarjeta, Nequi, Daviplata, Bancolombia QR). Conciliación automática por webhook.
- **Pagos manuales**: efectivo/transferencia registrados por secretaría con soporte (foto del comprobante), recibo de caja.
- Abonos parciales, notas crédito, anulaciones con auditoría.
- **Recordatorios automáticos** (antes del vencimiento, al vencer, en mora) por WhatsApp/email/push.
- Facturación electrónica DIAN vía proveedor (Alegra, Siigo, Facturatech…) — **fase 2**.
- Egresos básicos (nómina de profesores, arriendo de pista, materiales) para ver utilidad — **fase 2**.

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

---

## 6. Arquitectura propuesta

**Principio:** un solo lenguaje (TypeScript) de punta a punta, monolito modular bien separado — rápido para un equipo pequeño, fácil de partir después.

| Capa | Propuesta | Por qué |
|---|---|---|
| Web admin (escuela/profesores) | **Next.js** (React) + Tailwind + shadcn/ui | Productivo, SSR, gran ecosistema |
| App móvil (profesor, alumno, acudiente) | **React Native (Expo)**; arrancar como **PWA** en MVP | Comparte lógica/tipos; PWA reduce tiempo al mercado |
| Backend / API | **NestJS** (o Next.js API + tRPC si se quiere aún más simple) | Módulos claros por dominio |
| Base de datos | **PostgreSQL** con multi-tenancy por `school_id` + **Row Level Security** | Aislamiento fuerte de datos entre escuelas |
| ORM | Prisma o Drizzle | Tipado, migraciones |
| Jobs / colas | BullMQ + Redis | Facturación recurrente, recordatorios, generación de sesiones |
| Archivos | S3 / Cloudflare R2 | Fotos, comprobantes, documentos, videos de ejercicios |
| Auth | Email + **OTP por WhatsApp/SMS** (acudientes rara vez recuerdan contraseñas) | Fricción mínima |
| Pagos | Abstracción `PaymentProvider` → Wompi primero | Cambiar/añadir pasarela sin tocar el dominio |
| Notificaciones | Abstracción `Notifier` → email (Resend/SES), push (Expo), WhatsApp (Twilio/360dialog/Meta Cloud API) | |
| Infra | Vercel/Render/Railway al inicio → AWS cuando haya tracción | Bajo costo operativo inicial |
| Observabilidad | Sentry + logs estructurados | |

**Estructura del monorepo (sugerida):**
```
apps/
  web/        # Next.js – panel admin y profesores
  mobile/     # Expo – alumnos, acudientes, profesores
  api/        # NestJS
packages/
  domain/     # tipos y reglas de negocio compartidas
  ui/         # componentes compartidos
  db/         # esquema y migraciones
```

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

### Fase 1 — MVP "administrativo + asistencia" (8–10 semanas)
Objetivo: que una escuela deje Excel para cobrar y tomar lista.
1. Escuela, sedes, usuarios, roles.
2. Alumnos, acudientes, matrículas, grupos y horarios.
3. Asistencia desde el móvil (PWA).
4. Planes de pago, facturación recurrente, estado de cuenta, pagos manuales.
5. Pago en línea (Wompi) + recordatorios por email/WhatsApp.
6. Tablero básico: recaudo, cartera vencida, alumnos activos, asistencia.

### Fase 2 — Deportivo (6–8 semanas)
- Niveles y evaluaciones, registro de marcas y progreso.
- Competencias, convocatorias, autorizaciones y resultados.
- Biblioteca de ejercicios y planes de sesión.
- App del acudiente/alumno con progreso y logros.

### Fase 3 — Crecimiento
- Facturación electrónica DIAN, egresos y nómina de profesores.
- Inscripción pública / embudo de leads y clase de prueba.
- App nativa (Expo), check-in QR, gamificación.
- Segundo deporte vía plantilla (natación o fútbol).
- Integraciones con ligas/federaciones, multi-sede avanzada, marketplace de escuelas.

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
1. ¿Mercado inicial solo Colombia o Latam desde el principio? (define pasarela, facturación, categorías de federación).
2. ¿Las escuelas cobran por mes fijo, por clases o mixto? ¿Hay becas/patrocinios?
3. ¿Los profesores son empleados, contratistas por clase o socios? (impacta reportes de nómina).
4. ¿Se necesita multi-sede en el MVP?
5. ¿Prioridad: web primero o app móvil primero para profesores y acudientes?
6. ¿Equipo de desarrollo disponible y presupuesto/tiempo objetivo para el MVP?
7. ¿Nombre/marca final "Podium" confirmado?
