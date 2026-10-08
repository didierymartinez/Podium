/** IndexedDB mínimo para el modo sin conexión (solo navegador). */
const DB_NAME = "podium";
const VERSION = 1;
export const STORES = ["outbox", "drafts"] as const;
export type Store = (typeof STORES)[number];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  store: Store,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export const idbGet = <T>(store: Store, key: string) =>
  run<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbSet = (store: Store, key: string, value: unknown) =>
  run(store, "readwrite", (s) => s.put(value, key));
export const idbDelete = (store: Store, key: string) => run(store, "readwrite", (s) => s.delete(key));
export const idbAll = <T>(store: Store) => run<T[]>(store, "readonly", (s) => s.getAll());

export async function idbClear() {
  for (const s of STORES) await run(s, "readwrite", (store) => store.clear());
}
