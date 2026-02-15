// IndexedDB Cache Service

const DB_NAME = 'tourcal-cache';
const DB_VERSION = 1;
const STORE_NAME = 'data';

class CacheService {
  constructor() {
    this._db = null;
  }

  async _getDB() {
    if (this._db) return this._db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this._db = e.target.result;
        resolve(this._db);
      };

      request.onerror = (e) => {
        console.warn('IndexedDB open error:', e);
        reject(e);
      };
    });
  }

  async put(key, value, ttl = 3600000) {
    try {
      const db = await this._getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        key,
        value,
        timestamp: Date.now(),
        expires: Date.now() + ttl
      });
      return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    } catch (e) {
      console.warn('Cache put error:', e);
    }
  }

  async get(key, ignoreExpiry = false) {
    try {
      const db = await this._getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          if (!result) {
            resolve(null);
            return;
          }
          if (!ignoreExpiry && result.expires < Date.now()) {
            resolve(null);
            return;
          }
          resolve(result.value);
        };
        request.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('Cache get error:', e);
      return null;
    }
  }

  async remove(key) {
    try {
      const db = await this._getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
    } catch (e) {
      console.warn('Cache remove error:', e);
    }
  }

  async clear() {
    try {
      const db = await this._getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
    } catch (e) {
      console.warn('Cache clear error:', e);
    }
  }

  // Generate cache key for tour-scoped data
  tourKey(tourId, type) {
    return `${tourId}:${type}`;
  }
}

export const cache = new CacheService();
