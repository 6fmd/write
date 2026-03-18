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

export function saveDoc(id, { title, content, customTitle, updatedAt }) {
  const docs = listDocs();
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
