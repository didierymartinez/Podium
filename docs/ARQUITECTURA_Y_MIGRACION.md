# Arquitectura (Vercel + Neon + Google) y plan de migración

> Decisión: arrancar en **Vercel + Neon + Firebase (Auth y FCM)** por velocidad y costo, y construir desde el día 1 con reglas de **portabilidad** para poder pasar a un **VPS** o a otra **nube** (Google Cloud, AWS, Azure) sin reescribir la aplicación.

---

## 1. Arquitectura inicial

```
            Usuarios (PWA: celular / navegador)
                         │
   Firebase Auth ◄───────┤  login, Google, verificación de email
   FCM (push)   ◄───────┤
                         ▼
            Vercel — Next.js (runtime Node.js, iad1)
              │  verifica token/cookie de Firebase
              │  usuario interno + school_id → RLS
              ├──► Neon PostgreSQL (us-east-1)   [Drizzle]
              ├──► Cloudflare R2 (API S3)        [archivos]
              │    Cloudflare: dominio, DNS, Turnstile, Email Routing
              ├──► Resend                        [email]
              ◄─── Webhooks Wompi
              ◄─── Vercel Cron  → /api/cron/*  (HTTP + secreto)
```

| Servicio | Plan inicial | Cuándo pagar |
|---|---|---|
| Vercel | Hobby (gratis) mientras se desarrolla | **Pro (≈ USD 20/mes)** antes de la primera escuela que pague: Hobby no permite uso comercial |
| Neon | Gratis | Plan de pago por uso cuando la BD crezca o se necesite no suspender el cómputo |
| Firebase Auth / FCM | Gratis (email y Google) | SMS/OTP por celular si se activa |
| Cloudflare R2 | Gratis hasta 10 GB | Centavos por GB adicional |
| Resend | Gratis (volumen bajo) | Al superar el límite mensual |
| Sentry | Gratis | Más eventos o usuarios |

---

## 2. Reglas de portabilidad (obligatorias desde el día 1)

Estas reglas son las que hacen que migrar sea **días de trabajo y no meses**:

| # | Regla | Evita |
|---|---|---|
| 1 | Next.js con `output: "standalone"` y un **Dockerfile** en el repo que se construye en CI | Descubrir al migrar que la app no corre fuera de Vercel |
| 2 | Runtime **Node.js**, no Edge, en rutas de negocio | Código que solo corre en la red de Vercel |
| 3 | **No usar** productos atados a Vercel: Vercel Postgres/KV/Blob, Edge Config, `@vercel/*` en el dominio | Reescrituras al salir |
| 4 | Base de datos con **PostgreSQL estándar**: Drizzle + driver `postgres`/`pg`, migraciones SQL en el repo; las ramas de Neon solo como herramienta de desarrollo | Dependencia de funciones propias de Neon |
| 5 | Archivos vía **API S3** detrás de una interfaz `Storage` | Atarse a un proveedor de archivos |
| 6 | Jobs como **endpoints HTTP idempotentes** (`/api/cron/...`) protegidos con secreto | El programador (Vercel Cron, Cloud Scheduler, `cron` del VPS, GitHub Actions) es intercambiable |
| 7 | Tabla `users` **propia** con `id` interno (UUID) y `firebase_uid` como columna externa; roles y escuelas en Postgres | Que todo el sistema dependa de los IDs de Firebase |
| 8 | Interfaces para `AuthProvider`, `Notifier`, `PaymentProvider`, `Storage`, `Mailer` | Cambiar un proveedor toca un archivo, no toda la app |
| 9 | Configuración solo por **variables de entorno** (12-factor), `.env.example` actualizado | Configuración escondida en paneles |
| 10 | Caché y sesiones sin depender de la CDN de Vercel (nada crítico en ISR/`revalidate`) | Comportamientos distintos al auto-hospedar |
| 11 | Verificar tokens de Firebase con `jose` (no `firebase-admin`); evitar APIs de Node poco comunes en el dominio | Poder correr en Cloudflare Workers |

