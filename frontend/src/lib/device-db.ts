export function deviceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("fonsat-clock-v1", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("events")) {
        const events = db.createObjectStore("events", { keyPath: "id" });
        events.createIndex("userId", "userId");
      }
      const events = request.transaction!.objectStore("events");
      if (!events.indexNames.contains("scope"))
        events.createIndex("scope", "scope");
      if (!db.objectStoreNames.contains("sessions"))
        db.createObjectStore("sessions", { keyPath: "userId" });
      if (!db.objectStoreNames.contains("scopedSessions"))
        db.createObjectStore("scopedSessions", { keyPath: "key" });
      if (!db.objectStoreNames.contains("contexts")) {
        const contexts = db.createObjectStore("contexts", { keyPath: "key" });
        contexts.createIndex("userId", "userId");
      }
      if (!db.objectStoreNames.contains("metadata"))
        db.createObjectStore("metadata", { keyPath: "key" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () =>
      reject(
        new Error(
          "Não foi possível abrir os dados locais. As marcações guardadas foram preservadas.",
        ),
      );
    request.onblocked = () => {
      request.onsuccess = () => request.result.close();
      reject(
        new Error(
          "Feche os outros separadores da aplicação e tente novamente.",
        ),
      );
    };
  });
}
export async function deviceRead<T>(
  store: string,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await deviceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    let value: T;
    const request = operation(tx.objectStore(store));
    request.onsuccess = () => {
      value = request.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(new Error("Não foi possível ler os dados guardados."));
    };
  });
}
export async function deviceWrite(
  stores: string[],
  operation: (tx: IDBTransaction) => void,
): Promise<void> {
  const db = await deviceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        new Error(
          "A alteração não foi guardada no dispositivo. Tente novamente.",
        ),
      );
    };
    try {
      operation(tx);
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}
