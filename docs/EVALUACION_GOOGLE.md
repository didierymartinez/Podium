# Evaluación: tecnologías Google (Firebase / Google Cloud) para Podium

> Estado: **propuesta** — pendiente de confirmar. Si se aprueba, se actualiza la sección 6 de [`PLAN.md`](PLAN.md).
> Contexto: un solo desarrollador, PWA en Next.js, multi-escuela (multi-tenant), datos financieros (cartera, pagos), Colombia.
> Los precios son aproximados; validar en la calculadora de Google Cloud antes de decidir.

---

## 1. Conclusión

**Sí a Google, pero no "todo Firebase".** Lo recomendado:

| Pieza | Usar | Evitar |
|---|---|---|
| Cuentas (auth) | ✅ **Firebase Authentication** (Identity Platform) | — |
| Base de datos | ✅ **Cloud SQL para PostgreSQL** | ❌ **Firestore** como base principal |
| Despliegue de la app | ✅ **Firebase App Hosting** (Next.js sobre Cloud Run) | — |
| Notificaciones push | ✅ **Firebase Cloud Messaging (FCM)** | — |
| Archivos | ✅ **Cloud Storage for Firebase** | — |
| Tareas programadas | ✅ **Cloud Scheduler** → endpoints de la app | — |
| Secretos (llaves Wompi) | ✅ **Secret Manager** / **Cloud KMS** | — |
| Monitoreo | ✅ Cloud Logging + Error Reporting (o Sentry) | — |
| Email transaccional | ➖ Google no tiene servicio propio → **Resend** (o SendGrid) | — |
| Correo corporativo | ✅ Google Workspace (`@podium…`) | — |

La razón principal: **Firestore no encaja con cartera, cobros y reportes** (datos muy relacionales, transacciones contables, agregaciones por antigüedad de deuda). Todo lo demás de Firebase sí encaja y ahorra trabajo.

---

## 2. Evaluación por pieza

### 2.1 Cuentas — Firebase Authentication ✅
| A favor | En contra |
|---|---|
| Email/contraseña, **Google Sign-In**, enlace mágico, verificación de email y recuperación de contraseña **listos** (ahorra 1–2 semanas) | Los roles por escuela **no** van en *custom claims* (un usuario pertenece a varias escuelas): se guardan en Postgres (`Membership`) |
| Gratis para email/Google hasta volúmenes altos de usuarios activos | SMS/OTP por celular se cobra por mensaje |
| MFA (2FA) disponible al activar Identity Platform → útil para la consola super admin | Lógica de sesión en Next.js: usar **cookies de sesión** de Firebase verificadas en el servidor |
| Bloqueo de abuso integrado (App Check, límites) | Dependencia del proveedor (mitigable: los usuarios y hashes se pueden exportar) |

Encaja con el registro self-service: crear cuenta → verificar email → crear escuela.

### 2.2 Base de datos — Firestore ❌ vs Cloud SQL PostgreSQL ✅

| Criterio | Firestore | Cloud SQL (PostgreSQL) |
|---|---|---|
| Datos relacionales (alumno ↔ acudiente ↔ matrícula ↔ cobro ↔ pago) | Débil: sin *joins*, hay que desnormalizar y mantener copias sincronizadas | Natural |
| Transacciones contables (aplicar un pago a varios cobros, anulaciones) | Limitadas y costosas de modelar | ACID completo |
| Reportes: cartera por edades, recaudo, retención, asistencia por grupo | Agregaciones básicas; reportes complejos requieren exportar a BigQuery | SQL directo |
| Unicidad (slug de escuela, documento por escuela) | No hay restricciones únicas: hay que simularlas | `UNIQUE` |
| Aislamiento entre escuelas | Reglas de seguridad (bien para cliente; el servidor con Admin SDK las salta) | **Row Level Security** |
| Tiempo real y offline en el cliente | ✅ Excelente | Hay que construirlo (solo se necesita en asistencia) |
| Costo inicial | Plan gratis generoso; costo por lectura crece con reportes | **Sin plan gratis**: instancia mínima ≈ USD 10–30/mes |
| Migraciones/esquema | Sin esquema (más errores de datos con el tiempo) | Esquema tipado (Drizzle) |

**Decisión: PostgreSQL en Cloud SQL.** El offline de asistencia se resuelve con IndexedDB + cola de sincronización en la PWA (ya planeado).

> Alternativa evaluada: **Firebase Data Connect** (PostgreSQL de Cloud SQL expuesto por GraphQL con integración de Firebase Auth). Interesante, pero añade una capa GraphQL propia de Google y limita reportes y migraciones a su modelo. Con un solo desarrollador es más simple usar Cloud SQL directamente con Drizzle desde Next.js. Se puede reconsiderar más adelante.

### 2.3 Despliegue — Firebase App Hosting ✅
| A favor | En contra |
|---|---|
| Hecho para **Next.js**: conecta el repo de GitHub y despliega en cada push | *Cold starts* si escala a cero (1–3 s en la primera petición); se mitiga con 1 instancia mínima (costo extra) |
| Corre sobre **Cloud Run** + CDN; mismo proyecto que Auth, Storage y Cloud SQL | Menos pulido que Vercel en vistas previas por rama |
| Contenedores: si un día se sale de Google, la app se mueve sin reescribir | Cloud SQL y Cloud Run deben estar en la misma región |

