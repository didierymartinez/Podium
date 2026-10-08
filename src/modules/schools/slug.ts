/** Rutas de primer nivel y palabras que no pueden usarse como URL de una escuela. */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "ayuda",
  "blog",
  "escuelas",
  "i",
  "ingresar",
  "invitacion",
  "login",
  "logout",
  "manifest",
  "nueva-escuela",
  "planes",
  "podium",
  "precios",
  "privacidad",
  "registro",
  "salir",
  "signup",
  "sin-conexion",
  "soporte",
  "static",
  "terminos",
  "verificar-email",
  "www",
]);

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Convierte un nombre en una URL sugerida: "Club Patín Veloz" → "club-patin-veloz". */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

export type SlugError = "too_short" | "too_long" | "invalid_chars" | "reserved";

export function validateSlug(slug: string): SlugError | null {
  if (slug.length < SLUG_MIN) return "too_short";
  if (slug.length > SLUG_MAX) return "too_long";
  if (!SLUG_RE.test(slug)) return "invalid_chars";
  if (RESERVED_SLUGS.has(slug)) return "reserved";
  return null;
}

export const SLUG_ERROR_MESSAGES: Record<SlugError, string> = {
  too_short: `La URL debe tener al menos ${SLUG_MIN} caracteres`,
  too_long: `La URL puede tener máximo ${SLUG_MAX} caracteres`,
  invalid_chars: "Usa solo letras minúsculas, números y guiones (sin tildes ni espacios)",
  reserved: "Esa URL está reservada, elige otra",
};
