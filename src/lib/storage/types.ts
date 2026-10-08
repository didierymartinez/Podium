/** Almacenamiento de archivos (regla de portabilidad #5): R2, S3, MinIO o disco local. */
export interface Storage {
  /** URL firmada para subir un archivo directamente desde el navegador (PUT). */
  presignPut(key: string, contentType: string, expiresSeconds?: number): Promise<string>;
  /** URL firmada y temporal para descargar o ver un archivo. */
  presignGet(key: string, expiresSeconds?: number): Promise<string>;
  /** Tamaño y tipo del objeto, o null si no existe. */
  head(key: string): Promise<{ size: number; contentType: string | null } | null>;
  delete(key: string): Promise<void>;
  /** Contenido del archivo (para incrustarlo en PDFs, p. ej. el logo), o null si no existe. */
  read(key: string): Promise<Uint8Array | null>;
}
