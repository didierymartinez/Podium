# Especificación — Mensajes por WhatsApp, anuncios e invitaciones

> Alcance: avisos generales, mensajes específicos (individuales o automáticos) e invitaciones a alumnos y acudientes, con WhatsApp como canal principal y push/email como complemento.
> Complementa [`GESTION_ADMINISTRATIVA.md`](GESTION_ADMINISTRATIVA.md#10-comunicaciones) (ADM-60 a ADM-64).
> Precios y límites de Meta cambian con frecuencia: **verificar la tabla vigente de WhatsApp Business Platform** antes de fijar precios.

---

## 1. Cómo funciona WhatsApp para empresas (lo que condiciona el diseño)

| Regla de Meta | Consecuencia para Podium |
|---|---|
| Escribirle primero a alguien por la API exige una **plantilla aprobada** por Meta | Cada mensaje automático (cobro, invitación, aviso) necesita su plantilla con variables |
| Si la persona escribe, se abre una **ventana de 24 h** para responder con texto libre | Útil para atender respuestas; no sirve para enviar avisos masivos |
| Las plantillas tienen categoría: **utilidad** (transaccional: cobros, recordatorios, cambios de clase), **marketing** (promociones) y **autenticación** (códigos) | Utilidad es barata; marketing cuesta más y exige consentimiento de marketing |
| Se cobra **por mensaje de plantilla entregado**, con tarifa por país y categoría | Costo variable por escuela → incluir un cupo en el plan y cobrar el excedente |
| **Límite diario** de destinatarios nuevos que sube con la verificación del negocio y la calidad | Verificar el negocio en Meta antes de lanzar; envíos masivos en lotes |
| Las **calificaciones de calidad** bajan si la gente bloquea o reporta | Enviar solo lo útil, respetar horarios y permitir "SALIR" |
| Recibos de **entregado / leído** por webhook (si el usuario no los desactivó) | Mostrar "Entregado 78 · Leído 61" en cada aviso |

---

## 2. Estrategia por fases

### Fase MVP — **WhatsApp "manual asistido" (gratis, sin API)**
Las escuelas ya viven en WhatsApp (grupos de padres). En el MVP Podium **prepara** el mensaje y la persona de la escuela lo envía desde su propio WhatsApp:

| Función | Cómo |
|---|---|
| **Invitar** a un acudiente/alumno | Botón "Invitar por WhatsApp" → abre `wa.me/57XXXXXXXXXX?text=…` con el mensaje y el link de invitación listos → el admin toca "Enviar" |
| **Recordatorio de pago individual** | Botón en el cobro/deudor → abre WhatsApp con el texto y el **link de pago** |
| **Aviso a un grupo de WhatsApp** | Botón "Copiar para WhatsApp" (texto con formato `*negrita*` y links) o "Compartir" (Web Share API en el celular) → se pega en el grupo |
| **Envío uno a uno en serie** | Lista de destinatarios con botón "Siguiente" que abre cada chat prellenado (para 10–30 personas) |

✅ Costo cero, sin aprobación de Meta, sale desde el número que las familias ya conocen.
❌ Es manual; no hay confirmación de entrega en Podium (se marca "enviado" al tocar).

### Fase 2 — **WhatsApp automático con la API (número de Podium)**
**WhatsApp Cloud API** de Meta (directo o vía un proveedor como 360dialog o Twilio) con **un número de Podium** que envía en nombre de cada escuela:

- Las plantillas incluyen el nombre de la escuela: *"Club Patín Veloz: la clase de hoy 4 p. m. se cancela por lluvia."*
- Automáticos: invitaciones, cobros, recordatorios, mora, cancelaciones, convocatorias, avisos.
- **Respuestas** al número de Podium: respuesta automática *"Este número solo envía notificaciones de Club Patín Veloz. Escríbeles al 300 123 4567 o toca aquí: wa.me/…"* (bandeja de entrada en F3).

### Fase 3 — **Número propio de la escuela** (plan superior)
- La escuela conecta **su propio número** de WhatsApp Business mediante el registro integrado de Meta (*Embedded Signup*). Podium debe operar como **Tech Provider** de Meta o mediante un proveedor que lo ofrezca.
- **Bandeja de entrada** en Podium: ver y responder conversaciones de las familias dentro de la ventana de 24 h, asignar a coordinador, respuestas rápidas.

---

## 3. Invitaciones a alumnos y acudientes

### 3.1 Quién se invita
| Persona | Cuándo | Se invita a |
|---|---|---|
| Acudiente responsable de pago | Al matricular o después de importar Excel | Pagar, ver hijos, recibir avisos |
| Otros acudientes | Opcional | Ver información deportiva y avisos |
| Alumno ≥ 14 años | Opcional (configurable) | Ver su horario, progreso y competencias |
| Alumno adulto | Siempre | Todo lo suyo, incluidos pagos |
| Profesor | Al crearlo | App del profesor |

### 3.2 Flujo
```
Admin crea/importa persona con celular
        │
        ▼
"Invitar" (individual) o "Invitar a todos los pendientes" (masivo)
        │  canal: WhatsApp (manual MVP / automático F2) · email · copiar link · QR impreso
        ▼
Mensaje: "Hola Ana 👋 Club Patín Veloz te invita a Podium para ver
          las clases y pagos de Sofía y Tomás. Activa tu cuenta aquí:
          podium.app/i/Xk29…  (vence en 7 días)"
        │
        ▼
Abre el link → ve el logo de la escuela y los nombres de sus hijos
        │  confirma celular con código (OTP) si el link se reenvió
        ▼
Crea acceso: contraseña o "Continuar con Google"
        │
        ▼
Acepta autorización de datos (Ley 1581) y, opcional, uso de imagen y mensajes de WhatsApp
        │
        ▼
Revisa/completa datos (EPS, contacto de emergencia) → "Instalar app" (PWA) → activa push
```

### 3.3 Reglas
| ID | Requisito | Prioridad |
|---|---|---|
| COM-01 | Link de invitación único (token aleatorio guardado como hash), vence en 7 días, de un solo uso, reenviable (invalida el anterior) | MVP |
| COM-02 | Estados: `PENDIENTE` → `ENVIADA` → `ABIERTA` → `ACEPTADA` · `EXPIRADA` · `CANCELADA`, visibles en la ficha y en una lista "Invitaciones" | MVP |
| COM-03 | Invitación masiva a todos los pendientes (después de la importación de Excel), con vista previa y conteo | MVP (manual en serie) · F2 (automática) |
| COM-04 | Recordatorio automático a los 3 días si no se aceptó (máx. 2) | F2 |
| COM-05 | Si el celular ya tiene cuenta en Podium (otra escuela u otro hijo) → solo se agrega el vínculo, sin crear otra cuenta | MVP |
| COM-06 | **QR / link general de la escuela** para el día de matrículas: el acudiente se registra y la escuela **aprueba** el vínculo con el alumno | F2 |
| COM-07 | Si el acudiente no tiene celular con WhatsApp → email o link copiado | MVP |
| COM-08 | Tasa de activación visible para el admin ("62 de 80 familias activas") | MVP |

---

## 4. Avisos (anuncios) y mensajes específicos

### 4.1 Tipos de mensaje
| Tipo | Ejemplo | Origen |
|---|---|---|
| **Aviso general** | "El sábado no hay clase por el festival" | Manual: admin/coordinador |
| **Aviso a grupo(s)** | "Grupo Formación: traer casco nuevo desde el lunes" | Manual: admin o profesor (solo sus grupos) |
| **Mensaje individual** | "Ana, Sofía dejó su chaqueta en la pista" | Manual |
| **Automático transaccional** | Cobro generado, recordatorio, pago recibido, clase cancelada, convocatoria, cambio de nivel | Sistema |
| **Promocional** (F3) | "Vacaciones recreativas: inscripciones abiertas" | Manual, solo a quienes aceptaron marketing |

### 4.2 Audiencias
Toda la escuela · grupo(s) · nivel · categoría · modalidad · **deudores** (por edad de la deuda) · convocados a una competencia · alumnos en riesgo · acudientes con invitación pendiente · selección manual.
Se puede elegir enviar a **acudientes**, **alumnos** o **ambos**, y se **deduplica** (un acudiente con 2 hijos en el grupo recibe 1 mensaje).

### 4.3 Redacción y envío
| ID | Requisito | Prioridad |
|---|---|---|
| COM-10 | Editor con **variables** `{nombre_acudiente}`, `{nombre_alumno}`, `{grupo}`, `{valor}`, `{link_pago}`, `{fecha}` y vista previa real | MVP |
| COM-11 | Adjuntar imagen o PDF (circular, afiche) | F2 |
| COM-12 | **Programar** envío (fecha y hora) | F2 |
| COM-13 | **Canal y cascada**: push si tiene la app instalada → WhatsApp → email; o forzar canal | MVP (push/email + WhatsApp manual) · F2 (WhatsApp automático) |
| COM-14 | Antes de enviar: "Se enviará a 54 personas · 48 por WhatsApp (≈ costo) · 6 por email" | F2 |
| COM-15 | Estado por destinatario: enviado, entregado, leído, fallido (con motivo) | F2 |
| COM-16 | Aviso **fijado** en el inicio de la app hasta una fecha | MVP |
| COM-17 | Plantillas propias de la escuela (mensajes frecuentes) | F2 |
| COM-18 | Historial de comunicaciones por persona (qué se le envió y cuándo) | MVP |
| COM-19 | Profesores: avisos solo a sus grupos; opcionalmente requieren aprobación del coordinador | MVP |

### 4.4 Avisos libres por WhatsApp automático (F2)
Meta no permite texto 100 % libre fuera de la ventana de 24 h. Solución:
- Plantilla de utilidad genérica: *"{{escuela}} publicó un aviso para {{grupo}}: {{resumen}}. Léelo completo aquí: {{link}}"*.
- El texto completo vive en Podium (link a la app). Así se cumple la política, se reduce el riesgo de que Meta reclasifique la plantilla como marketing y la app gana uso.
- Avisos promocionales → plantilla de **marketing** solo a quienes dieron consentimiento.

---

## 5. Catálogo de plantillas (F2, a aprobar en Meta)

| Plantilla | Categoría | Texto base |
|---|---|---|
| `invitacion_acudiente` | Utilidad | "Hola {{1}}, {{2}} te invita a Podium para ver clases y pagos de {{3}}. Activa tu cuenta: {{4}}" |
| `invitacion_profesor` | Utilidad | "Hola {{1}}, {{2}} te agregó como profesor en Podium. Activa tu cuenta: {{3}}" |
| `cobro_generado` | Utilidad | "{{1}}: tu cuenta de cobro de {{2}} por {{3}} está lista. Vence el {{4}}. Paga aquí: {{5}}" |
| `recordatorio_vencimiento` | Utilidad | "{{1}}: te recordamos que el {{2}} vence tu pago de {{3}}. Paga aquí: {{4}}" |
| `pago_recibido` | Utilidad | "{{1}}: recibimos tu pago de {{2}}. Recibo: {{3}}. ¡Gracias!" |
| `saldo_vencido` | Utilidad | "{{1}}: tienes un saldo pendiente de {{2}}. Puedes pagar aquí: {{3}} o escribirnos al {{4}}" |
| `clase_cancelada` | Utilidad | "{{1}}: la clase de {{2}} del {{3}} se cancela por {{4}}." |
| `clase_reprogramada` | Utilidad | "{{1}}: la clase de {{2}} pasa al {{3}}." |
| `convocatoria` | Utilidad | "{{1}}: {{2}} fue convocado(a) a {{3}} ({{4}}). Confirma antes del {{5}}: {{6}}" |
| `aviso_general` | Utilidad | "{{1}} publicó un aviso para {{2}}: {{3}}. Léelo aquí: {{4}}" |
| `alerta_ausencias` | Utilidad | "{{1}}: notamos que {{2}} no ha asistido a las últimas {{3}} clases. ¿Todo bien? Escríbenos: {{4}}" |
| `codigo_acceso` | Autenticación | Código OTP de inicio de sesión |

---

## 6. Consentimiento, horarios y cumplimiento

| ID | Regla | Prioridad |
|---|---|---|
| COM-30 | Consentimiento para recibir mensajes por WhatsApp al aceptar la invitación (separado del de marketing) | MVP |
| COM-31 | Baja: responder **"SALIR"** o desactivar en preferencias → no se envían más WhatsApp (salvo que se reactive); se usa push/email | F2 |
| COM-32 | **Horario permitido** para mensajes no urgentes: 7 a. m.–8 p. m.; lo que se envíe fuera queda en cola | MVP |
| COM-33 | **Mensajes de cobro (Ley 2300 de 2023, "Dejen de fregar")**: solo por canales autorizados, de lunes a viernes de 7 a. m. a 7 p. m. y sábados de 8 a. m. a 3 p. m., nunca domingos ni festivos, y con frecuencia limitada por semana y canal. Podium aplica estas restricciones automáticamente a recordatorios de mora. **Validar con abogado** el alcance exacto | MVP |
| COM-34 | Urgentes (cancelación de clase por lluvia del mismo día) se envían de inmediato | MVP |
| COM-35 | Todo envío queda registrado (quién, a quién, cuándo, canal, plantilla, estado) | MVP |

---

## 7. Costos y modelo de cobro (F2)

- Meta cobra por **mensaje de plantilla entregado**; en Colombia, utilidad y autenticación cuestan fracciones de centavo de dólar y marketing es varias veces más caro (verificar la tabla vigente).
- Estimado: escuela de 80 familias × ~6 mensajes de utilidad/mes ≈ 480 mensajes → del orden de **pocos dólares al mes**.
- Propuesta: cada plan de suscripción incluye un **cupo mensual de WhatsApp** (p. ej. 500 / 1.500 / 5.000); el excedente se cobra en la siguiente factura o se pasa a push/email automáticamente al agotarse el cupo.
- Push y email no tienen costo relevante → la cascada (COM-13) prioriza push cuando la familia tiene la app instalada.

---

## 8. Arquitectura

```
Módulo comunicaciones
  ├─ Message (aviso)          audiencia, contenido, canal, programado_para, autor
  ├─ MessageRecipient          persona, canal usado, estado, error, timestamps
  ├─ Invitation                (ver ONBOARDING_ESCUELAS.md)
  ├─ ContactPreference         persona, canal, consentimiento, baja, versión
  └─ Notifier (interfaz)
        ├─ PushNotifier        → FCM
        ├─ EmailNotifier       → Resend
        ├─ WhatsAppLinkNotifier → genera wa.me (MVP, manual)
        └─ WhatsAppCloudNotifier → Meta Cloud API / proveedor (F2)
Job de envío: lotes, respeta horarios (COM-32/33), límites de Meta y reintentos
Webhook /api/webhooks/whatsapp: estados entregado/leído, respuestas entrantes, "SALIR"
```

---

## 9. Resumen por fase

| Fase | Entregable |
|---|---|
| **MVP** | Invitaciones con link (WhatsApp manual por `wa.me`, email, copiar, QR), estados de invitación, avisos por push/email + "copiar para WhatsApp", recordatorios de pago con link por WhatsApp manual, horarios y Ley 2300, historial |
| **F2** | WhatsApp Cloud API con número de Podium, plantillas aprobadas, envíos automáticos y masivos, estados entregado/leído, programación, adjuntos, baja "SALIR", cupo por plan |
| **F3** | Número propio por escuela, bandeja de entrada para responder, mensajes de marketing con consentimiento |
