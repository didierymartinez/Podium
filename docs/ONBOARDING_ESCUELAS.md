# Alta de escuelas (onboarding) — administrado por Podium

> En el MVP **no hay registro autónomo**. Tú, como **super admin de Podium**, creas cada escuela desde una consola interna. Es lo correcto al inicio: pocas escuelas, acompañamiento cercano, control de quién entra y cero desarrollo de pagos de suscripción automáticos.

---

## 1. Visión general del flujo

```
 Escuela interesada (WhatsApp / referido / demo)
        │
        ▼
 [1] Solicitud registrada en la consola  ── estado: PROSPECTO
        │  demo, acuerdo de precio, envío de contrato y autorización de datos
        ▼
 [2] Creas la escuela (tenant)            ── estado: CONFIGURANDO
        │  slug, datos legales, plan, admin principal
        ▼
 [3] Invitación al administrador de la escuela (email con link mágico)
        │
        ▼
 [4] Asistente de configuración (lo hace la escuela, o tú en sesión con ellos)
        │  tarifas, días de corte, grupos, profesores, Wompi
        ▼
 [5] Importación de alumnos y acudientes (Excel)
        │
        ▼
 [6] Checklist de salida en vivo → ACTIVA
        │  se invita a profesores y acudientes
        ▼
 [7] Operación y cobro mensual de la suscripción
        │
        ├─► SUSPENDIDA (mora con Podium)  ─► ACTIVA (al pagar)
        └─► CANCELADA (retención 90 días → exportación → borrado)
```

---

## 2. Estados de una escuela

| Estado | Qué significa | Acceso de la escuela |
|---|---|---|
| `PROSPECTO` | Lead registrado, aún sin cuenta | Ninguno |
| `CONFIGURANDO` | Cuenta creada, montando datos | Solo administradores de la escuela; **no** se generan cobros ni se envían avisos a acudientes |
| `PRUEBA` (opcional) | Uso real con fecha fin de prueba | Completo |
| `ACTIVA` | Operando y al día con Podium | Completo |
| `SUSPENDIDA` | Mora con Podium (p. ej. +15 días) | **Solo lectura** para el admin; profesores y acudientes ven aviso. **Los pagos de acudientes siguen entrando** (nunca bloquear el recaudo de la escuela) |
| `CANCELADA` | Terminó la relación | Sin acceso; datos retenidos 90 días para exportar, luego borrado/anonimización |

Cada cambio de estado queda en `AuditLog` (quién, cuándo, motivo).

---

## 3. Paso a paso

### [1] Prospecto
Formulario mínimo en la consola: nombre de la escuela, ciudad, contacto (nombre, celular, email), número aproximado de alumnos, cómo llegó, notas.
Opcional (más adelante): formulario público "Solicitar demo" en la landing que crea el prospecto automáticamente.

### [2] Crear la escuela — formulario del super admin
| Campo | Ejemplo | Notas |
|---|---|---|
| Nombre comercial | Club Patín Veloz | |
| **Slug** (URL) | `patinveloz` → `podium.app/patinveloz` | Único, minúsculas, sin espacios; validado en vivo |
| Razón social / persona natural | Club Deportivo Patín Veloz | |
| Tipo y número de documento | NIT 901.234.567-8 / CC | Validar dígito de verificación del NIT |
| Ciudad / departamento | Medellín, Antioquia | |
| Deporte(s) y modalidades | Patinaje: velocidad | Carga la **plantilla de patinaje** (niveles, categorías por edad, pruebas) |
| Plan de suscripción | Básico (hasta 80 alumnos) | Define límite de alumnos activos |
| Precio pactado y día de cobro | $ 120.000 / mes, día 5 | Permite precio especial para pilotos |
| Fecha de prueba (si aplica) | 30 días | |
| **Administrador principal** | Nombre, email, celular | Recibe la invitación |

Al guardar, el sistema en **una transacción**:
1. Crea `School` en estado `CONFIGURANDO`, su `Venue` única y la configuración por defecto (COP, `America/Bogota`, día de generación 1, vencimiento 10).
2. Copia la plantilla del deporte (niveles, categorías, pruebas) a la escuela — copia editable, no referencia.
3. Crea (o reutiliza si ya existe ese email) el `User` y su `Membership` con rol `SCHOOL_ADMIN`.
4. Crea la `Subscription` de la escuela con Podium.
5. Envía la invitación y registra todo en `AuditLog`.

### [3] Invitación al administrador
- Email (y luego WhatsApp) con **link mágico de un solo uso** que vence en 72 h; puedes reenviarlo desde la consola.
- Al entrar: define contraseña, acepta **términos del servicio** y el **contrato de transmisión de datos** (Podium es *encargado* del tratamiento; la escuela es *responsable* ante la Ley 1581). La aceptación se guarda con fecha, IP y versión del documento.

### [4] Asistente de configuración (dentro de la app de la escuela)
Pasos con barra de progreso; se puede pausar y retomar:
1. **Perfil**: logo, colores, teléfono, dirección de la pista.
2. **Cobros**: tarifas mensuales, matrícula, día de generación/vencimiento, recargo por mora, descuento por hermanos, política de ingreso a mitad de mes.
3. **Pagos en línea**: llaves de **la cuenta Wompi de la escuela** (pública, privada, secreto de eventos) → botón "Probar conexión". Las llaves privadas se guardan **cifradas**. Se puede omitir y operar solo con pagos manuales.
4. **Niveles y categorías**: revisar la plantilla de patinaje y ajustar.
5. **Profesores**: nombre, email, celular → invitación.
6. **Grupos y horarios**: nivel, profesor, cupo, días y horas.

