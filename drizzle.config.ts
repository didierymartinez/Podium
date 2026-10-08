import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Las migraciones corren con el usuario dueño del esquema, no con el rol de la app.
    url: process.env.MIGRATIONS_DATABASE_URL ?? "",
  },
});
