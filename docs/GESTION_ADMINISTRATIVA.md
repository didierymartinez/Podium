# Especificación — Gestión administrativa

> Alcance: todo lo que la escuela necesita para operar como negocio: personas, matrículas, cobros, pagos, cartera, caja, comunicaciones, cumplimiento y reportes.
> Prioridad: **MVP** (Fase 1), **F2** (Fase 2), **F3** (Fase 3). Complementa [`PLAN.md`](PLAN.md) y [`GESTION_DEPORTIVA.md`](GESTION_DEPORTIVA.md).

---

## 1. Permisos por rol (administrativo)

| Acción | Propietario | Admin | Coordinador | Profesor | Acudiente | Alumno |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Configurar escuela, tarifas, políticas | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Suscripción con Podium, conectar Wompi | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Crear/editar alumnos y acudientes | ✅ | ✅ | ✅ | 👁️ sus grupos | ✏️ datos propios e hijos | 👁️ propio |
| Matricular, congelar, retirar | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver cobros y cartera | ✅ | ✅ | ✅ | ⚙️ solo "al día / en mora" (configurable) | 👁️ sus hijos | ❌ |
| Registrar pagos manuales | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Anular cobros/pagos, notas crédito | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cierre de caja | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Enviar avisos | ✅ | ✅ | ✅ | ✅ sus grupos | ❌ | ❌ |
| Reportes financieros | ✅ | ✅ | ⚙️ | ❌ | ❌ | ❌ |
| Gestionar profesores y usuarios | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

✅ total · ✏️ editar limitado · 👁️ solo lectura · ⚙️ configurable · ❌ sin acceso

---

## 2. Configuración de la escuela

| ID | Requisito | Prioridad |
|---|---|---|
| ADM-01 | Datos de la escuela: nombre, logo, colores, NIT/CC, dirección, teléfono, redes, régimen tributario | MVP |
| ADM-02 | Sede única (pista): nombre, dirección, ubicación en mapa | MVP |
| ADM-03 | **Calendario**: festivos de Colombia precargados (incluye traslados de Ley Emiliani), vacaciones de la escuela (p. ej. diciembre–enero), días sin clase | MVP |
| ADM-04 | **Política de cobro**: día de generación (1–28), día de vencimiento, recargo por mora (fijo o %; una vez o mensual), política de ingreso a mitad de mes, días de gracia | MVP |
| ADM-05 | **Política de mora**: a partir de cuántos días se marca "en mora"; acciones opcionales (aviso al profesor, bloqueo de convocatorias, bloqueo de asistencia — desactivado por defecto) | MVP |
| ADM-06 | Numeración consecutiva de recibos de caja y cuentas de cobro con prefijo configurable (`RC-0001`, `CC-0001`) | MVP |
| ADM-07 | Plantillas de mensajes (recordatorio, mora, bienvenida) con variables `{acudiente}`, `{valor}`, `{link_pago}` | F2 |
| ADM-08 | Multi-sede | F3 |

---

## 3. Personas

### 3.1 Alumno
| Grupo | Campos | Obligatorio |
|---|---|---|
| Identificación | Nombres, apellidos, tipo documento (RC, TI, CC, CE, PPT, pasaporte), número, fecha de nacimiento, sexo, foto | Nombres, apellidos, fecha nacimiento |
| Contacto | Celular y email propios (si es mayor de 14 o adulto), dirección, barrio, ciudad | — |
| Salud | EPS, tipo de sangre, alergias, condiciones médicas, medicamentos, contacto de emergencia | EPS y contacto de emergencia (configurable) |
| Escolar | Colegio, jornada (para armar horarios) | — |
| Tallas | Camiseta, licra/uniforme, número de patín | — |
| Interno | Fecha de ingreso, cómo nos conoció, observaciones | — |

