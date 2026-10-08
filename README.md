# Podium

SaaS para escuelas deportivas (multi-deporte, iniciando con **patinaje**): gestión deportiva y administrativa para directivos, profesores, alumnos y acudientes.

## Flujo de trabajo

Pendientes, avances y trabajo realizado viven en los [issues de GitHub](https://github.com/didierymartinez/Podium/issues). Guía: [`docs/FLUJO_DE_TRABAJO.md`](docs/FLUJO_DE_TRABAJO.md).

## Documentación del producto

- Plan del producto: [`docs/PLAN.md`](docs/PLAN.md)
- Gestión administrativa: [`docs/GESTION_ADMINISTRATIVA.md`](docs/GESTION_ADMINISTRATIVA.md)
- Gestión deportiva: [`docs/GESTION_DEPORTIVA.md`](docs/GESTION_DEPORTIVA.md)
- WhatsApp, avisos e invitaciones: [`docs/WHATSAPP_COMUNICACIONES.md`](docs/WHATSAPP_COMUNICACIONES.md)
- Registro de escuelas (self-service): [`docs/ONBOARDING_ESCUELAS.md`](docs/ONBOARDING_ESCUELAS.md)
- Arquitectura y plan de migración: [`docs/ARQUITECTURA_Y_MIGRACION.md`](docs/ARQUITECTURA_Y_MIGRACION.md)
- Evaluación de tecnologías Google: [`docs/EVALUACION_GOOGLE.md`](docs/EVALUACION_GOOGLE.md)
- Evaluación: gimnasios y entrenamiento personalizado: [`docs/EVALUACION_GIMNASIOS.md`](docs/EVALUACION_GIMNASIOS.md)
- Sistema de diseño: [`docs/DISENO.md`](docs/DISENO.md)

## Stack

Next.js 16 (App Router, PWA) · TypeScript · Tailwind CSS 4 · PostgreSQL (Neon) con Row Level Security · Drizzle ORM · Firebase Authentication (verificada con `jose`) · Vitest.

## Desarrollo local

Requisitos: Node 22, pnpm 10, PostgreSQL 16 (local o `docker compose up -d db`).

```bash
pnpm install
cp .env.example .env          # modo de autenticación "dev": ingresas solo con el email
pnpm db:setup                 # crea la base, aplica migraciones y habilita el rol podium_app
pnpm dev                      # http://localhost:3000
```

Flujo disponible: **registro → crear escuela (prueba de 30 días con plantilla de patinaje) → configuración (perfil y cobros) → grupos con horario semanal → alumnos con acudiente responsable de pago y matrícula (congelar, retirar, reactivar) → tablero semanal con las clases**.

### Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm test` | Pruebas (las de integración requieren `TEST_DATABASE_URL`) |
| `pnpm db:generate` | Genera una migración a partir de `src/db/schema.ts` |
| `pnpm db:migrate` | Aplica migraciones (usa `MIGRATIONS_DATABASE_URL`) |
| `pnpm build` | Build de producción (`output: "standalone"`) |

### Pruebas de integración (RLS)

```bash
createdb podium_test
MIGRATIONS_DATABASE_URL=postgres://postgres:postgres@localhost:5432/podium_test pnpm db:migrate
psql postgres://postgres:postgres@localhost:5432/podium_test -c "ALTER ROLE podium_app LOGIN PASSWORD 'podium_app_dev'"
TEST_DATABASE_URL=postgres://podium_app:podium_app_dev@localhost:5432/podium_test pnpm test
```

## Multi-escuela y seguridad

- Cada tabla de escuela tiene `school_id` y una política RLS. La app se conecta con el rol **`podium_app`** (sin `BYPASSRLS`) y todo acceso pasa por `withTenant()` / `runInTenant()` (`src/db/rls.ts`), que fija `app.school_id` y `app.user_id` en la transacción.
- Las migraciones corren con el usuario dueño del esquema (`MIGRATIONS_DATABASE_URL`).
- La sesión es una cookie propia (JWT HS256, 14 días). Firebase solo verifica la identidad; la tabla `users` guarda `firebase_uid` como referencia externa.

## Puesta en marcha en Vercel + Neon + Firebase

1. **Neon**: crear proyecto (región AWS `us-east-1`). Aplicar migraciones con la cadena directa del dueño; luego, en el SQL editor: `ALTER ROLE podium_app LOGIN PASSWORD '<secreto>'`. Usar la cadena *pooled* con `podium_app` como `DATABASE_URL`.
2. **Firebase**: crear proyecto, habilitar Authentication con **Email/contraseña** y **Google**, agregar el dominio de Vercel a dominios autorizados y copiar la config web a las variables `NEXT_PUBLIC_FIREBASE_*`.
3. **Vercel**: importar el repo, región `iad1`, variables de `.env.example` con `NEXT_PUBLIC_AUTH_PROVIDER=firebase`, un `SESSION_SECRET` aleatorio (`openssl rand -base64 48`) y una `DATA_ENCRYPTION_KEY` propia (`openssl rand -base64 32`; si se pierde, no se pueden leer los datos de salud ya guardados).

## Docker

```bash
docker build -t podium --build-arg NEXT_PUBLIC_AUTH_PROVIDER=firebase .
docker run -p 3000:3000 --env-file .env podium
```
