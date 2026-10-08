<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Convenciones del proyecto Podium

- Código en inglés, interfaz y documentación en español (Colombia).
- Producto y alcance: ver `docs/` (empezar por `docs/PLAN.md`).
- Toda consulta a tablas de escuela pasa por `withTenant()` (`src/db/tenant.ts`) o `runInTenant()` (`src/db/rls.ts`); nunca desactivar RLS ni usar el rol dueño desde la app.
- La lógica de negocio vive en `src/modules/<módulo>` y recibe la base de datos por parámetro para poder probarla; las páginas y server actions solo orquestan.
- Reglas de portabilidad (`docs/ARQUITECTURA_Y_MIGRACION.md`): runtime Node, nada de productos exclusivos de Vercel, tokens de Firebase verificados con `jose`.
- Cache Components está desactivado (`next.config.ts`): la app es casi toda dinámica y autenticada.
- Antes de terminar: `pnpm lint && pnpm typecheck && pnpm test`.

## Flujo de trabajo obligatorio: GitHub Issues

Todo pendiente, avance y trabajo realizado se registra en los issues de `didierymartinez/Podium` (guía completa: `docs/FLUJO_DE_TRABAJO.md`).

1. **Antes de programar:** busca el issue de la tarea (o créalo colgado de su épica: #6 plataforma, #7 personas, #8 asistencia, #9 cobros, #10 comunicación, #11 tablero/calidad, #12 fase 2, #13 fase 3). Agrega la etiqueta `en-progreso` y comenta el plan.
2. **Mientras trabajas:** referencia el issue en cada commit (`feat: … (#NN)`), comenta el progreso en cada hito (hecho, decisiones, problemas), marca las casillas del alcance y crea issues nuevos para trabajo fuera de alcance o bugs encontrados. Si algo bloquea, etiqueta `bloqueado` y explica qué se necesita.
3. **Al terminar:** verifica (`pnpm lint && pnpm typecheck && pnpm test` + navegador si hay UI), deja el comentario de cierre (trabajo realizado, decisiones, verificación, pendientes, commits) y cierra el issue; revisa si la épica puede cerrarse.
4. Al final de cada sesión, informa al usuario qué issues se movieron.

Nada se trabaja sin issue y nada se cierra sin comentario de cierre. No escribas secretos ni datos personales reales en GitHub.
