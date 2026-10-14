# Material comercial (#76)

- `Podium-brochure-escuelas.pdf`: brochure para escuelas y gimnasios (clientes).
- `Podium-guia-comercial-vendedores.pdf`: guía interna del equipo comercial (no compartir con clientes).
- `capturas/`: capturas reales de Podium con la escuela de demostración «Club Patín Veloz» (datos ficticios).
- `fuente/`: HTML y estilos de los PDF.

## Regenerar

1. Base de demostración (PostgreSQL local): `./scripts/demo/reset.sh`
2. App con esa base y autenticación dev: `NEXT_PUBLIC_AUTH_PROVIDER=dev pnpm build` y arrancar `.next/standalone/server.js`
   con `DATABASE_URL=…/podium_demo`, `ALLOW_DEV_AUTH=true` y `PORT=3200`.
3. Capturas: `DEMO_ATHLETE=<id de un alumno de Competencia> pnpm tsx scripts/demo/screens.mts`
4. PDF: `pnpm tsx scripts/demo/pdf.mts`

Ingreso dev: `directora@example.com` (administración), `profesor@example.com` (profesor), `familia@example.com` (familia).
Los precios salen de `src/modules/subscription/plans.ts` y son provisionales (#21).
