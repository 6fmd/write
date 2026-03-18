import { get, set, del } from 'idb-keyval';

const KEY = 'write-md:documents';
const ACTIVE_KEY = 'write-md:active';

export async function migrateFromLocalStorage() {
  const localDocsRaw = localStorage.getItem(KEY);
  if (localDocsRaw) {
    try {
      const docs = JSON.parse(localDocsRaw);
      await set(KEY, docs);
      localStorage.removeItem(KEY);
      
      const activeId = localStorage.getItem(ACTIVE_KEY);
      if (activeId) {
        await set(ACTIVE_KEY, activeId);
        localStorage.removeItem(ACTIVE_KEY);
      }
      console.log('Migrated storage to IndexedDB');
    } catch (e) {
      console.error('Failed to migrate data:', e);
    }
  }
}

export async function listDocs() {
  try {
    const data = await get(KEY);
    return data || {};
  } catch {
    return {};
  }
}

export async function getDoc(id) {
  const docs = await listDocs();
  return docs[id] ?? null;
}

export async function saveDoc(id, { title, content, customTitle, updatedAt }) {
  const docs = await listDocs();
  const prev = docs[id] ?? { id };
  const next = {
    ...prev,
    ...(title !== undefined ? { title } : {}),
    ...(content !== undefined ? { content } : {}),
    ...(customTitle !== undefined ? { customTitle } : {}),
    updatedAt: updatedAt ?? new Date().toISOString(),
    id,
  };
  docs[id] = next;
  await set(KEY, docs);
  return docs[id];
}

export async function deleteDoc(id) {
  const docs = await listDocs();
  delete docs[id];
  await set(KEY, docs);
}

export async function getActiveDocId() {
  return await get(ACTIVE_KEY);
}

export async function setActiveDocId(id) {
  await set(ACTIVE_KEY, id);
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function extractTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : 'Untitled';
}

export async function getStorageUsage() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage, quota };
    } catch {
      return null;
    }
  }
  return null;
}
