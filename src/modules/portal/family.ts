import { eq } from "drizzle-orm";
import { runInTenant, type Database } from "@/db/rls";
import { guardians } from "@/db/schema";

/** Acudientes de la escuela vinculados a esta cuenta (una persona puede ser acudiente una sola vez por escuela). */
export async function guardianIdsOfUser(database: Database, schoolId: string, userId: string) {
  const rows = await runInTenant(database, { schoolId }, (tx) =>
    tx.select({ id: guardians.id }).from(guardians).where(eq(guardians.userId, userId)),
  );
  return rows.map((r) => r.id);
}
