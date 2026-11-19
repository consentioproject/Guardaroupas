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
    const req = indexedDB.open(dbName, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['items', 'wears']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      // v2: configurações soltas (ex.: foto do corpo para o provador), chave → valor
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
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
export const getMeta = (key) => run('meta', 'readonly', (s) => s.get(key));
export const setMeta = (key, value) => run('meta', 'readwrite', (s) => s.put(value, key));
export const delMeta = (key) => run('meta', 'readwrite', (s) => s.delete(key));
export const uid =() => crypto.randomUUID();
