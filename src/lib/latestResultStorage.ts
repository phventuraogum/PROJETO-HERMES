type StoredResultSummary<TConfig> = {
  timestamp: string;
  config: TConfig;
  total_empresas: number;
};

export type StoredResult<TConfig, TResult extends { total_empresas: number }> = {
  timestamp: string;
  config: TConfig;
  resultado: TResult;
};

const RESULT_DB_NAME = "hermes-results";
const RESULT_STORE_NAME = "latest-results";
const RESULT_RECORD_VERSION = 1;

function getResultSummary<TConfig, TResult extends { total_empresas: number }>(
  payload: StoredResult<TConfig, TResult>,
): StoredResultSummary<TConfig> {
  return {
    timestamp: payload.timestamp,
    config: payload.config,
    total_empresas: payload.resultado.total_empresas,
  };
}

function openResultDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.open(RESULT_DB_NAME, RESULT_RECORD_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RESULT_STORE_NAME)) {
        db.createObjectStore(RESULT_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function saveLatestResult<TConfig, TResult extends { total_empresas: number }>(
  storageKey: string,
  payload: StoredResult<TConfig, TResult>,
): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(`${storageKey}:summary`, JSON.stringify(getResultSummary(payload)));
  } catch (err) {
    console.warn("[Hermes] Falha ao salvar resumo do resultado no localStorage:", err);
  }

  let legacySaved = false;
  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
    legacySaved = true;
  } catch (err) {
    console.warn("[Hermes] Falha ao salvar resultado completo no localStorage:", err);
  }

  const db = await openResultDb();
  if (db) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(RESULT_STORE_NAME, "readwrite");
      const store = tx.objectStore(RESULT_STORE_NAME);

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Falha ao salvar resultado no IndexedDB"));
      };

      store.put(payload, storageKey);
    });
    return;
  }

  if (legacySaved) return;
  throw new Error("Resultado gerado, mas o navegador nao conseguiu persistir os dados.");
}

export async function loadLatestResult<TConfig, TResult extends { total_empresas: number }>(
  storageKey: string,
): Promise<StoredResult<TConfig, TResult> | null> {
  if (typeof window === "undefined") return null;

  const db = await openResultDb();
  if (db) {
    const value = await new Promise<StoredResult<TConfig, TResult> | null>((resolve) => {
      const tx = db.transaction(RESULT_STORE_NAME, "readonly");
      const store = tx.objectStore(RESULT_STORE_NAME);
      const request = store.get(storageKey);

      request.onsuccess = () => resolve((request.result as StoredResult<TConfig, TResult> | undefined) ?? null);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });

    if (value) return value;
  }

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as StoredResult<TConfig, TResult>;
  } catch {
    return null;
  }
}
