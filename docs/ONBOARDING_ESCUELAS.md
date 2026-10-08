# Registro de escuelas (self-service)

> **Cualquier persona crea su escuela sola**, sin intervención de Podium: se registra, verifica su correo, crea la escuela, la configura con un asistente y empieza una **prueba gratis**. Al terminar la prueba elige plan y paga en línea.
> El super admin de Podium **no aprueba ni configura nada**; solo supervisa métricas, atiende soporte y actúa ante abusos.

---

## 1. Flujo completo

```
 Landing (podium.app) ── "Crea tu escuela gratis"
        │
        ▼
 [1] Crear cuenta: nombre, email, celular, contraseña (o Google)
        │  + aceptar términos y política de datos  + captcha
        ▼
 [2] Verificar email (código de 6 dígitos)
        │
        ▼
 [3] Crear escuela: nombre, URL (slug), ciudad, deporte/modalidad,
        │  nº aproximado de alumnos           ── estado: PRUEBA (30 días)
        ▼
 [4] Asistente de configuración (se puede saltar y retomar)
        │  perfil · cobros · grupos · profesores · alumnos (Excel) · Wompi
        ▼
 [5] Uso real durante la prueba (todas las funciones)
        │  correos guía días 1, 3, 7, 20, 27
        ▼
 [6] Elegir plan y pagar la suscripción (tarjeta / PSE / Nequi)
        │
        ├─► ACTIVA ──(pago mensual)──► ACTIVA
        │      └─ falla el pago → EN_MORA (gracia 7 días) → SOLO_LECTURA
        └─ no paga al fin de la prueba → SOLO_LECTURA → (60 días) → CANCELADA
```

---

## 2. Paso a paso

### [1] Crear cuenta (`/registro`)
| Campo | Notas |
|---|---|
| Nombre completo | |
| Email | Único en la plataforma |
| Celular | Formato colombiano (+57); se usa para WhatsApp más adelante |
| Contraseña | Mín. 8 caracteres; alternativa: **Continuar con Google** |
| ☐ Acepto términos del servicio y política de tratamiento de datos | Obligatorio; se guarda versión, fecha e IP |

Protección anti-abuso: **Cloudflare Turnstile** (captcha invisible), límite de registros por IP, bloqueo de dominios de email desechables.

### [2] Verificar email
Código de 6 dígitos (vence en 15 min, reenviable). Sin email verificado no se puede crear la escuela. Si entra con Google, el email ya viene verificado.

### [3] Crear escuela (`/nueva-escuela`)
Una sola pantalla, 30 segundos:

| Campo | Ejemplo | Notas |
|---|---|---|
| Nombre de la escuela | Club Patín Veloz | |
| URL | `podium.app/patinveloz` | Se sugiere a partir del nombre; validación de disponibilidad en vivo; palabras reservadas bloqueadas (`admin`, `api`, `registro`…) |
| Ciudad | Medellín | Lista de municipios de Colombia |
| Deporte y modalidad | Patinaje · velocidad | Carga la **plantilla de patinaje** (niveles, categorías por edad, pruebas) |
| ¿Cuántos alumnos tiene? | 50–100 | Para sugerir plan y segmentar; no limita la prueba |

Al guardar, en **una transacción**:
1. Crea `School` en estado `PRUEBA` con `trial_ends_at = hoy + 30 días`, una `Venue` y configuración por defecto (COP, `America/Bogota`, generación día 1, vencimiento día 10).
2. Copia la plantilla del deporte a la escuela (copia editable).
3. Crea `Membership` del usuario con rol `SCHOOL_ADMIN` (**propietario**).
4. Crea `Subscription` en estado `TRIALING`.
5. Registra en `AuditLog` y avisa al super admin (solo notificación, no aprobación).

Los **datos legales** (razón social, NIT) **no se piden aquí** para no frenar el registro; se piden al pagar la suscripción.

Un mismo usuario puede crear o pertenecer a **varias escuelas** y cambiar entre ellas.

