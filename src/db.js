/**
 * IndexedDB wrapper - no dependencies on other app modules.
 */

const ImagenDB = {
    dbName: 'ImagenDB',
    storeName: 'images',
    orchestratorStoreName: 'orchestratorBlobs',
    db: null,

    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 2);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
                if (!db.objectStoreNames.contains(this.orchestratorStoreName)) {
                    db.createObjectStore(this.orchestratorStoreName, { keyPath: 'key' });
                }
            };
        });
    },

    async saveImage(imageData) {
        await this.ensureOpen();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(imageData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getAllImages() {
        await this.ensureOpen();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            request.onsuccess = () => {
                // Sort by createdAt descending (newest first)
                const images = request.result.sort((a, b) =>
                    new Date(b.createdAt) - new Date(a.createdAt)
                );
                resolve(images);
            };
            request.onerror = () => reject(request.error);
        });
    },

    async deleteImage(id) {
        await this.ensureOpen();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async clearAll() {
        await this.ensureOpen();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async ensureOpen() {
        if (!this.db) {
            await this.open();
        }
    },

    // --- Orchestrator blob storage (source/reference images) ---
    async saveOrchestratorBlob(key, dataUri) {
        await this.ensureOpen();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([this.orchestratorStoreName], 'readwrite');
            const store = tx.objectStore(this.orchestratorStoreName);
            const request = store.put({ key, dataUri });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async getOrchestratorBlob(key) {
        await this.ensureOpen();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([this.orchestratorStoreName], 'readonly');
            const store = tx.objectStore(this.orchestratorStoreName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result?.dataUri || null);
            request.onerror = () => reject(request.error);
        });
    },

    async deleteOrchestratorBlob(key) {
        await this.ensureOpen();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([this.orchestratorStoreName], 'readwrite');
            const store = tx.objectStore(this.orchestratorStoreName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

export default ImagenDB;
