import "server-only";
import path from "node:path";
import { serverEnv } from "@/env";
import { diskStorage, type DiskStorageHandlers } from "./local";
import { s3Storage } from "./s3";
import type { Storage } from "./types";

export type { Storage } from "./types";

/** Tamaño máximo aceptado por cualquier subida (los tipos de archivo tienen límites menores). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

let cached: (Storage & Partial<DiskStorageHandlers>) | undefined;

/** Implementación según `STORAGE_DRIVER`: "s3" (R2/S3/MinIO) o "local" (disco). */
export function storage(): Storage & Partial<DiskStorageHandlers> {
  if (cached) return cached;
  const env = serverEnv();
  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error("Faltan S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID o S3_SECRET_ACCESS_KEY");
    }
    cached = s3Storage({
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      region: env.S3_REGION,
    });
  } else {
    cached = diskStorage({
      dir: env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), ".data", "storage"),
      secret: `storage:${env.SESSION_SECRET}`,
    });
  }
  return cached;
}
