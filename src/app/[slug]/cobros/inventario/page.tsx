import type { Metadata } from "next";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { db } from "@/db/client";
import { formatCOP } from "@/lib/money";
import { listAthletes } from "@/modules/athletes/athletes";
import { listProducts, recentMovements } from "@/modules/billing/inventory";
import { METHOD_LABELS } from "@/modules/billing/labels";
import { getSchoolContext } from "../../data";
import { InventoryForms, ProductRow } from "./inventory-forms";

export const metadata: Metadata = { title: "Inventario" };

const KIND_LABELS = { IN: "Entrada", SALE: "Venta", ADJUST: "Ajuste" } as const;

/** Inventario simple con ventas a la cuenta del alumno o de contado (ADM-53). */
export default async function InventoryPage({ params }: PageProps<"/[slug]/cobros/inventario">) {
  const { slug } = await params;
  const { school } = await getSchoolContext(slug);
  const [items, movements, athletes] = await Promise.all([
    listProducts(db, school.id),
    recentMovements(db, school.id, 20),
    listAthletes(db, school.id, { status: "current" }),
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Card>
          <SectionTitle>Productos</SectionTitle>
          <ul className="divide-y divide-line text-sm" aria-label="Productos">
            {items.map((p) => (
              <ProductRow
                key={p.id}
                slug={slug}
                product={{ id: p.id, name: p.name, price: p.price, stock: p.stock, active: p.active }}
              />
            ))}
            {items.length === 0 && <li className="py-2 text-ink-soft">Aún no hay productos.</li>}
          </ul>
        </Card>
        <Card>
          <SectionTitle>Movimientos recientes</SectionTitle>
          <ul className="divide-y divide-line text-sm" aria-label="Movimientos">
            {movements.map(({ movement: m, productName, firstName, lastName }) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-1.5">
                <span className="text-ink-soft">{m.movedOn}</span>
                <Chip tone={m.kind === "SALE" ? "brand" : m.kind === "IN" ? "mint" : "neutral"}>
                  {KIND_LABELS[m.kind]}
                </Chip>
                <span className="flex-1">
                  {productName} · {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  {firstName
                    ? ` · ${firstName} ${lastName}`
                    : m.method
                      ? ` · ${METHOD_LABELS[m.method]}`
                      : ""}
                </span>
                {m.kind === "SALE" && (
                  <span className="font-semibold tabular-nums">{formatCOP(-m.quantity * m.unitPrice)}</span>
                )}
              </li>
            ))}
            {movements.length === 0 && <li className="py-2 text-ink-soft">Sin movimientos.</li>}
          </ul>
        </Card>
      </div>
      <InventoryForms
        slug={slug}
        products={items
          .filter((p) => p.active)
          .map((p) => ({ id: p.id, name: p.name, price: p.price, stock: p.stock }))}
        athletes={athletes.map((a) => ({ id: a.id, name: `${a.firstName} ${a.lastName}` }))}
      />
    </div>
  );
}