### [4] Asistente de configuración
Lista de pasos con progreso visible en el inicio ("Tu escuela está 60 % lista"). Todo es opcional y se puede retomar:
1. **Perfil**: logo, colores, teléfono, dirección de la pista.
2. **Cobros**: tarifas mensuales, matrícula, días de generación/vencimiento, mora, descuento por hermanos, ingreso a mitad de mes.
3. **Grupos y horarios**: nivel, profesor, cupo, días y horas.
4. **Profesores**: invitar por email/celular.
5. **Alumnos**: crear uno a uno o **importar Excel** (plantilla descargable, vista previa con errores, saldos iniciales como "Saldo anterior").
6. **Pagos en línea**: conectar **su propia cuenta Wompi** (llaves cifradas, botón "Probar conexión"). Opcional: puede operar solo con pagos manuales.
7. **Activar comunicaciones con acudientes**: botón explícito "Invitar acudientes y empezar a facturar desde [mes]".

**Datos de ejemplo:** al crear la escuela se ofrece "Explorar con datos de ejemplo" (alumnos y grupos ficticios marcados como demo, borrables con un clic) para que entiendan la app antes de cargar lo real.

### [5] Durante la prueba
- Funcionalidad completa, sin tarjeta.
- Mientras el paso 7 no se active, **no se envían correos a acudientes ni se generan cobros reales** (evita spam desde cuentas de prueba).
- Banner "Te quedan N días de prueba · Elegir plan".
- Correos automáticos de acompañamiento (onboarding por email) los días 1, 3, 7, 20 y 27 con lo que le falta configurar.

### [6] Elegir plan y pagar
Pantalla `/[slug]/suscripcion`:
- Planes por **alumnos activos** (p. ej. hasta 50 / 150 / 400 / ilimitado), mensual o anual con descuento.
- Pide **datos de facturación**: razón social o nombre, NIT/CC, dirección, email de facturación.
- Medios:
  - **Tarjeta** → se tokeniza en Wompi (*payment source*) y Podium la **cobra automáticamente cada mes**.
  - **PSE / Nequi / Bancolombia** → no permiten débito automático: cada mes se envía un **link de pago** con recordatorios.
- Cobro confirmado por **webhook** → estado `ACTIVA`, recibo por email.

