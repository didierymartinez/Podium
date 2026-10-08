"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Card, Field, Input, SectionTitle, Select } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import { METHOD_LABELS } from "@/modules/billing/labels";
import {
  createProductAction,
  moveStockAction,
  sellProductAction,
  updateProductAction,
} from "../egresos/actions";

type Msg = { tone: "info" | "danger"; text: string } | null;
const toMsg = (r: { ok: boolean; message?: string }, ok: string): Msg =>
  r.ok ? { tone: "info", text: ok } : { tone: "danger", text: r.message ?? "No se pudo guardar." };

export function ProductRow({
  slug,
  product,
}: {
  slug: string;
  product: { id: string; name: string; price: number; stock: number; active: boolean };
}) {
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <span
        className={
          product.active ? "flex-1 font-semibold" : "flex-1 font-semibold text-ink-soft line-through"
        }
      >
        {product.name}
      </span>
      <span className="tabular-nums">{formatCOP(product.price)}</span>
      <span className={product.stock === 0 ? "font-semibold text-danger" : "text-ink-soft"}>
        {product.stock} en stock
      </span>
      <Button
        variant="ghost"
        className="h-8"
        disabled={pending}
        onClick={() =>
          start(
            async () =>
              void (await updateProductAction(slug, product.id, {
                price: product.price,
                active: !product.active,
              })),
          )
        }
      >
        {product.active ? "Desactivar" : "Activar"}
      </Button>
    </li>
  );
}

export function InventoryForms({
  slug,
  products,
  athletes,
}: {
  slug: string;
  products: { id: string; name: string; price: number; stock: number }[];
  athletes: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [newProduct, setNewProduct] = useState({ name: "", price: "" });
  const [stock, setStock] = useState({ productId: "", quantity: "", note: "" });
  const [sale, setSale] = useState({
    productId: "",
    quantity: "1",
    to: "cash" as "cash" | "athlete",
    athleteId: athletes[0]?.id ?? "",
    method: "CASH" as "CASH" | "TRANSFER" | "DEPOSIT" | "CARD",
  });
  const [msg, setMsg] = useState<{ product: Msg; stock: Msg; sale: Msg }>({
    product: null,
    stock: null,
    sale: null,
  });
  // Si el producto elegido ya no está (o la lista estaba vacía al cargar), se usa el primero.
  const pick = (id: string) => (products.some((p) => p.id === id) ? id : (products[0]?.id ?? ""));
  const saleProductId = pick(sale.productId);
  const stockProductId = pick(stock.productId);
  const product = products.find((p) => p.id === saleProductId);

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle>Vender</SectionTitle>
        <form
          className="space-y-3"
          aria-label="Vender producto"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await sellProductAction(slug, {
                productId: saleProductId,
                quantity: Number(sale.quantity),
                athleteId: sale.to === "athlete" ? sale.athleteId : null,
                method: sale.to === "cash" ? sale.method : null,
              });
              setMsg((m) => ({
                ...m,
                sale: toMsg(
                  r,
                  sale.to === "athlete" ? "Venta cargada a la cuenta del alumno." : "Venta registrada.",
                ),
              }));
            });
          }}
        >
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <Field label="Producto a vender">
              <Select
                value={sale.productId}
                onChange={(e) => setSale((s) => ({ ...s, productId: e.target.value }))}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.stock})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cantidad">
              <Input
                type="number"
                min={1}
                max={100}
                value={sale.quantity}
                onChange={(e) => setSale((s) => ({ ...s, quantity: e.target.value }))}
              />
            </Field>
          </div>
          <div role="radiogroup" aria-label="Forma de venta" className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={sale.to === "cash"}
                onChange={() => setSale((s) => ({ ...s, to: "cash" }))}
              />
              De contado
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={sale.to === "athlete"}
                onChange={() => setSale((s) => ({ ...s, to: "athlete" }))}
              />
              A la cuenta de un alumno
            </label>
          </div>
          {sale.to === "athlete" ? (
            <Field label="Alumno">
              <Select
                value={sale.athleteId}
                onChange={(e) => setSale((s) => ({ ...s, athleteId: e.target.value }))}
              >
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Medio de pago">
              <Select
                value={sale.method}
                onChange={(e) => setSale((s) => ({ ...s, method: e.target.value as typeof s.method }))}
              >
                {(["CASH", "TRANSFER", "DEPOSIT", "CARD"] as const).map((k) => (
                  <option key={k} value={k}>
                    {METHOD_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {product && (
            <p className="text-sm">Total: {formatCOP(product.price * (Number(sale.quantity) || 0))}</p>
          )}
          {msg.sale && <Alert tone={msg.sale.tone}>{msg.sale.text}</Alert>}
          <Button type="submit" disabled={pending || !products.length}>
            Registrar venta
          </Button>
        </form>
      </Card>
      <Card>
        <SectionTitle>Entrada de mercancía</SectionTitle>
        <form
          className="space-y-3"
          aria-label="Entrada de mercancía"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await moveStockAction(slug, {
                productId: stockProductId,
                quantity: Number(stock.quantity),
                kind: Number(stock.quantity) > 0 ? "IN" : "ADJUST",
                note: stock.note,
              });
              setMsg((m) => ({ ...m, stock: toMsg(r, "Inventario actualizado.") }));
              if (r.ok) setStock((s) => ({ ...s, quantity: "", note: "" }));
            });
          }}
        >
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <Field label="Producto que entra">
              <Select
                value={stock.productId}
                onChange={(e) => setStock((s) => ({ ...s, productId: e.target.value }))}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unidades" hint="Negativo para ajustar">
              <Input
                type="number"
                value={stock.quantity}
                onChange={(e) => setStock((s) => ({ ...s, quantity: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Nota">
            <Input
              value={stock.note}
              maxLength={160}
              onChange={(e) => setStock((s) => ({ ...s, note: e.target.value }))}
            />
          </Field>
          {msg.stock && <Alert tone={msg.stock.tone}>{msg.stock.text}</Alert>}
          <Button type="submit" variant="secondary" disabled={pending || !products.length}>
            Guardar movimiento
          </Button>
        </form>
      </Card>
      <Card>
        <SectionTitle>Nuevo producto</SectionTitle>
        <form
          className="space-y-3"
          aria-label="Nuevo producto"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createProductAction(slug, {
                name: newProduct.name,
                price: Number(newProduct.price.replace(/\D/g, "")),
              });
              setMsg((m) => ({ ...m, product: toMsg(r, "Producto creado.") }));
              if (r.ok) setNewProduct({ name: "", price: "" });
            });
          }}
        >
          <Field label="Nombre del producto">
            <Input
              value={newProduct.name}
              maxLength={80}
              onChange={(e) => setNewProduct((s) => ({ ...s, name: e.target.value }))}
            />
          </Field>
          <Field label="Precio">
            <Input
              inputMode="numeric"
              value={newProduct.price}
              onChange={(e) => setNewProduct((s) => ({ ...s, price: e.target.value }))}
            />
          </Field>
          {msg.product && <Alert tone={msg.product.tone}>{msg.product.text}</Alert>}
          <Button type="submit" variant="secondary" disabled={pending}>
            Crear producto
          </Button>
        </form>
      </Card>
    </div>
  );
}
