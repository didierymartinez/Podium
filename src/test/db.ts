import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { users } from "@/db/schema";

/**
 * Conexión para tests de integración con el rol de la app (sujeto a RLS).
 * Requiere TEST_DATABASE_URL apuntando a una base migrada; si no existe, los tests se omiten.
 */
export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export function connectTestDb() {
  const client = postgres(testDatabaseUrl!, { prepare: false, max: 4, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export async function createTestUser(db: ReturnType<typeof connectTestDb>["db"], label: string) {
  const unique = `${label}-${crypto.randomUUID()}`;
  const [user] = await db
    .insert(users)
    .values({ email: `${unique}@test.podium`, name: label, emailVerifiedAt: new Date() })
    .returning();
  return user;
}
