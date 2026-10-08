import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagen autocontenida para Docker / VPS / Cloud Run (regla de portabilidad #1).
  output: "standalone",
  // Cache Components desactivado: la app es casi toda autenticada y dinámica,
  // así que usamos el modelo de renderizado dinámico clásico.
  cacheComponents: false,
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
