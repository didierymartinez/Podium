import { and, asc, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { runInTenant, type Database } from "@/db/rls";
import { auditLogs, groups, venues } from "@/db/schema";

/** Sedes de la escuela (ADM-08). */

type Ctx = { schoolId: string; actorUserId: string };

export const venueSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de la sede").max(80),
  address: z
    .string()
    .trim()
    .max(160)
    .nullish()
    .transform((v) => v || null),
  mapUrl: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https:\/\//.test(v), "El enlace del mapa debe empezar por https://"),
});

/** Sedes con la cantidad de grupos activos. */
export function listVenues(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, async (tx) => {
    const [rows, counts] = await Promise.all([
      tx.select().from(venues).orderBy(asc(venues.createdAt)),
      tx
        .select({ venueId: groups.venueId, value: count() })
        .from(groups)
        .where(eq(groups.active, true))
        .groupBy(groups.venueId),
    ]);
    return rows.map((v) => ({ ...v, groups: counts.find((c) => c.venueId === v.id)?.value ?? 0 }));
  });
}

export function saveVenue(database: Database, ctx: Ctx, raw: z.input<typeof venueSchema>, venueId?: string) {
  const input = venueSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [row] = venueId
      ? await tx.update(venues).set(input).where(eq(venues.id, venueId)).returning()
      : await tx
          .insert(venues)
          .values({ schoolId: ctx.schoolId, ...input })
          .returning();
    if (!row) return null;
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: venueId ? "venue.updated" : "venue.created",
      entity: "venue",
      entityId: row.id,
      data: input,
    });
    return row.id;
  });
}

export type VenueActiveResult =
  { ok: true } | { ok: false; error: "last_venue" | "has_groups" | "not_found" };

/** Archivar exige que no tenga grupos activos y que quede otra sede activa. */
export function setVenueActive(
  database: Database,
  ctx: Ctx,
  venueId: string,
  active: boolean,
): Promise<VenueActiveResult> {
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx): Promise<VenueActiveResult> => {
    const [venue] = await tx.select().from(venues).where(eq(venues.id, venueId));
    if (!venue) return { ok: false, error: "not_found" };
    if (!active) {
      const [{ others }] = await tx
        .select({ others: count() })
        .from(venues)
        .where(and(eq(venues.active, true), ne(venues.id, venueId)));
      if (others === 0) return { ok: false, error: "last_venue" };
      const [{ inUse }] = await tx
        .select({ inUse: count() })
        .from(groups)
        .where(and(eq(groups.venueId, venueId), eq(groups.active, true)));
      if (inUse > 0) return { ok: false, error: "has_groups" };
    }
    await tx.update(venues).set({ active }).where(eq(venues.id, venueId));
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: active ? "venue.activated" : "venue.archived",
      entity: "venue",
      entityId: venueId,
      data: {},
    });
    return { ok: true };
  });
}
