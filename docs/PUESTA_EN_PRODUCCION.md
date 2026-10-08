# Puesta en producción (#18)

Lista de lo que debe hacer el propietario del producto para publicar Podium. Todo lo que es código ya está listo;
lo que falta son **cuentas, llaves y decisiones**. Cada paso indica la variable de entorno que llena
(ver `.env.example`).

## 1. Cuentas y servicios

| # | Servicio | Qué hacer | Variables |
|---|---|---|---|
| 1 | **Neon** (AWS `us-east-1`) | Crear proyecto. Aplicar migraciones con la cadena **directa** del dueño (`pnpm db:migrate`). En el SQL editor: `ALTER ROLE podium_app LOGIN PASSWORD '<secreto>'`. | `MIGRATIONS_DATABASE_URL` (solo para migrar), `DATABASE_URL` (cadena **pooled** con `podium_app`) |
| 2 | **Firebase / Identity Platform** | Proyecto web; Authentication con Email/contraseña y Google; dominios autorizados (Vercel y el propio). Activar **Identity Platform** y el segundo factor **TOTP** (lo exige la consola `/admin`). | `NEXT_PUBLIC_AUTH_PROVIDER=firebase`, `NEXT_PUBLIC_FIREBASE_*` |
| 3 | **Firebase Cloud Messaging** | Certificado push web (VAPID) y una cuenta de servicio con permiso de FCM (JSON en una línea). | `NEXT_PUBLIC_FIREBASE_VAPID_KEY`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_SERVICE_ACCOUNT` |
| 4 | **Vercel** (región `iad1`) | Importar el repositorio, cargar variables. **Plan Pro** antes de la primera escuela que pague (Hobby no permite uso comercial). | `SESSION_SECRET` (`openssl rand -base64 48`), `DATA_ENCRYPTION_KEY` (`openssl rand -base64 32`, **guardarla**: sin ella no se leen los datos de salud), `NEXT_PUBLIC_APP_URL` |
| 5 | **Dominio en Cloudflare** | DNS en modo "solo DNS" (nube gris) hacia Vercel. | — |
| 6 | **Cloudflare R2** | Bucket privado + token S3 de lectura/escritura. | `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto` |
| 7 | **Cloudflare Turnstile** | Sitio en modo invisible para el dominio. | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| 8 | **Resend** | Verificar el dominio de envío (SPF/DKIM en Cloudflare). | `RESEND_API_KEY`, `EMAIL_FROM` |
| 9 | **Wompi de Podium** | Cuenta de Podium (no la de las escuelas) para cobrar suscripciones; primero sandbox. Registrar el webhook `https://<dominio>/api/webhooks/podium`. | `PODIUM_WOMPI_PUBLIC_KEY`, `PODIUM_WOMPI_PRIVATE_KEY`, `PODIUM_WOMPI_EVENTS_SECRET`, `PODIUM_WOMPI_INTEGRITY_SECRET` |
| 10 | **Tareas programadas** | `vercel.json` ya programa `/api/cron/daily` a las 9:00 a. m. de Bogotá. Opcional (Pro): `/api/cron/notifications` cada hora. | `CRON_SECRET` (`openssl rand -hex 24`) |
| 11 | **Super admin** | Email del equipo de Podium que entra a `/admin`; luego activar el segundo factor en `/admin/dos-pasos`. | `PLATFORM_ADMIN_EMAILS` |
| 12 | **WhatsApp Cloud API** (#64) | En Meta Business: verificar el negocio, crear la app con el producto WhatsApp y registrar **el número de Podium**. Crear y enviar a aprobación la plantilla de **utilidad** `aviso_podium` en español: *"{{1}}: {{2}}. Míralo en Podium: {{3}}"* ({{1}} escuela, {{2}} resumen, {{3}} enlace). Token de sistema permanente con `whatsapp_business_messaging`. Registrar el webhook `https://<dominio>/api/webhooks/whatsapp` (campo `messages`) con el token de verificación. | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`; opcionales `WHATSAPP_TEMPLATE` y `WHATSAPP_TEMPLATE_LANG` (por defecto `aviso_podium` / `es`) |

Webhook de cada escuela (lo configura la escuela en su Wompi): `https://<dominio>/api/webhooks/wompi/<slug>`
(se muestra en Configuración → Cobros).

## 2. Decisiones pendientes

- **Precios de los planes** (#21): hoy provisionales en `src/modules/subscription/plans.ts`.
- **Textos legales** (#22): redacción por abogado de `/terminos` y `/privacidad`; al publicarlos, subir
  `LEGAL_VERSION` (`src/modules/auth/users.ts`) y todos los usuarios deberán aceptarlos de nuevo al ingresar.

## 3. Pruebas de humo en producción

1. Registro con email/contraseña → correo de verificación → crear escuela (y correo de bienvenida).
2. Ingreso con Google.
3. Subir el logo (R2) y ver la foto de un alumno.
4. Activar notificaciones push en un celular con la PWA instalada y enviar un aviso.
5. Conectar el Wompi **sandbox** de una escuela de prueba, pagar una mensualidad desde "Mis pagos" y ver el webhook aplicado.
6. Pagar la suscripción en sandbox (link y tarjeta de prueba) y ver la escuela "Activa".
7. WhatsApp: con la plantilla aprobada, aceptar el permiso de WhatsApp en una cuenta de familia, enviar un aviso y ver
   en la base el estado `delivered`/`read`; responder "SALIR" y comprobar que lo siguiente llega por correo.
8. Facturación electrónica (#70, por escuela): con una cuenta **sandbox de Alegra** con numeración electrónica de
   prueba, conectarla en Configuración → Cobros (correo, token e id del ítem de servicio), pagar una cuenta de cobro
   y verificar en Alegra la factura con su CUFE. Si algún campo de la API cambió, ajustar `src/modules/einvoicing/alegra.ts`.
9. Llamar el cron a mano: `curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/cron/daily`.
8. Super admin: `/admin` pide segundo factor; "Entrar como" muestra el banner de solo lectura.
