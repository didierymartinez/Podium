import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Storage } from "./types";

/**
 * Disco local con URLs firmadas servidas por `/api/storage/[...key]`.
 * Para desarrollo, pruebas E2E y un VPS con un solo servidor.
 */
export function diskStorage(config: { dir: string; secret: string }): Storage & DiskStorageHandlers {
  const fileOf = (key: string) => {
    const full = path.resolve(config.dir, key);
    if (!full.startsWith(path.resolve(config.dir) + path.sep)) throw new Error("Ruta inválida");
    return full;
  };
  const sign = (method: string, key: string, exp: number, contentType = "") =>
    createHmac("sha256", config.secret)
      .update(`${method}\n${key}\n${exp}\n${contentType}`)
      .digest("base64url");
  const url = (method: string, key: string, expires: number, contentType?: string) => {
    const exp = Math.floor(Date.now() / 1000) + expires;
    const params = new URLSearchParams({ exp: String(exp), sig: sign(method, key, exp, contentType) });
    return `/api/storage/${key}?${params}`;
  };
  const metaOf = (key: string) => `${fileOf(key)}.meta.json`;

  function verify(method: string, key: string, search: URLSearchParams, contentType = "") {
    const exp = Number(search.get("exp"));
    const sig = search.get("sig") ?? "";
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
    const expected = Buffer.from(sign(method, key, exp, contentType));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  return {
    presignPut: async (key, contentType, expires = 600) => url("PUT", key, expires, contentType),
    presignGet: async (key, expires = 60) => url("GET", key, expires),
    async head(key) {
      try {
        const info = await stat(fileOf(key));
        const meta = JSON.parse(await readFile(metaOf(key), "utf8")) as { contentType: string };
        return { size: info.size, contentType: meta.contentType };
      } catch {
        return null;
      }
    },
    async read(key) {
      try {
        return new Uint8Array(await readFile(fileOf(key)));
      } catch {
        return null;
      }
    },
    async delete(key) {
      await rm(fileOf(key), { force: true });
      await rm(metaOf(key), { force: true });
    },
    async handlePut(key, search, contentType, body, maxBytes) {
      if (!verify("PUT", key, search, contentType)) return 403;
      if (body.byteLength > maxBytes) return 413;
      await mkdir(path.dirname(fileOf(key)), { recursive: true });
      await writeFile(fileOf(key), body);
      await writeFile(metaOf(key), JSON.stringify({ contentType }));
      return 200;
    },
    async handleGet(key, search) {
      if (!verify("GET", key, search)) return { status: 403 };
      try {
        const meta = JSON.parse(await readFile(metaOf(key), "utf8")) as { contentType: string };
        return { status: 200, body: await readFile(fileOf(key)), contentType: meta.contentType };
      } catch {
        return { status: 404 };
      }
    },
  };
}

export type DiskStorageHandlers = {
  handlePut(
    key: string,
    search: URLSearchParams,
    contentType: string,
    body: Buffer,
    maxBytes: number,
  ): Promise<number>;
  handleGet(
    key: string,
    search: URLSearchParams,
  ): Promise<{ status: number; body?: Buffer; contentType?: string }>;
};
