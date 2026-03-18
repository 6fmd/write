const KEY = 'write-md:documents';
const ACTIVE_KEY = 'write-md:active';

export function listDocs() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function getDoc(id) {
  return listDocs()[id] ?? null;
}

export function saveDoc(id, { title, content, updatedAt }) {
  const docs = listDocs();
  docs[id] = { id, title, content, updatedAt: updatedAt ?? new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(docs));
  return docs[id];
}

export function deleteDoc(id) {
  const docs = listDocs();
  delete docs[id];
  localStorage.setItem(KEY, JSON.stringify(docs));
}

export function getActiveDocId() {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveDocId(id) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function extractTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : 'Untitled';
}
