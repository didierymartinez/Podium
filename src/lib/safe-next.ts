/** Solo se permite volver a rutas internas de invitación (evita redirecciones abiertas). */
export function safeNext(value: unknown): string | null {
  return typeof value === "string" && /^\/i\/[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
