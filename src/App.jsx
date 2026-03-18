import { useState, useEffect, useCallback, useRef } from 'react';
import WysiwygEditor from './components/WysiwygEditor';
import RawEditor from './components/RawEditor';
import GithubModal from './components/GithubModal';
import {
  listDocs, getDoc, saveDoc, deleteDoc,
  getActiveDocId, setActiveDocId, generateId, extractTitle,
} from './lib/storage';
import {
  getGithubConfig, listRemoteFiles, readRemoteFile, writeRemoteFile,
} from './lib/github';

const AUTOSAVE_DELAY = 800;

export default function App() {
  const [docs, setDocs] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [content, setContent] = useState('');
  const [mode, setMode] = useState('wysiwyg'); // 'wysiwyg' | 'raw'
  const [vimMode, setVimMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [githubModal, setGithubModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState(''); // '', 'syncing', 'ok', 'error'
  const [ghConfig, setGhConfig] = useState(getGithubConfig);
  const autosaveTimer = useRef(null);

  // Load docs from localStorage on mount
  useEffect(() => {
    const stored = listDocs();
    setDocs(stored);
    const lastId = getActiveDocId();
    if (lastId && stored[lastId]) {
      setActiveId(lastId);
      setContent(stored[lastId].content ?? '');
    } else {
      const ids = Object.keys(stored);
      if (ids.length > 0) {
        setActiveId(ids[0]);
        setContent(stored[ids[0]].content ?? '');
      }
    }
  }, []);

  function newDoc() {
    const id = generateId();
    const doc = saveDoc(id, { title: 'Untitled', content: '', updatedAt: new Date().toISOString() });
    setDocs(listDocs());
    switchDoc(id, '');
  }

  function switchDoc(id, forcedContent) {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setActiveId(id);
    setActiveDocId(id);
    const c = forcedContent !== undefined ? forcedContent : (getDoc(id)?.content ?? '');
    setContent(c);
  }

  function removeDoc(id) {
    deleteDoc(id);
    const remaining = Object.keys(listDocs());
    setDocs(listDocs());
    if (activeId === id) {
      if (remaining.length > 0) { switchDoc(remaining[0]); }
      else { setActiveId(null); setContent(''); }
    }
  }

  const handleContentChange = useCallback((newContent) => {
    setContent(newContent);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      if (!activeId) return;
      const title = extractTitle(newContent);
      saveDoc(activeId, { title, content: newContent });
      setDocs(listDocs());
    }, AUTOSAVE_DELAY);
  }, [activeId]);

  // GitHub: push current doc
  async function pushDoc() {
    const cfg = getGithubConfig();
    if (!cfg || !activeId) return;
    const doc = getDoc(activeId);
    if (!doc) return;
    setSyncStatus('syncing');
    try {
      const fileName = `${activeId}.md`;
      const filePath = cfg.path ? `${cfg.path.replace(/\/$/, '')}/${fileName}` : fileName;
      // Try to get existing SHA
      let sha;
      try {
        const existing = await readRemoteFile({ ...cfg, filePath });
        sha = existing.sha;
      } catch { /* new file */ }
      await writeRemoteFile({ ...cfg, filePath, content: doc.content, sha });
      setSyncStatus('ok');
      setTimeout(() => setSyncStatus(''), 2000);
    } catch (e) {
      setSyncStatus('error');
      console.error(e);
      setTimeout(() => setSyncStatus(''), 4000);
    }
  }

  // GitHub: pull all remote .md files into localStorage
  async function pullAll() {
    const cfg = getGithubConfig();
    if (!cfg) return;
    setSyncStatus('syncing');
    try {
      const files = await listRemoteFiles(cfg);
      const updated = {};
      for (const f of files) {
        const { content } = await readRemoteFile({ ...cfg, filePath: f.path });
        const id = f.name.replace(/\.md$/, '');
        const doc = saveDoc(id, { title: extractTitle(content), content });
        updated[id] = doc;
      }
      setDocs(listDocs());
      setSyncStatus('ok');
      setTimeout(() => setSyncStatus(''), 2000);
    } catch (e) {
      setSyncStatus('error');
      console.error(e);
      setTimeout(() => setSyncStatus(''), 4000);
    }
  }

  const activeDoc = activeId ? docs[activeId] : null;
  const sortedDocs = Object.values(docs).sort((a, b) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <aside style={{
          width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent)', letterSpacing: '0.1em' }}>write.md</span>
            <button onClick={newDoc} style={btnStyle} title="New document">＋</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
            {sortedDocs.length === 0 && (
              <p style={{ padding: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>No documents yet.</p>
            )}
            {sortedDocs.map(doc => (
              <div
                key={doc.id}
                onClick={() => switchDoc(doc.id)}
                style={{
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  background: doc.id === activeId ? 'rgba(201,169,110,0.08)' : 'transparent',
                  borderLeft: doc.id === activeId ? '2px solid var(--accent)' : '2px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: '0.82rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {doc.title || 'Untitled'}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); removeDoc(doc.id); }}
                  style={{ ...btnStyle, fontSize: '0.65rem', opacity: 0.4, flexShrink: 0 }}
                  title="Delete"
                >✕</button>
              </div>
            ))}
          </div>

          {/* GitHub section */}
          <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <button onClick={() => setGithubModal(true)} style={{ ...btnStyle, fontSize: '0.72rem', color: ghConfig ? 'var(--accent)' : 'var(--text-muted)', textAlign: 'left' }}>
              {ghConfig ? `⇅ ${ghConfig.owner}/${ghConfig.repo}` : '+ Connect GitHub'}
            </button>
            {ghConfig && (
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button onClick={pushDoc} style={{ ...btnStyle, fontSize: '0.72rem', flex: 1 }} title="Push current doc">↑ push</button>
                <button onClick={pullAll} style={{ ...btnStyle, fontSize: '0.72rem', flex: 1 }} title="Pull all remote docs">↓ pull</button>
              </div>
            )}
            {syncStatus && (
              <span style={{ fontSize: '0.7rem', color: syncStatus === 'error' ? '#e07070' : syncStatus === 'ok' ? '#6fba7f' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {syncStatus === 'syncing' ? '…' : syncStatus === 'ok' ? 'synced ✓' : 'error ✗'}
              </span>
            )}
          </div>
        </aside>
      )}

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <header style={{
          height: 40, background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 0.75rem', gap: '0.5rem',
          flexShrink: 0,
        }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={btnStyle} title="Toggle sidebar">☰</button>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setMode(m => m === 'wysiwyg' ? 'raw' : 'wysiwyg')}
            style={{ ...btnStyle, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-muted)' }}
          >
            {mode === 'wysiwyg' ? 'raw' : 'wysiwyg'}
          </button>
          {mode === 'raw' && (
            <button
              onClick={() => setVimMode(v => !v)}
              style={{ ...btnStyle, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: vimMode ? 'var(--accent)' : 'var(--text-muted)' }}
            >vim {vimMode ? 'on' : 'off'}</button>
          )}
        </header>

        {/* Editor area */}
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
          {!activeId ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', color: 'var(--text-muted)', height: '100%' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>no document selected</span>
              <button onClick={newDoc} style={{ ...btnStyle, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>create one →</button>
            </div>
          ) : mode === 'wysiwyg' ? (
            <div style={{ width: '100%', height: '100%', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
              <WysiwygEditor key={activeId} content={content} onChange={handleContentChange} />
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%' }}>
              <RawEditor key={`${activeId}-${vimMode}`} content={content} onChange={handleContentChange} vimMode={vimMode} />
            </div>
          )}
        </main>
      </div>

      {githubModal && (
        <GithubModal onClose={(saved) => {
          setGithubModal(false);
          if (saved) setGhConfig(getGithubConfig());
        }} />
      )}
    </div>
  );
}

const btnStyle = {
  background: 'transparent', border: 'none', color: 'var(--text)',
  cursor: 'pointer', padding: '0.25rem 0.4rem', borderRadius: 3,
  fontFamily: 'var(--font-sans)', fontSize: '0.8rem',
  lineHeight: 1,
};