### [5] Importación de alumnos
- Descargar **plantilla Excel** (alumno, documento, fecha de nacimiento, acudiente, celular, email, grupo, tarifa, descuento, saldo pendiente inicial).
- Subir → **vista previa con validaciones** (documentos duplicados, emails inválidos, grupo inexistente) → confirmar.
- Los **saldos iniciales** se cargan como un cobro "Saldo anterior" para que la cartera arranque cuadrada.
- Hermanos se detectan por el mismo acudiente (documento/celular).

### [6] Checklist de salida en vivo
La consola muestra a ti y al admin de la escuela:
- [ ] Al menos una tarifa y un grupo con horario
- [ ] Alumnos importados y asignados a grupo
- [ ] Profesores invitados (y al menos uno activo)
- [ ] Wompi conectado **o** decisión explícita de solo pagos manuales
- [ ] Términos y contrato de datos aceptados
- [ ] Mes de inicio de facturación definido

Al pasar a `ACTIVA`: se envían las invitaciones a acudientes, arranca la generación de sesiones y la facturación mensual desde el mes elegido.

### [7] Suscripción de la escuela con Podium (MVP manual)
- Un job mensual crea la **factura de suscripción** de cada escuela según su plan/precio pactado.
- La escuela la paga por **link de Wompi de Podium** o transferencia; tú marcas el pago manual en la consola.
- Recordatorios: 3 días antes, el día, y a los 5 días; a los **15 días de mora** pasa a `SUSPENDIDA` (manual o automático, configurable).
- Si supera el límite de alumnos activos del plan: aviso al admin y a ti — **no se bloquea**, se propone subir de plan.

---

## 4. Consola de super admin (`/admin`)

Accesible solo para usuarios con rol `PLATFORM_ADMIN` (tú), con **2FA obligatorio**.

| Pantalla | Contenido |
|---|---|
| **Escuelas** | Lista con estado, plan, alumnos activos, MRR, último ingreso, mora; filtros y búsqueda |
| **Detalle de escuela** | Datos, estado (con acciones: activar, suspender, cancelar), suscripción y pagos, usuarios, checklist de onboarding, auditoría |
| **Nueva escuela** | Formulario del paso [2] |
| **Prospectos** | Embudo simple: nuevo → demo → negociación → creada / perdida |
| **Planes** | Planes de suscripción (nombre, límite de alumnos, precio de lista) |
| **Plantillas de deporte** | Niveles, categorías y pruebas base de patinaje (y futuros deportes) |
| **Facturación Podium** | Facturas de suscripción, pagos, MRR, escuelas en mora |
| **Soporte: "Entrar como"** | Ver la app como el admin de una escuela para dar soporte — **solo lectura por defecto**, con motivo obligatorio, banner visible y registro en auditoría |

---

## 5. Modelo de datos adicional

| Entidad | Campos clave |
|---|---|
| `School` | slug (único), nombre, razón social, tipo/número de documento, ciudad, **status**, trial_ends_at, activated_at, settings (JSON: moneda, zona horaria, días de corte, mora…) |
| `SchoolLead` | nombre, contacto, alumnos estimados, fuente, etapa, notas, school_id (cuando se convierte) |
| `Plan` | nombre, max_alumnos_activos, precio_lista |
| `Subscription` | school_id, plan_id, precio_pactado, día_cobro, estado |
| `PlatformInvoice` / `PlatformPayment` | facturas y pagos de la escuela a Podium |
| `PaymentProviderAccount` | school_id, proveedor (`wompi`), llaves **cifradas**, modo (prueba/producción), verificado_at |
| `Invitation` | email, school_id, rol, token (hash), expira_at, aceptada_at |
| `LegalAcceptance` | user_id, school_id, documento, versión, fecha, IP |
| `Membership` | user_id, school_id (nulo para `PLATFORM_ADMIN`), roles[] |

Regla: **todas** las tablas de negocio tienen `school_id` y RLS. La consola de super admin usa una conexión/rol de base de datos aparte que puede saltar RLS, y **solo** esa consola.

---

## 6. Validación del flujo (riesgos y cómo se cubren)

| Riesgo | Cubierto por |
|---|---|
| Datos de una escuela visibles en otra | `school_id` + RLS en Postgres, pruebas automáticas de aislamiento |
| Podium recaudando dinero de terceros (implicaciones legales/tributarias) | Cada escuela conecta **su propia** cuenta Wompi; Podium solo recauda su suscripción |
| Escuela en mora con Podium deja de recaudar → peor para ambos | Suspensión = solo lectura del admin, pero los pagos de acudientes siguen entrando |
| Protección de datos de menores | Contrato de transmisión, aceptación versionada, cifrado de datos sensibles, borrado tras cancelación |
| Arranque con cartera descuadrada | Importación de saldos iniciales como "Saldo anterior" |
| Tú como único soporte | Asistente + plantilla Excel + checklist reducen tu tiempo por escuela; "Entrar como" para soporte rápido |
| Crecimiento (muchas escuelas) | El mismo flujo se expone como self-service en Fase 3: el formulario del paso [2] se vuelve público y la suscripción se cobra automáticamente |

**Tiempo estimado por escuela:** 1 sesión de 60–90 min contigo (pasos 2–6) si la escuela trae su Excel de alumnos.