---

## 3. ¿Se puede migrar después? Sí — por pieza

| Pieza | Destino posible | Cómo | Dificultad |
|---|---|---|---|
| **App (Vercel)** | VPS (Hetzner, DigitalOcean, Contabo) con Docker + Coolify/Dokploy; Google Cloud Run; AWS ECS/App Runner; Fly.io; Render; **Cloudflare Workers** (OpenNext + Hyperdrive) | Desplegar la misma imagen Docker, configurar variables, cambiar DNS | 🟢 Baja (horas–1 día) |
| **Base de datos (Neon)** | PostgreSQL en el VPS, Cloud SQL, AWS RDS, Supabase | `pg_dump`/`pg_restore` con ventana de mantenimiento corta (madrugada), o **replicación lógica** para casi cero caída | 🟢 Baja–media (1–2 días con pruebas) |
| **Cron (Vercel Cron)** | `cron` del VPS, Cloud Scheduler, GitHub Actions | Apuntar al mismo endpoint con el mismo secreto | 🟢 Muy baja |
| **Archivos (R2)** | MinIO en el VPS, S3, Google Cloud Storage | `rclone sync` y cambiar endpoint/credenciales | 🟢 Baja |
| **Email / Sentry / Wompi** | Sin cambios (no dependen del hosting) | — | ⚪ Ninguna |
| **Firebase Auth** | **Puede quedarse** aunque se migre todo lo demás (funciona desde cualquier servidor) | Si se quisiera salir: exportar usuarios con sus hashes (`firebase auth:export`) e importarlos en el nuevo proveedor | 🟡 Media — por eso la regla 7 |
| **FCM** | Puede quedarse; o Web Push estándar (VAPID) | Cambiar la implementación de `Notifier` | 🟢 Baja |

### Procedimiento de migración (ejemplo: a VPS)
1. Crear el servidor, instalar Docker y Coolify/Dokploy (o Caddy/Nginx manual), firewall y actualizaciones automáticas.
2. Montar PostgreSQL (mejor: **seguir con una BD administrada** aunque la app vaya al VPS) y configurar backups diarios fuera del servidor.
3. Desplegar la imagen Docker con las variables de entorno; probar en un subdominio (`nuevo.podium.app`).
4. Ensayar la migración de datos con una copia; medir tiempos.
5. Día D (madrugada): modo mantenimiento → `pg_dump`/`pg_restore` (o cortar replicación) → `rclone` de archivos → cambiar DNS → verificar webhooks de Wompi y cron.
6. Mantener Vercel/Neon 1–2 semanas como respaldo antes de cerrarlos.

---

## 4. ¿Cuándo migrar?

Migrar no es una meta en sí; hacerlo cuando aparezca **una** de estas señales:

| Señal | Ejemplo |
|---|---|
| Costo | Vercel + Neon superan de forma sostenida lo que costaría la alternativa (p. ej. > USD 150–200/mes) |
| Límites técnicos | Procesos largos (reportes pesados, importaciones grandes) que chocan con los límites de tiempo de las funciones serverless |
| Rendimiento | Arranques en frío de Neon o de las funciones afectan la experiencia pese a los ajustes |
| Requisitos de clientes | Una liga/federación exige otra nube o residencia de datos específica |

### VPS vs. nube administrada
| | VPS (Hetzner, DigitalOcean…) | Nube administrada (Cloud Run + Cloud SQL, AWS) |
|---|---|---|
| Costo | Más barato (≈ USD 10–40/mes por buena capacidad) | Mayor, pero paga por uso |
| Trabajo de operación | **Tú** gestionas actualizaciones, seguridad, backups, monitoreo, caídas | El proveedor lo gestiona |
| Escalar | Manual (servidor más grande o más servidores) | Automático |
| Recomendado para | Equipo con tiempo/conocimiento de servidores | **Un solo desarrollador** que debe enfocarse en el producto |