**Implementación (#21):** planes en `src/modules/subscription/plans.ts` — Semilla (hasta 50), Club (150), Academia (400) y Élite (ilimitado); anual = 10 mensualidades. **Los precios son provisionales hasta que el dueño los confirme.** La cuenta Wompi de Podium se configura con `PODIUM_WOMPI_*` y su webhook apunta a `/api/webhooks/podium`. La tarjeta se tokeniza en el navegador directamente con Wompi (los datos no pasan por Podium) y se guarda como *payment source*; la tarea diaria cobra la renovación el último día del periodo y reintenta los días 1, 3 y 5 de mora.

---

## 3. Estados de la escuela

| Estado | Qué pasa | Acceso |
|---|---|---|
| `PRUEBA` | 30 días gratis | Completo (sin envíos a acudientes hasta activar comunicaciones) |
| `ACTIVA` | Suscripción al día | Completo |
| `EN_MORA` | Falló el cobro o no pagó el link; **7 días de gracia**, reintentos de cobro días 1, 3 y 5 | Completo + banner de aviso |
| `SOLO_LECTURA` | Prueba vencida sin pagar o mora superada | Admin puede consultar y **exportar**, no crear ni editar. **Los pagos de acudientes siguen entrando** y se registran |
| `CANCELADA` | 60 días en solo lectura, o el propietario cancela | Sin acceso; datos retenidos 90 días y luego borrados/anonimizados |

Transiciones automáticas por un **job diario**; cada cambio va a `AuditLog` y se notifica por email al propietario.

**Límite de alumnos del plan:** al superarlo se avisa y se ofrece subir de plan; tras 7 días se **cambia de plan automáticamente** en el siguiente cobro (nunca se bloquea la operación).

**Cancelación por el propietario:** desde configuración, con encuesta corta de motivo y botón de exportar datos (Excel/ZIP).

---

## 4. Roles dentro de la escuela

| Rol | Quién | Puede |
|---|---|---|
| **Propietario** | Quien creó la escuela (transferible) | Todo, incluida suscripción, Wompi, eliminar escuela |
| Administrador | Invitado por el propietario | Todo excepto suscripción y eliminar escuela |
| Coordinador / Profesor / Acudiente / Alumno | Invitados | Según [`PLAN.md`](PLAN.md#2-roles-y-permisos) |

---

## 5. Rol del super admin de Podium (sin administrar registros)

Consola `/admin`, solo para `PLATFORM_ADMIN`, 2FA obligatorio. **No hay aprobaciones manuales.**

| Pantalla | Para qué |
|---|---|
| Métricas | Registros/día, escuelas en prueba, conversión prueba → pago, MRR, churn, % configuración completada |
| Escuelas | Búsqueda y detalle (estado, plan, uso, pagos, auditoría) |
| Acciones excepcionales | Extender prueba, aplicar descuento/cupón, suspender por abuso, reactivar |
| Soporte "Entrar como" | Solo lectura por defecto, motivo obligatorio, banner visible, auditado |
| Planes, cupones y plantillas de deporte | Configuración del catálogo |

---

## 6. Modelo de datos adicional

| Entidad | Campos clave |
|---|---|
| `User` | nombre, email (único), email_verified_at, celular, password_hash / proveedor OAuth |
| `School` | slug (único), nombre, ciudad, **status**, trial_ends_at, owner_user_id, onboarding (JSON de pasos completados), comms_enabled_at, settings (JSON) |
| `BillingProfile` | school_id, razón social, tipo/número de documento, dirección, email de facturación |
| `Plan` | nombre, max_alumnos_activos, precio_mensual, precio_anual |
| `Subscription` | school_id, plan_id, status (`TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED`), periodo actual, método (`card_token` / `payment_link`), wompi_payment_source_id, cupón |
| `PlatformInvoice` / `PlatformPayment` | cobros de Podium a la escuela, intentos, referencia Wompi |
| `Coupon` | código, % o valor, duración |
| `PaymentProviderAccount` | school_id, proveedor `wompi`, llaves **cifradas**, modo, verificado_at |
| `Invitation` | email/celular, school_id, rol, token (hash), expira_at, aceptada_at |
| `LegalAcceptance` | user_id, documento, versión, fecha, IP |
| `Membership` | user_id, school_id, roles[] |

---

## 7. Validación del flujo (riesgos y mitigación)

| Riesgo | Mitigación |
|---|---|
| Registros falsos / bots | Captcha, verificación de email, límite por IP, emails desechables bloqueados |
| Uso de Podium para spam a terceros | Sin envíos a acudientes hasta activar comunicaciones; límites de envío por escuela en prueba; suspensión por abuso |
| Slug ofensivo o suplantación de marca | Lista de palabras reservadas/prohibidas; el super admin puede renombrar o suspender |
| Escuelas abandonadas ocupando datos | Prueba vencida → solo lectura → cancelada → borrado automático |
| Datos de una escuela visibles en otra | `school_id` + Row Level Security + pruebas automáticas de aislamiento |
| Podium recaudando dinero de terceros | Cada escuela conecta **su propia** cuenta Wompi; Podium solo cobra su suscripción |
| Mora con Podium frena el recaudo de la escuela | Ningún estado bloquea los pagos de acudientes |
| Protección de datos de menores (Ley 1581) | Aceptación versionada de términos; la escuela es responsable y Podium encargado; cifrado de datos sensibles; borrado tras cancelación |
| Escuela no logra configurarse sola | Asistente con progreso, datos de ejemplo, plantilla Excel, correos guía, videos cortos y chat de soporte (WhatsApp) |
| Medios sin débito automático (PSE/Nequi) | Link de pago mensual con recordatorios + gracia de 7 días |

---

## 8. Métricas del embudo
Registro → email verificado → escuela creada → asistente ≥ 80 % → primera asistencia tomada → primer cobro a acudientes → **pago de suscripción**.
Meta inicial: ≥ 25 % de escuelas creadas pagan al terminar la prueba.
