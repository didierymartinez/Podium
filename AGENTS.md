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