**Recomendación:** si llega el momento, el paso natural es **Google Cloud Run + Cloud SQL** (ver [`EVALUACION_GOOGLE.md`](EVALUACION_GOOGLE.md)): misma imagen Docker, ya se usa Firebase, y no hay servidores que mantener. Un VPS tiene sentido cuando el costo pese más que el tiempo de operación, idealmente con la base de datos aún administrada.

---

## 5. Checklist de portabilidad en el proyecto base
- [ ] `next.config` con `output: "standalone"`
- [ ] `Dockerfile` + job de CI que construye la imagen en cada PR
- [x] `docker-compose.yml` para desarrollo local (Postgres + MinIO opcional con `--profile s3`)
- [ ] `.env.example` con todas las variables
- [ ] Interfaces `AuthProvider`, `Storage`, `Mailer`, `Notifier`, `PaymentProvider`
- [x] Endpoints `/api/cron/*` protegidos con `CRON_SECRET` e idempotentes (`/api/cron/daily`; en Vercel lo programa `vercel.json`, en un VPS basta `curl -H "Authorization: Bearer $CRON_SECRET"` desde `cron`)
- [ ] Tabla `users` propia con `firebase_uid`
- [ ] Script de backup/restauración probado (`pg_dump` → almacenamiento externo)

---

## 6. Cloudflare: qué usar y qué no

### Sí, desde el día 1 (alrededor de la app)
| Servicio | Uso en Podium | Costo |
|---|---|---|
| **Registrar + DNS** | Comprar/administrar el dominio (`podium…`) a precio de costo; DNS rápido | Dominio al costo, DNS gratis |
| **R2** | Archivos (fotos, comprobantes, documentos) vía API S3 | Gratis hasta 10 GB, sin costo de salida |
| **Turnstile** | Captcha invisible en registro, login y formularios públicos | Gratis |
| **Email Routing** | Recibir `hola@`, `soporte@` y reenviarlos a tu correo personal | Gratis |
| **Pages** (opcional) | Landing de marketing estática separada de la app | Gratis |

Con Vercel, los registros DNS de la app van en modo **"solo DNS" (nube gris)**: Vercel ya tiene su CDN y protección, y poner el proxy de Cloudflare delante genera problemas de certificados y caché.

### Hosting de la app en Cloudflare Workers: viable, pero no ahora
Next.js corre en Workers con el adaptador **OpenNext** (`@opennextjs/cloudflare`).

| A favor | En contra |
|---|---|
| Más barato: plan Workers ≈ USD 5/mes **permite uso comercial** (Vercel exige Pro ≈ USD 20) | Workers **no es Node.js completo**: algunas librerías fallan (p. ej. `firebase-admin`) |
| Prácticamente sin arranques en frío y red global | Límites de tamaño del paquete y de CPU por petición; reportes/importaciones pesadas deben ir a colas |
| Neon funciona bien vía **Hyperdrive** (pool de conexiones) | Un adaptador más entre Next.js y el hosting: más cosas que depurar para un solo dev |
| Cron Triggers y Queues incluidos | Menos maduro que Vercel para Next.js (funciones nuevas llegan después) |

**No usar:** **D1** (SQLite) ni **KV** como base de datos principal — mismas razones que Firestore: necesitamos PostgreSQL relacional con RLS.

### Decisión
- **Ahora:** Vercel para la app + Cloudflare para dominio, DNS, R2, Turnstile y Email Routing.
- **Mantener la puerta abierta a Workers** con una regla extra de portabilidad (#11): verificar los tokens de Firebase con **`jose`** (claves públicas de Google) en lugar de `firebase-admin`, y no usar APIs de Node exóticas en el código de dominio.
- **Workers pasa a ser un destino de migración** más (ver tabla de la sección 3), atractivo si el costo de Vercel crece.
