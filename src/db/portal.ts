import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto "familia" (#44): todo lo que se consulte dentro de `asPortalUser` lleva `app.portal_user_id`
 * y las políticas RLS restrictivas limitan las filas a los hijos, cuentas y avisos de esa persona.
 * La administración y las tareas del sistema no lo usan.
 */
const store = new AsyncLocalStorage<{ userId: string }>();

export function asPortalUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return store.run({ userId }, fn);
}

export const portalUserId = () => store.getStore()?.userId ?? null;