Alternativa directa: **Cloud Run** con Dockerfile propio (más control, un poco más de configuración).

### 2.4 Notificaciones — FCM ✅
Web Push gratis para la PWA (Android y iOS 16.4+ con la app instalada en la pantalla de inicio). Recordatorios de pago, avisos y cancelaciones de clase.

### 2.5 Archivos — Cloud Storage ✅
Fotos, logos, comprobantes de pago, certificados médicos. Reglas de acceso por escuela; URLs firmadas generadas en el servidor para documentos sensibles.

### 2.6 Jobs — Cloud Scheduler ✅
Llamadas HTTP programadas (autenticadas con OIDC) a endpoints idempotentes de la app: generación mensual de cobros, recordatorios, cambio de estado de pruebas/mora, generación de sesiones. Si crece: **Cloud Tasks** para colas con reintentos.

---

## 3. Región y datos personales
- Google Cloud **no tiene región en Colombia**. Opciones: `us-east1` / `us-east4` (EE. UU. costa este, baja latencia desde Colombia y precios más bajos), `northamerica-south1` (Querétaro, México) o `southamerica-east1` (São Paulo, más cara y no más cercana).
- **Recomendado: `us-east1`** (o `us-east4`) para todo: Cloud Run, Cloud SQL y Storage en la misma región.
- Ley 1581: alojar fuera de Colombia es **transferencia/transmisión internacional de datos**. EE. UU. figura entre los países con nivel adecuado según la SIC; además se declara en la política de tratamiento y en los términos que acepta la escuela. Validar con abogado antes del lanzamiento.

---

## 4. Costo mensual estimado (MVP, pocas escuelas)

| Servicio | Aproximado |
|---|---|
| Cloud SQL PostgreSQL (instancia compartida pequeña, sin alta disponibilidad, backups) | USD 10–30 |
| App Hosting / Cloud Run (escala a cero; +USD 10–20 si se deja 1 instancia mínima) | USD 0–20 |
| Firebase Auth (email + Google) | USD 0 |
| FCM | USD 0 |
| Cloud Storage | < USD 1 |
| Cloud Scheduler (pocos jobs) | ≈ USD 0 |
| Secret Manager | < USD 1 |
| Resend (email) | USD 0 en plan gratis inicial |
| **Total** | **≈ USD 15–50 / mes** |

Comparado con Vercel + Neon (≈ USD 0 al inicio): Google cuesta algo más desde el día uno, sobre todo por Cloud SQL. A cambio: todo en un solo proveedor, una sola consola, facturación unificada y escalamiento sin cambiar de plataforma.

**Créditos:** aplicar al programa **Google for Startups Cloud** (créditos en Google Cloud/Firebase para startups en etapa temprana) para cubrir el primer año.

---

## 5. Arquitectura resultante

```
                  Usuarios (PWA en celular / navegador)
                              │
          Firebase Auth ◄─────┤ (login, Google, verificación email)
                              ▼
          Firebase App Hosting  →  Next.js en Cloud Run (us-east1)
            │  verifica cookie de sesión de Firebase
            │  fija app.school_id por transacción → RLS
            ├──► Cloud SQL PostgreSQL (Drizzle)
            ├──► Cloud Storage (archivos)
            ├──► Secret Manager / KMS (llaves Wompi cifradas)
            ├──► FCM (push)  ·  Resend (email)
            ◄─── Webhooks Wompi (pagos de acudientes y suscripciones)
            ◄─── Cloud Scheduler (jobs diarios/mensuales)
```

Cambios frente a la sección 6 de [`PLAN.md`](PLAN.md):
| Antes | Ahora |
|---|---|
| Vercel | Firebase App Hosting (Cloud Run) |
| Neon / Supabase | Cloud SQL PostgreSQL |
| Better Auth / Auth.js | Firebase Authentication |
| Vercel Cron | Cloud Scheduler |
| R2 / Supabase Storage | Cloud Storage |
| Web Push genérico | FCM |
| Sin cambios | Next.js, Drizzle, RLS, Wompi, Resend, estructura del proyecto |

---

## 6. Riesgos y mitigación
| Riesgo | Mitigación |
|---|---|
| Dependencia de Google | App en contenedor, PostgreSQL estándar, interfaces `PaymentProvider`/`Notifier`/`Storage`; solo Auth queda más atado (exportable) |
| Costos que se disparan | Alertas de presupuesto en Google Cloud desde el día 1; escalar a cero; revisar mensualmente |
| Cold starts afectan la toma de asistencia | 1 instancia mínima en horarios de clase o desde que haya clientes pagos; la asistencia funciona offline de todas formas |
| Conexiones a Cloud SQL desde Cloud Run | Usar el conector de Cloud SQL y un pool pequeño; PgBouncer/Managed Connection Pooling si crece |
| Complejidad de IAM para un solo dev | Un proyecto por entorno (`podium-dev`, `podium-prod`), cuentas de servicio mínimas, todo en Terraform o scripts `gcloud` versionados |

---

## 7. Siguientes pasos si se aprueba
1. Crear proyectos `podium-dev` y `podium-prod` en Google Cloud + Firebase, con alertas de presupuesto.
2. Solicitar créditos de Google for Startups.
3. Actualizar [`PLAN.md`](PLAN.md) (sección 6) con esta arquitectura.
4. Proyecto base Next.js + Firebase Auth + Drizzle/Cloud SQL + App Hosting (semanas 1–2 del MVP).
