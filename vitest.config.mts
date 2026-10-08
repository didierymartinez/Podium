import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Los tests de integración comparten una base de datos real.
    fileParallelism: false,
    env: {
      // Clave solo para pruebas.
      DATA_ENCRYPTION_KEY: "dGVzdC1rZXktdGVzdC1rZXktdGVzdC1rZXktMTIzNDU=",
    },
  },
});
