import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen autocontenida para Docker / VPS / Cloud Run (regla de portabilidad #1).
  output: "standalone",
  // Cache Components desactivado: la app es casi toda autenticada y dinámica,
  // así que usamos el modelo de renderizado dinámico clásico.
  cacheComponents: false,
  async headers() {
    return [
      {
        // El service worker siempre se revisa en la red para que las actualizaciones lleguen.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
