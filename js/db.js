// Armazenamento local (IndexedDB). As fotos ficam como Blob, direto no aparelho.

let dbName = 'guardaroupas';
let dbPromise;

// Com login, cada usuário tem o próprio banco local. Chamar antes do primeiro acesso.
export function useNamespace(userId) {
  dbName = `guardaroupas-${userId}`;
  dbPromise = undefined;
}

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('items', { keyPath: 'id' });
      db.createObjectStore('wears', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const remove = (store, id) => run(store, 'readwrite', (s) => s.delete(id));
export const uid = () => crypto.randomUUID();
