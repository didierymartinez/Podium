import { AwsClient } from "aws4fetch";
import type { Storage } from "./types";

export type S3Config = {
  endpoint: string; // https://<cuenta>.r2.cloudflarestorage.com o http://localhost:9000 (MinIO)
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
};

/** Cualquier proveedor con API S3 (Cloudflare R2, AWS S3, MinIO), con direcciones path-style. */
export function s3Storage(config: S3Config): Storage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region ?? "auto",
  });
  const objectUrl = (key: string) =>
    `${config.endpoint.replace(/\/$/, "")}/${config.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  async function presign(
    method: "GET" | "PUT",
    key: string,
    expires: number,
    headers?: Record<string, string>,
  ) {
    const url = new URL(objectUrl(key));
    url.searchParams.set("X-Amz-Expires", String(expires));
    const signed = await client.sign(url.toString(), { method, headers, aws: { signQuery: true } });
    return signed.url;
  }

  return {
    presignPut: (key, contentType, expires = 600) =>
      presign("PUT", key, expires, { "content-type": contentType }),
    presignGet: (key, expires = 60) => presign("GET", key, expires),
    async head(key) {
      const res = await client.fetch(objectUrl(key), { method: "HEAD" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Storage HEAD ${res.status}`);
      return {
        size: Number(res.headers.get("content-length") ?? 0),
        contentType: res.headers.get("content-type"),
      };
    },
    async read(key) {
      const res = await client.fetch(objectUrl(key));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Storage GET ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async delete(key) {
      const res = await client.fetch(objectUrl(key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`Storage DELETE ${res.status}`);
    },
  };
}
