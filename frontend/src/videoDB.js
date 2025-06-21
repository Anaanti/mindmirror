import {openDB} from 'idb';

const DB_NAME = 'mindmirror-videos';
const STORE_NAME = 'videos';

// Initialize the IndexedDB with a version and create an object store
// if it doesn't already exist. The object store uses 'id' as the key path.
const dbPromise = openDB(DB_NAME, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, {keyPath: 'id'});
    }
  },
});

// Saves a video blob to the IndexedDB
// The key is the video ID, and the value is the blob
export async function saveVideoBlob(key, blob){
  const db = await dbPromise;
  await db.put(STORE_NAME, { id: key, blob });

}

export async function getVideoBlob(key) {
  const db = await dbPromise;
  const result = await db.get(STORE_NAME, key);
  return result?.blob || null;
}