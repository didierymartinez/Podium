/** Lectura tipada de FormData en server actions. */
export function formReader(form: FormData, prefix = "") {
  const text = (key: string) => String(form.get(prefix + key) ?? "");
  return {
    text,
    nullable: (key: string) => text(key) || null,
    int: (key: string) => {
      const digits = text(key).replace(/\D/g, "");
      return digits ? Number(digits) : Number.NaN;
    },
    bool: (key: string) => form.get(prefix + key) === "on" || form.get(prefix + key) === "true",
  };
}