Reglas:
- Documento **único por escuela**; si ya existe, se ofrece reactivar al alumno retirado en vez de duplicar.
- La **edad y la categoría** se calculan automáticamente (ver [`GESTION_DEPORTIVA.md`](GESTION_DEPORTIVA.md#2-estructura-deportiva)).
- Datos de salud: visibles solo para admin/coordinador y profesores de sus grupos; **cifrados** en base de datos.
- Menor de edad sin acudiente vinculado → no se puede matricular.

### 3.2 Acudiente
- Nombres, documento, celular (obligatorio), email, parentesco (madre, padre, tutor, otro), dirección, ocupación (opcional).
- Un acudiente puede tener **varios alumnos**; un alumno puede tener **varios acudientes**.
- Exactamente **un responsable de pago** por alumno (recibe los cobros). Los demás acudientes ven información deportiva y avisos.
- Datos de facturación opcionales (nombre/NIT diferente) para recibos.
- Alumno adulto = su propio responsable de pago.

### 3.3 Profesor (empleado)
- Datos personales, documento, celular, email, foto, especialidad/modalidad, certificaciones (con vencimiento: primeros auxilios, curso de entrenador).
- Fecha de vinculación, tipo de contrato (informativo), estado (activo/inactivo).
- Grupos asignados (titular / auxiliar).
- **No** se calcula nómina en el MVP; reporte informativo de horas dictadas (F2).

### 3.4 Usuarios e invitaciones
- Acudientes, profesores y alumnos acceden por **invitación** (email o link por WhatsApp) — ver [`ONBOARDING_ESCUELAS.md`](ONBOARDING_ESCUELAS.md).
- Un mismo usuario puede tener varios roles (profesor que además es acudiente).
- Desactivar usuario conserva su historial.

---

## 4. Matrículas

### 4.1 Estados
```
PREINSCRITO ──► ACTIVO ──► CONGELADO ──► ACTIVO
     │            │                        
     └──► DESCARTADO   └──► RETIRADO ──► ACTIVO (re-ingreso)
```

| Estado | Significado | ¿Genera mensualidad? | ¿Aparece en asistencia? |
|---|---|:-:|:-:|
| `PREINSCRITO` | Interesado / clase de prueba | No | Sí, marcado "prueba" |
| `ACTIVO` | Matriculado | Sí | Sí |
| `CONGELADO` | Pausa temporal (lesión, viaje) con fecha de regreso | No | No |
| `RETIRADO` | Se fue; motivo obligatorio | No | No |
| `DESCARTADO` | Prospecto que no se matriculó | No | No |

### 4.2 Requisitos
| ID | Requisito | Prioridad |
|---|---|---|
| ADM-10 | Matricular: alumno + grupo + **tarifa** + fecha de inicio + descuentos aplicables | MVP |
| ADM-11 | Validar **cupo** del grupo (permitir sobrecupo con confirmación) y advertir si la categoría/edad no coincide con el grupo | MVP |
| ADM-12 | Cobrar **matrícula** (concepto aparte) al matricular, configurable por escuela y por año | MVP |
| ADM-13 | **Congelar** con fechas desde/hasta; vuelve a `ACTIVO` automáticamente al cumplirse | MVP |
| ADM-14 | **Retirar** con motivo (económico, horario, cambio de deporte, lesión, insatisfacción, mudanza, otro) y comentario; se ofrece revisar saldo pendiente | MVP |
| ADM-15 | **Traslado de grupo** (p. ej. por promoción de nivel) sin perder historial; si cambia la tarifa, aplica desde el siguiente periodo | MVP |
| ADM-16 | Un alumno puede estar en **más de un grupo** (p. ej. velocidad + artístico), cada matrícula con su tarifa | MVP |
| ADM-17 | **Documentos requeridos** por matrícula (consentimiento informado, certificado médico, autorización de imagen): estado pendiente/recibido/vencido, carga de archivo, alertas 30 días antes del vencimiento | MVP |
| ADM-18 | **Re-matrícula anual**: al iniciar el año, generar cobro de matrícula y pedir actualización de datos a acudientes | F2 |
| ADM-19 | Formulario público de **pre-inscripción** (link de la escuela) con agendamiento de clase de prueba | F3 |

---

## 5. Tarifas y conceptos de cobro

| Concepto | Tipo | Ejemplo |
|---|---|---|
| Mensualidad | Recurrente (por matrícula) | Iniciación 3 días/sem: $120.000 · Competencia 5 días/sem: $180.000 |
| Matrícula | Único (anual) | $80.000 |
| Inscripción a competencia | Único (desde convocatoria) | Valor del evento |
| Uniforme / implementos | Único (venta) | Licra $90.000 |
| Evento / salida | Único | Campamento $250.000 |
| Saldo anterior | Único (importación) | Deuda previa a Podium |
| Recargo por mora | Automático | $10.000 o 5 % |

**Descuentos** (se pueden combinar; orden de aplicación fijo):
1. **Beca** (% o valor, con fecha fin y motivo) — sobre el valor de la tarifa.
2. **Hermanos** (% desde el 2.º hijo del mismo responsable de pago, configurable 2.º / 3.º+).
3. **Pronto pago** (% o valor si paga hasta el día X) — se calcula al momento del pago, no al generar.
- Tope: el cobro nunca queda negativo; descuento total máximo configurable (p. ej. 100 % solo becas).

---

## 6. Facturación mensual (cuentas de cobro)

### 6.1 Proceso automático
Job diario; el día de generación configurado:
1. Toma todas las matrículas `ACTIVO` del periodo (excluye congeladas en todo el mes).
2. Calcula el valor de cada matrícula: tarifa − beca − hermanos (+ proporcional si aplica).
3. **Agrupa por responsable de pago**: una cuenta de cobro por acudiente con una línea por alumno/matrícula.
4. Asigna número consecutivo, fecha de vencimiento y genera el **link de pago** (si Wompi está conectado).
5. Aplica automáticamente **saldo a favor** existente.
6. Notifica al acudiente (email/push; WhatsApp F2).

Idempotente: correrlo dos veces el mismo mes no duplica cobros (clave única `matrícula + periodo`).

### 6.2 Ejemplo
Acudiente Laura con 2 hijos, política: hermanos 10 %, mora $10.000 al día 11, pronto pago 5 % hasta el día 5.

| Línea | Tarifa | Beca | Hermanos | Valor |
|---|---|---|---|---|
| Sofía — Competencia | $180.000 | — | — | $180.000 |
| Tomás — Iniciación | $120.000 | — | −$12.000 | $108.000 |
| **Total cuenta de cobro CC-0153** | | | | **$288.000** |

- Paga el día 4 → pronto pago 5 % → paga **$273.600**.
- Paga el día 15 → se suma recargo **$10.000** → **$298.000**.

### 6.3 Ingreso a mitad de mes (configurable)
- **Mes completo**, **proporcional** (por días calendario restantes) o **desde el mes siguiente** (el mes en curso gratis o cubierto por la matrícula).

### 6.4 Estados de una cuenta de cobro
`PENDIENTE` → `PARCIAL` → `PAGADA` · `VENCIDA` (pendiente/parcial pasada la fecha) · `ANULADA` (con motivo, solo admin).

### 6.5 Requisitos
| ID | Requisito | Prioridad |
|---|---|---|
| ADM-20 | Generación automática mensual según 6.1 | MVP |
| ADM-21 | Cobros **manuales/únicos** (uniforme, evento) a uno o varios alumnos a la vez | MVP |
| ADM-22 | Vista previa del mes antes de generar ("se generarán 84 cobros por $11.340.000") y regeneración de un cobro individual si se corrigió la matrícula | MVP |
| ADM-23 | **Recargo por mora** automático según política | MVP |
| ADM-24 | **Notas crédito** / ajustes con motivo (no se edita un cobro emitido; se anula o se ajusta) | MVP |
| ADM-25 | Cuenta de cobro en **PDF** con logo, detalle y link/QR de pago | MVP |
| ADM-26 | Facturación electrónica DIAN vía proveedor (Alegra/Siigo) para escuelas obligadas a facturar | F3 |

---

## 7. Pagos

### 7.1 Pago en línea (Wompi de la escuela)
1. Acudiente abre la app o el link del cobro → "Pagar" → checkout Wompi (PSE, tarjeta, Nequi, Bancolombia).
2. Wompi notifica por **webhook** (firma verificada con el secreto de eventos) → se crea el `Payment` y se aplica.
3. Recibo automático por email/push. Si el webhook se demora, el acudiente ve "pago en verificación".
4. Conciliación diaria: consulta a Wompi de transacciones del día para recuperar webhooks perdidos.

### 7.2 Pago manual
- Registrado por admin/coordinador: valor, fecha, medio (efectivo, transferencia, consignación, datáfono), referencia, **foto del soporte**, acudiente y cobros a los que aplica.
- Genera **recibo de caja** consecutivo (PDF, envío por WhatsApp/email).
- F2: el acudiente puede **reportar** una transferencia subiendo el comprobante → queda `POR_VERIFICAR` hasta que la escuela lo apruebe.

### 7.3 Aplicación de pagos
- Por defecto, al cobro **más antiguo primero**; el usuario puede elegir manualmente a qué cobros aplicar.
- Pago mayor a lo adeudado → **saldo a favor** del acudiente, aplicado automáticamente a próximos cobros.
- Pagos parciales permitidos (configurable en línea: Wompi cobra el valor total del cobro; abonos solo manuales).

### 7.4 Anulación
Solo admin, con motivo; revierte la aplicación y deja el cobro nuevamente pendiente. Nunca se borra: queda en auditoría.

| ID | Requisito | Prioridad |
|---|---|---|
| ADM-30 | Pago en línea con Wompi + webhook + recibo | MVP |
| ADM-31 | Pago manual con soporte y recibo de caja | MVP |
| ADM-32 | Aplicación automática/manual, saldo a favor | MVP |
| ADM-33 | Conciliación diaria con Wompi | MVP |
| ADM-34 | Reporte de transferencia por el acudiente con verificación | F2 |
| ADM-35 | Pago de varios cobros/hijos en una sola transacción | MVP |

---

## 8. Cartera

| ID | Requisito | Prioridad |
|---|---|---|
| ADM-40 | **Estado de cuenta** por acudiente y por alumno: cobros, pagos, saldo, saldo a favor; PDF descargable | MVP |
| ADM-41 | **Cartera por edades**: corriente, 1–30, 31–60, 61–90, +90 días; total y por acudiente | MVP |
| ADM-42 | Lista de **deudores** con filtros (grupo, edad de deuda, valor) y acción masiva "enviar recordatorio" | MVP |
| ADM-43 | Indicador "al día / en mora" visible en la ficha del alumno y (si se permite) en la lista de asistencia del profesor | MVP |
| ADM-44 | **Bitácora de gestión de cobro**: llamadas, mensajes, compromisos de pago con fecha (recordatorio al vencer el compromiso) | F2 |
| ADM-45 | **Acuerdos de pago**: dividir una deuda en cuotas con fechas | F2 |
| ADM-46 | **Paz y salvo** en PDF (requerido para retiros, competencias, certificados) | MVP |
| ADM-47 | Castigo de cartera (deuda incobrable) con motivo, sale de los indicadores de cartera activa | F2 |

### Recordatorios automáticos
| Momento | Mensaje |
|---|---|
| Al generar | "Tu cuenta de cobro de octubre está lista: $288.000 · Paga aquí" |
| 2 días antes del vencimiento | Recordatorio + beneficio de pronto pago si aplica |
| Día de vencimiento | "Hoy vence…" |
| +3, +10, +30 días | Mensajes de mora escalonados (tono configurable) |
| Saldo +60 días | Alerta interna a admin |

---

## 9. Caja

| ID | Requisito | Prioridad |
|---|---|---|
| ADM-50 | **Cierre de caja diario** por usuario: pagos manuales recibidos por medio (efectivo, transferencia, datáfono), total esperado vs. contado, diferencia con observación | F2 |
| ADM-51 | Resumen diario de recaudo (en línea + manual) | MVP |
| ADM-52 | **Egresos** básicos (nómina, arriendo de pista, implementos, transporte) por categoría, para ver utilidad | F3 |
| ADM-53 | Ventas de inventario simple (uniformes, implementos) con stock | F3 |

---

## 10. Comunicaciones

| ID | Requisito | Prioridad |
|---|---|---|
| ADM-60 | **Avisos** a: toda la escuela, uno o varios grupos, una categoría, deudores, individuales | MVP |
| ADM-61 | Canales: push (FCM) y email en MVP; **WhatsApp** (plantillas aprobadas por Meta) en F2 | MVP / F2 |
| ADM-62 | Confirmación de lectura en avisos importantes ("Leído por 54/80") | F2 |
| ADM-63 | Avisos automáticos: cancelación/reprogramación de clase, nuevos cobros, pagos recibidos, convocatorias | MVP |
| ADM-64 | Preferencias de notificación por usuario; respeto de horario (no enviar entre 9 p. m. y 7 a. m.) | MVP |

---

## 11. Cumplimiento y datos personales (Ley 1581)

| ID | Requisito | Prioridad |
|---|---|---|
| ADM-70 | Autorización de tratamiento de datos del acudiente (y del alumno adulto) al aceptar invitación: versión, fecha, IP | MVP |
| ADM-71 | Autorización de **uso de imagen** separada y opcional; si no la hay, la foto no se usa en publicaciones | MVP |
| ADM-72 | Derechos del titular: consultar y exportar sus datos, solicitar corrección o eliminación (con flujo para la escuela) | F2 |
| ADM-73 | Datos de salud cifrados y con acceso restringido | MVP |
| ADM-74 | **Auditoría**: toda creación/edición/anulación de cobros, pagos, matrículas y datos sensibles queda registrada (quién, cuándo, antes/después) | MVP |
| ADM-75 | Exportación completa de datos de la escuela (Excel/ZIP) | MVP |

---

## 12. Reportes y tablero administrativo

### 12.1 Tablero (inicio del admin)
| Indicador | Cálculo |
|---|---|
| Recaudo del mes | Σ pagos del mes |
| % de recaudo | Pagado de los cobros del mes ÷ total facturado del mes |
| Cartera vencida | Σ saldo de cobros vencidos |
| Alumnos activos | Matrículas `ACTIVO` (alumnos únicos) |
| Nuevos / retirados del mes | Altas y retiros en el periodo |
| **Retención** | 1 − (retirados del mes ÷ activos al inicio del mes) |
| Ocupación | Σ inscritos ÷ Σ cupos de grupos activos |
| Ingreso promedio por alumno | Facturado del mes ÷ alumnos activos |
| Pendientes de hoy | Documentos vencidos, pagos por verificar, compromisos de pago que vencen |

### 12.2 Reportes (exportables a Excel/PDF)
| Reporte | Prioridad |
|---|---|
| Facturado vs. recaudado por mes (últimos 12 meses) | MVP |
| Cartera por edades y lista de deudores | MVP |
| Pagos por medio y por fecha (conciliación) | MVP |
| Alumnos activos por grupo/nivel/categoría | MVP |
| Altas, retiros y **motivos de retiro** | MVP |
| Descuentos y becas otorgados (valor dejado de recibir) | F2 |
| Horas dictadas por profesor | F2 |
| Proyección de ingresos del próximo mes | F2 |
| Utilidad (ingresos − egresos) | F3 |

---

## 13. Pantallas principales

| Rol | Pantallas |
|---|---|
| **Admin / coordinador** | Inicio (tablero) · Alumnos (lista, ficha con pestañas: datos, matrículas, cuenta, asistencia, deportivo, documentos) · Acudientes · Grupos · Cobros (mes actual, generación, cobros únicos) · Pagos (registrar, lista) · Cartera · Caja · Avisos · Reportes · Configuración |
| **Profesor** | Ver [`GESTION_DEPORTIVA.md`](GESTION_DEPORTIVA.md); en lo administrativo solo ve indicador al día/en mora y datos de contacto/emergencia de sus alumnos |
| **Acudiente** | Inicio (próximo pago, próximas clases, avisos) · Mis hijos · **Pagos** (pendientes, pagar, historial, recibos, paz y salvo) · Documentos · Mis datos y autorizaciones |

---

## 14. Resumen MVP administrativo
Configuración y políticas · alumnos, acudientes y profesores · matrículas (estados, cupo, documentos) · tarifas y descuentos · generación mensual automática · cobros únicos · pagos en línea (Wompi) y manuales · saldo a favor · estado de cuenta y cartera por edades · recordatorios · paz y salvo · avisos push/email · auditoría · tablero y reportes básicos.
