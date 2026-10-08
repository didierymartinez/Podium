import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/rls";
import { legalAcceptances, users } from "@/db/schema";

/** Versión vigente de términos y política de datos (Ley 1581). */
export const LEGAL_VERSION = "2026-10";

export type Identity = {
  firebaseUid: string | null;
  email: string;
  emailVerified: boolean;
  name: string;
  phone: string | null;
};

export async function findUserByEmail(database: Database, email: string) {
  const [user] = await database.select().from(users).where(eq(users.email, email.toLowerCase()));
  return user ?? null;
}

/**
 * Crea o actualiza el usuario a partir de una identidad verificada.
 * Nunca reemplaza un firebase_uid ya vinculado ni "des-verifica" un email.
 */
export async function upsertUser(database: Database, identity: Identity, now = new Date()) {
  const [user] = await database
    .insert(users)
    .values({
      firebaseUid: identity.firebaseUid,
      email: identity.email.toLowerCase(),
      name: identity.name,
      phone: identity.phone,
      emailVerifiedAt: identity.emailVerified ? now : null,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        firebaseUid: sql`coalesce(${users.firebaseUid}, excluded.firebase_uid)`,
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, excluded.email_verified_at)`,
        phone: sql`coalesce(${users.phone}, excluded.phone)`,
        updatedAt: now,
      },
    })
    .returning();
  return user;
}

export async function recordLegalAcceptance(database: Database, userId: string, ip: string | null) {
  await database.insert(legalAcceptances).values([
    { userId, document: "TERMS", version: LEGAL_VERSION, ip },
    { userId, document: "PRIVACY", version: LEGAL_VERSION, ip },
  ]);
}

export type SignInResult =
  | { ok: true; user: typeof users.$inferSelect; isNew: boolean }
  | { ok: false; error: "terms_required" | "email_in_use" };

/**
 * Ingreso o registro a partir de una identidad ya verificada por el proveedor.
 * - Un usuario nuevo debe aceptar términos y política de datos.
 * - Para vincular una identidad distinta a una cuenta existente, el email debe estar verificado
 *   (evita que alguien registre con contraseña el email de otra persona y tome su cuenta).
 */
export async function signIn(
  database: Database,
  identity: Identity,
  opts: { acceptTerms: boolean; ip: string | null; platformAdminEmails?: string[] },
): Promise<SignInResult> {
  const existing = await findUserByEmail(database, identity.email);

  if (!existing && !opts.acceptTerms) return { ok: false, error: "terms_required" };
  if (existing && existing.firebaseUid !== identity.firebaseUid && !identity.emailVerified) {
    return { ok: false, error: "email_in_use" };
  }

  let user = await upsertUser(database, identity);
  if (!existing) await recordLegalAcceptance(database, user.id, opts.ip);
  // Super admins de Podium (#17) definidos por configuración: así se crea el primero sin tocar la base.
  if (!user.isPlatformAdmin && user.emailVerifiedAt && opts.platformAdminEmails?.includes(user.email)) {
    [user] = await database
      .update(users)
      .set({ isPlatformAdmin: true })
      .where(eq(users.id, user.id))
      .returning();
  }
  return { ok: true, user, isNew: !existing };
}
