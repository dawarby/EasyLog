import { Trip, Backup } from '../types';

const DB_NAME = 'EasyLogDB';
const LEGACY_DB_NAME = 'SnapLogDB';
const STORE_NAME = 'handles';
const KEY_ROOT_HANDLE = 'root_dir_handle';
const BACKUP_FOLDER_NAME = 'easylog';

// Module-level cache for the handle to persist permission state across calls within a session
let cachedRootHandle: any = null;

// --- IndexedDB Helpers ---

const openDB = (dbName: string = DB_NAME): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getStoredHandle = async (): Promise<any | undefined> => {
  // Return cached handle if available to maintain permission state
  if (cachedRootHandle) return cachedRootHandle;

  try {
    let db = await openDB(DB_NAME);
    let handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(KEY_ROOT_HANDLE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Check legacy DB if not yet found in EasyLogDB
    if (!handle) {
      try {
        const legacyDb = await openDB(LEGACY_DB_NAME);
        handle = await new Promise((resolve, reject) => {
          const tx = legacyDb.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(KEY_ROOT_HANDLE);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (handle) {
          // Migrate handle to EasyLogDB
          saveHandleToDB(handle);
        }
      } catch (err) {
        // Legacy DB not present or accessible
      }
    }

    if (handle) {
      cachedRootHandle = handle;
    }
    return handle;
  } catch (e) {
    console.error("IDB Error", e);
    return undefined;
  }
};

const saveHandleToDB = async (handle: any) => {
  cachedRootHandle = handle; // Update cache
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(handle, KEY_ROOT_HANDLE);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// --- File System Logic ---

export const disconnectDirectory = async (): Promise<void> => {
  cachedRootHandle = null;
  try {
      const db = await openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(KEY_ROOT_HANDLE);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
  } catch(e) {
      console.error("Failed to disconnect", e);
  }
};

export const checkDirectoryConnection = async (): Promise<boolean> => {
  const handle = await getStoredHandle();
  return !!handle;
};

export const getConnectedFolderName = async (): Promise<string | null> => {
  try {
    const handle = await getStoredHandle();
    return handle ? handle.name : null;
  } catch (e) {
    return null;
  }
};

export const connectDirectory = async (): Promise<boolean> => {
  try {
    if (!('showDirectoryPicker' in window)) {
       console.warn("File System Access API not supported in this browser.");
       return false;
    }
    // Request readwrite access immediately to avoid subsequent prompts
    // @ts-ignore
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveHandleToDB(handle);
    return true;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // User cancelled the picker, not an error
      return false;
    }
    if (err.name === 'SecurityError' || err.message?.includes('Cross origin')) {
      console.warn('Directory picker blocked by browser security (likely iframe/preview restriction).');
      return false;
    }
    console.error('Directory selection failed:', err);
    return false;
  }
};

const verifyPermission = async (handle: any, readWrite = false, isAuto = false): Promise<boolean> => {
  try {
    // Use 'any' cast for handle as Permission API types might be missing in the environment
    const options = { mode: readWrite ? 'readwrite' : 'read' };
    
    // Check if we already have permission
    // @ts-ignore
    if ((await handle.queryPermission(options)) === 'granted') return true;
    
    // In auto mode (background save), DO NOT request permission as it blocks/crashes if not user-triggered
    if (isAuto) return false;

    // If not auto, we must request it. This requires a user gesture.
    // @ts-ignore
    if ((await handle.requestPermission(options)) === 'granted') return true;
    
    return false;
  } catch (error) {
    // This often fails if called without a user gesture (e.g. auto-backup on load)
    return false;
  }
};

export const saveSnapshotToFolder = async (data: Trip[], isAuto = false): Promise<{success: boolean, path?: string, error?: 'permission' | 'unknown'}> => {
  try {
    const rootHandle = await getStoredHandle();
    if (!rootHandle) return { success: false, error: 'unknown' };

    // We might need to request permission again if it lapsed
    // Pass isAuto to prevent unexpected prompts
    const hasPerm = await verifyPermission(rootHandle, true, isAuto);
    if (!hasPerm) return { success: false, error: 'permission' };

    // Get or Create backup folder
    // @ts-ignore
    const appDir = await rootHandle.getDirectoryHandle(BACKUP_FOLDER_NAME, { create: true });

    // Format: backup-YYYY-MM-DDTHH-mm-ss.json
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.json`;

    // Write file
    // @ts-ignore
    const fileHandle = await appDir.getFileHandle(filename, { create: true });
    // @ts-ignore
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();

    // Cleanup old backups (Keep last 50)
    await cleanupOldBackups(appDir);
    
    // Construct path string for display
    const displayPath = `${rootHandle.name}/${BACKUP_FOLDER_NAME}/${filename}`;
    
    return { success: true, path: displayPath };
  } catch (err) {
    console.error('Backup to folder failed:', err);
    // @ts-ignore
    if (err.name === 'NotAllowedError' || err.code === 0) {
       return { success: false, error: 'permission' };
    }
    return { success: false, error: 'unknown' };
  }
};

const cleanupOldBackups = async (dirHandle: any) => {
    try {
        const backups: {name: string, time: number}[] = [];
        
        // @ts-ignore
        for await (const [name, handle] of dirHandle.entries()) {
            if (name.startsWith('backup-') && name.endsWith('.json')) {
              // We use the filename for sorting as it contains the ISO timestamp
              backups.push({ name, time: 0 });
            }
        }
        
        // Sort descending (newest first)
        backups.sort((a, b) => b.name.localeCompare(a.name)); 
        
        // Delete anything after the 50th item
        const toDelete = backups.slice(50);
        for (const file of toDelete) {
            // @ts-ignore
            await dirHandle.removeEntry(file.name);
        }
    } catch (e) {
        console.error("Cleanup failed", e);
    }
};

export const listExternalBackups = async (): Promise<Backup[]> => {
  try {
    const rootHandle = await getStoredHandle();
    if (!rootHandle) return [];
    
    // For listing, we only need read permission
    const hasPerm = await verifyPermission(rootHandle, false, true); // Auto mode true to check without prompting
    if (!hasPerm) return [];

    // @ts-ignore
    const appDir = await rootHandle.getDirectoryHandle(BACKUP_FOLDER_NAME, { create: false });
    const backups: Backup[] = [];

    // @ts-ignore
    for await (const [name, handle] of appDir.entries()) {
      if (name.startsWith('backup-') && name.endsWith('.json') && handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile();
        // We won't parse the full JSON here for performance, just metadata from file
        // ID is the filename
        backups.push({
          id: name,
          timestamp: new Date(file.lastModified).toISOString(),
          tripCount: 0, // Unknown without reading
          sizeBytes: file.size,
          data: [] // Empty until restored
        });
      }
    }
    
    // Sort new to old
    return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  } catch (err) {
    // Directory might not exist yet or permission denied
    return [];
  }
};

export const loadBackupFile = async (filename: string): Promise<Trip[] | null> => {
  try {
    const rootHandle = await getStoredHandle();
    if (!rootHandle) return null;
    
    // @ts-ignore
    const appDir = await rootHandle.getDirectoryHandle(BACKUP_FOLDER_NAME, { create: false });
    // @ts-ignore
    const fileHandle = await appDir.getFileHandle(filename);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (err) {
    console.error("Failed to read file", err);
    return null;
  }
};