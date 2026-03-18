const GH_CONFIG_KEY = 'write-md:github';

export function getGithubConfig() {
  try {
    return JSON.parse(localStorage.getItem(GH_CONFIG_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveGithubConfig(config) {
  localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(config));
}

export function clearGithubConfig() {
  localStorage.removeItem(GH_CONFIG_KEY);
}

async function ghFetch(path, options = {}, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `GitHub API error ${res.status}`);
  }
  return res.json();
}

// List markdown files in the configured repo/path
export async function listRemoteFiles({ token, owner, repo, path = '' }) {
  const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`, {}, token);
  return (Array.isArray(data) ? data : [data])
    .filter(f => f.type === 'file' && f.name.endsWith('.md'));
}

// Read a file — returns { content: string, sha: string }
export async function readRemoteFile({ token, owner, repo, filePath }) {
  const data = await ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`, {}, token);
  const content = atob(data.content.replace(/\n/g, ''));
  return { content, sha: data.sha };
}

// Write (create or update) a file
export async function writeRemoteFile({ token, owner, repo, filePath, content, sha, message }) {
  const body = {
    message: message ?? `update ${filePath}`,
    content: btoa(unescape(encodeURIComponent(content))),
    ...(sha ? { sha } : {}),
  };
  return ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }, token);
}

// Delete a file
export async function deleteRemoteFile({ token, owner, repo, filePath, sha, message }) {
  return ghFetch(`/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: message ?? `delete ${filePath}`, sha }),
  }, token);
}
