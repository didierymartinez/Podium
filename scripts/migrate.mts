import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.MIGRATIONS_DATABASE_URL;
if (!url) {
  console.error("Falta MIGRATIONS_DATABASE_URL");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: "src/db/migrations" });
await client.end();
console.log("Migraciones aplicadas");
