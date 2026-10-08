import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { pgErrorCode, runInTenant, type Database } from "@/db/rls";
import { athletes, auditLogs, products, stockMovements } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { chargeAthleteLinesTx } from "./invoices";
import type { BillingPolicy } from "./policy";

/** Inventario simple: uniformes e implementos con stock (ADM-53). */

type Ctx = { schoolId: string; actorUserId: string };

export const productSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre").max(80),
  price: z.number("Escribe el precio").int().min(0).max(100_000_000),
});

export async function createProduct(database: Database, ctx: Ctx, raw: z.input<typeof productSchema>) {
  const input = productSchema.parse(raw);
  try {
    const [row] = await runInTenant(database, { schoolId: ctx.schoolId }, (tx) =>
      tx
        .insert(products)
        .values({ schoolId: ctx.schoolId, ...input })
        .returning({ id: products.id }),
    );
    return { ok: true as const, id: row.id };
  } catch (err) {
    if (pgErrorCode(err) === "23505") return { ok: false as const, error: "exists" as const };
    throw err;
  }
}

export function updateProduct(
  database: Database,
  ctx: Ctx,
  productId: string,
  input: { price: number; active: boolean },
) {
  const price = z.number().int().min(0).max(100_000_000).parse(input.price);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const updated = await tx
      .update(products)
      .set({ price, active: input.active })
      .where(eq(products.id, productId))
      .returning({ id: products.id });
    return updated.length > 0;
  });
}

export function listProducts(database: Database, schoolId: string) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx.select().from(products).orderBy(desc(products.active), products.name),
  );
}

/** Entrada de mercancía (o ajuste con cantidad negativa, sin dejar stock negativo). */
export function moveStock(
  database: Database,
  ctx: Ctx,
  input: { productId: string; quantity: number; kind: "IN" | "ADJUST"; note: string | null },
  today: IsoDate,
) {
  const quantity = z
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((q) => q !== 0)
    .parse(input.quantity);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx) => {
    const [updated] = await tx
      .update(products)
      .set({ stock: sql`${products.stock} + ${quantity}` })
      .where(and(eq(products.id, input.productId), gte(sql`${products.stock} + ${quantity}`, 0)))
      .returning();
    if (!updated) return false;
    await tx.insert(stockMovements).values({
      schoolId: ctx.schoolId,
      productId: input.productId,
      kind: input.kind,
      quantity,
      note: input.note,
      movedOn: today,
      createdByUserId: ctx.actorUserId,
    });
    return true;
  });
}

export const saleSchema = z
  .object({
    productId: z.uuid(),
    quantity: z.number().int().min(1).max(100),
    athleteId: z.uuid().nullable(),
    method: z.enum(["CASH", "TRANSFER", "DEPOSIT", "CARD"]).nullable(),
  })
  .refine((s) => s.athleteId !== null || s.method !== null, "Elige el alumno o el medio de pago");

export type SaleResult =
  | { ok: true; total: number; invoiceId: string | null }
  | { ok: false; error: "not_found" | "no_stock" | "no_payer" };

/**
 * Venta (ADM-53): a un alumno se carga a la cuenta de su responsable de pago; de contado cuenta como
 * ingreso del día. Nunca deja el stock negativo.
 */
export function sellProduct(
  database: Database,
  ctx: Ctx & { slug: string },
  raw: z.input<typeof saleSchema>,
  today: IsoDate,
  policy: BillingPolicy,
): Promise<SaleResult> {
  const input = saleSchema.parse(raw);
  return runInTenant(database, { schoolId: ctx.schoolId }, async (tx): Promise<SaleResult> => {
    const [product] = await tx.select().from(products).where(eq(products.id, input.productId));
    if (!product || !product.active) return { ok: false, error: "not_found" };
    const [updated] = await tx
      .update(products)
      .set({ stock: sql`${products.stock} - ${input.quantity}` })
      .where(and(eq(products.id, product.id), gte(products.stock, input.quantity)))
      .returning();
    if (!updated) return { ok: false, error: "no_stock" };
    const total = product.price * input.quantity;
    let invoiceId: string | null = null;
    if (input.athleteId) {
      const [athlete] = await tx
        .select({ id: athletes.id, firstName: athletes.firstName })
        .from(athletes)
        .where(eq(athletes.id, input.athleteId));
      if (!athlete) return { ok: false, error: "not_found" };
      invoiceId = await chargeAthleteLinesTx(
        tx,
        ctx,
        athlete,
        {
          title: `Compra: ${product.name}`,
          lines: [
            {
              description: input.quantity > 1 ? `${product.name} x${input.quantity}` : product.name,
              amount: total,
            },
          ],
          dueOn: today,
          today,
        },
        policy,
      );
      if (!invoiceId && total > 0) throw new NoPayer();
    }
    await tx.insert(stockMovements).values({
      schoolId: ctx.schoolId,
      productId: product.id,
      kind: "SALE",
      quantity: -input.quantity,
      unitPrice: product.price,
      athleteId: input.athleteId,
      invoiceId,
      method: input.athleteId ? null : input.method,
      movedOn: today,
      createdByUserId: ctx.actorUserId,
    });
    await tx.insert(auditLogs).values({
      schoolId: ctx.schoolId,
      actorUserId: ctx.actorUserId,
      action: "product.sold",
      entity: "product",
      entityId: product.id,
      data: { quantity: input.quantity, total, athleteId: input.athleteId, method: input.method },
    });
    return { ok: true, total, invoiceId };
  }).catch((err): SaleResult => {
    if (err instanceof NoPayer) return { ok: false, error: "no_payer" };
    throw err;
  });
}

class NoPayer extends Error {}

export function recentMovements(database: Database, schoolId: string, limit = 20) {
  return runInTenant(database, { schoolId }, (tx) =>
    tx
      .select({
        movement: stockMovements,
        productName: products.name,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .leftJoin(athletes, eq(athletes.id, stockMovements.athleteId))
      .orderBy(desc(stockMovements.createdAt))
      .limit(limit),
  );
}
