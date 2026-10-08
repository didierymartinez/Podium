import "server-only";
import { db } from "./client";
import { runInTenant, type TenantContext, type Tx } from "./rls";

export type { TenantContext, Tx };

/** `runInTenant` con la conexión de la aplicación. */
export function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runInTenant(db, ctx, fn);
}
