import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado de campos sensibles (datos de salud, ADM-73) con AES-256-GCM.
 * Clave: DATA_ENCRYPTION_KEY = 32 bytes en base64 (`openssl rand -base64 32`).
 * Formato guardado: "v1:<iv>:<tag>:<cifrado>" en base64.
 */
function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  const buf = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (buf.length !== 32) throw new Error("DATA_ENCRYPTION_KEY debe ser de 32 bytes en base64");
  return buf;
}

export function encryptField(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(
    ":",
  );
}

export function decryptField(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Formato de cifrado desconocido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
