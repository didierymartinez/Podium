import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { legalAcceptances } from "@/db/schema";
import { connectTestDb, testDatabaseUrl } from "@/test/db";
import { signIn, type Identity } from "./users";

const identity = (over: Partial<Identity> = {}): Identity => ({
  firebaseUid: `uid-${crypto.randomUUID()}`,
  email: `ana-${crypto.randomUUID()}@test.podium`,
  emailVerified: false,
  name: "Ana",
  phone: "+573001234567",
  ...over,
});

describe.skipIf(!testDatabaseUrl)("signIn (integración)", () => {
  let conn: ReturnType<typeof connectTestDb>;
  beforeAll(() => {
    conn = connectTestDb();
  });
  afterAll(() => conn.close());

  it("exige aceptar términos al registrarse y los guarda", async () => {
    const id = identity();
    expect(await signIn(conn.db, id, { acceptTerms: false, ip: null })).toEqual({
      ok: false,
      error: "terms_required",
    });
    const result = await signIn(conn.db, id, { acceptTerms: true, ip: "1.2.3.4" });
    expect(result.ok && result.isNew).toBe(true);
    if (!result.ok) return;
    const accepted = await conn.db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, result.user.id));
    expect(accepted.map((a) => a.document).sort()).toEqual(["PRIVACY", "TERMS"]);
  });

  it("marca super admin solo a emails configurados y verificados", async () => {
    const id = identity();
    const list = [id.email];
    const unverified = await signIn(conn.db, id, { acceptTerms: true, ip: null, platformAdminEmails: list });
    expect(unverified.ok && unverified.user.isPlatformAdmin).toBe(false);
    const verified = await signIn(
      conn.db,
      { ...id, emailVerified: true },
      {
        acceptTerms: false,
        ip: null,
        platformAdminEmails: list,
      },
    );
    expect(verified.ok && verified.user.isPlatformAdmin).toBe(true);
    const other = await signIn(conn.db, identity({ emailVerified: true }), {
      acceptTerms: true,
      ip: null,
      platformAdminEmails: list,
    });
    expect(other.ok && other.user.isPlatformAdmin).toBe(false);
  });

  it("la misma identidad vuelve a ingresar y se marca verificada", async () => {
    const id = identity();
    await signIn(conn.db, id, { acceptTerms: true, ip: null });
    const again = await signIn(conn.db, { ...id, emailVerified: true }, { acceptTerms: false, ip: null });
    expect(again.ok && !again.isNew && again.user.emailVerifiedAt !== null).toBe(true);
  });

  it("no permite tomar una cuenta existente con otra identidad sin email verificado", async () => {
    const original = identity({ emailVerified: true });
    await signIn(conn.db, original, { acceptTerms: true, ip: null });
    const intruder = identity({ email: original.email, emailVerified: false });
    expect(await signIn(conn.db, intruder, { acceptTerms: true, ip: null })).toEqual({
      ok: false,
      error: "email_in_use",
    });
    // Con el email verificado (p. ej. Google) sí se vincula a la misma cuenta.
    const google = identity({ email: original.email, emailVerified: true });
    const linked = await signIn(conn.db, google, { acceptTerms: false, ip: null });
    expect(linked.ok && linked.user.firebaseUid).toBe(original.firebaseUid);
  });
});
