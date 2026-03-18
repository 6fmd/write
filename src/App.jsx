import { useState, useEffect, useCallback, useRef } from 'react';
import WysiwygEditor from './components/WysiwygEditor';
import RawEditor from './components/RawEditor';
import { useTheme } from './hooks/useTheme';
import {
  listDocs, getDoc, saveDoc, deleteDoc,
  getActiveDocId, setActiveDocId, generateId, extractTitle,
} from './lib/storage';

const AUTOSAVE_DELAY = 800;

export default function App() {
  const [docs, setDocs] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [content, setContent] = useState('');
  const [mode, setMode] = useState('visual'); // 'visual' | 'raw'
  const [vimMode, setVimMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const autosaveTimer = useRef(null);

  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  const { theme, toggle: toggleTheme } = useTheme();

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
    saveDoc(id, { title: 'Untitled', content: '', customTitle: null, updatedAt: new Date().toISOString() });
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
      const existing = getDoc(activeId);
      const title = extractTitle(newContent);
      // Never overwrite a manually-set customTitle from autosave
      const payload = existing?.customTitle
        ? { content: newContent }
        : { title, content: newContent };
      saveDoc(activeId, payload);
      setDocs(listDocs());
    }, AUTOSAVE_DELAY);
  }, [activeId]);

  const activeDoc = activeId ? docs[activeId] : null;
  const sortedDocs = Object.values(docs).sort((a, b) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  );

  function currentTitleForDownload() {
    if (!activeDoc) return 'Untitled';
    return (activeDoc.customTitle || activeDoc.title || 'Untitled').trim() || 'Untitled';
  }

  function downloadCurrentDoc() {
    if (!activeId || !activeDoc) return;
    const title = currentTitleForDownload()
      .replace(/[\\/:*?"<>|]/g, '')
      .slice(0, 80) || 'Untitled';
    const blob = new Blob([content ?? ''], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function beginRename(doc) {
    setRenamingId(doc.id);
    setRenameValue(doc.customTitle ?? doc.title ?? 'Untitled');
  }

  function commitRename(docId) {
    const value = renameValue.trim();
    saveDoc(docId, { customTitle: value || null });
    setDocs(listDocs());
    setRenamingId(null);
    setRenameValue('');
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  useEffect(() => {
    function handleKeydown(e) {
      const isMod = isMac ? e.metaKey : e.ctrlKey;
      if (!isMod) return;

      // Normalize key to lower-case for letters
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      // Cmd/Ctrl + \
      if (!e.shiftKey && key === '\\') {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
        return;
      }

      // Cmd/Ctrl + Shift + E — toggle Visual / Raw
      if (e.shiftKey && key === 'e') {
        e.preventDefault();
        setMode(prev => (prev === 'visual' ? 'raw' : 'visual'));
        return;
      }

      // Cmd/Ctrl + Shift + V — toggle Vim (Raw mode only)
      if (e.shiftKey && key === 'v') {
        e.preventDefault();
        if (mode === 'raw') {
          setVimMode(prev => !prev);
        }
        return;
      }

      // Cmd/Ctrl + Shift + S — download current doc
      if (e.shiftKey && key === 's') {
        e.preventDefault();
        downloadCurrentDoc();
        return;
      }

      // Cmd/Ctrl + Shift + K — new document
      if (e.shiftKey && key === 'k') {
        e.preventDefault();
        newDoc();
        return;
      }

      // Cmd/Ctrl + Shift + R — rename current document
      if (e.shiftKey && key === 'r' && activeDoc) {
        e.preventDefault();
        beginRename(activeDoc);
        return;
      }

      // Cmd/Ctrl + / — toggle shortcuts help overlay
      if (!e.shiftKey && key === '/') {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
        return;
      }
    }

    window.addEventListener('keydown', handleKeydown, true);
    return () => window.removeEventListener('keydown', handleKeydown, true);
  }, [isMac, mode, downloadCurrentDoc, newDoc, activeDoc, beginRename]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <aside style={{
          width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <button
              onClick={() => setSidebarOpen(false)}
              style={{ ...iconBtnStyle, fontSize: '0.75rem' }}
              title={isMac ? 'Hide sidebar (⌘\\)' : 'Hide sidebar (Ctrl\\)'}
            >
              ←
            </button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent)', letterSpacing: '0.1em', flex: 1, textAlign: 'center' }}>write.6f.md</span>
            <button onClick={newDoc} style={iconBtnStyle} title="New document">＋</button>
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
                {renamingId === doc.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(doc.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitRename(doc.id);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelRename();
                      }
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: '0.82rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text)',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 3,
                      padding: '0.15rem 0.25rem',
                    }}
                  />
                ) : (
                  <span
                    onClick={e => {
                      e.stopPropagation();
                      beginRename(doc);
                    }}
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {doc.customTitle || doc.title || 'Untitled'}
                  </span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); removeDoc(doc.id); }}
                  style={{ ...btnStyle, fontSize: '0.65rem', opacity: 0.4, flexShrink: 0 }}
                  title="Delete"
                >✕</button>
              </div>
            ))}
          </div>

          {/* Bottom controls */}
          <div style={{ padding: '0.6rem 0.75rem 0.7rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={() => setMode('visual')}
                style={{
                  ...pillBtnStyle,
                  flex: 1,
                  background: mode === 'visual' ? 'var(--accent-dim)' : 'transparent',
                  color: mode === 'visual' ? 'var(--bg)' : 'var(--text-muted)',
                }}
              >
                Visual
              </button>
              <button
                onClick={() => setMode('raw')}
                style={{
                  ...pillBtnStyle,
                  flex: 1,
                  background: mode === 'raw' ? 'var(--accent-dim)' : 'transparent',
                  color: mode === 'raw' ? 'var(--bg)' : 'var(--text-muted)',
                }}
              >
                Raw
              </button>
            </div>

            {mode === 'raw' && (
              <button
                onClick={() => setVimMode(v => !v)}
                style={{
                  ...pillBtnStyle,
                  justifyContent: 'space-between',
                  color: vimMode ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                <span>Vim mode</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {vimMode ? 'on' : 'off'}
                </span>
              </button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
              <button
                onClick={toggleTheme}
                style={{
                  ...iconBtnStyle,
                  fontSize: '0.9rem',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                }}
                title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {theme === 'dark' ? '☀' : '☾'}
              </button>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <button
                  onClick={downloadCurrentDoc}
                  style={{
                    ...btnStyle,
                    justifyContent: 'space-between',
                    fontSize: '0.72rem',
                    opacity: activeId ? 1 : 0.4,
                    cursor: activeId ? 'pointer' : 'default',
                  }}
                  disabled={!activeId}
                >
                  <span>Download as .md</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {isMac ? '⌘⇧S' : 'Ctrl⇧S'}
                  </span>
                </button>

                <button
                  onClick={() => setShortcutsOpen(true)}
                  style={{
                    ...btnStyle,
                    justifyContent: 'space-between',
                    fontSize: '0.72rem',
                  }}
                >
                  <span>Keyboard shortcuts</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                    {isMac ? '⌘/' : 'Ctrl/'}
                  </span>
                </button>
              </div>
            </div>

          </div>
        </aside>
      )}

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Editor area */}
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
          {!activeId ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', color: 'var(--text-muted)', height: '100%' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>no document selected</span>
              <button onClick={newDoc} style={{ ...btnStyle, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>create one →</button>
            </div>
          ) : mode === 'visual' ? (
            <div style={{ width: '100%', height: '100%', overflowY: 'auto', display: 'flex', justifyContent: 'center' }}>
              <WysiwygEditor key={activeId} content={content} onChange={handleContentChange} />
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%' }}>
              <RawEditor
                key={`${activeId}-${vimMode}`}
                content={content}
                onChange={handleContentChange}
                vimMode={vimMode}
                theme={theme}
              />
            </div>
          )}
        </main>
      </div>

      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 20,
            ...iconBtnStyle,
            padding: '0.15rem 0.3rem',
          }}
          title={isMac ? 'Show sidebar (⌘\\)' : 'Show sidebar (Ctrl\\)'}
        >
          ☰
        </button>
      )}

      {shortcutsOpen && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) setShortcutsOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
          }}
        >
          <div
            tabIndex={-1}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setShortcutsOpen(false);
              }
            }}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '1.5rem 1.75rem',
              width: 420,
              maxWidth: '90vw',
              boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
                Keyboard shortcuts
              </div>
              <button
                onClick={() => setShortcutsOpen(false)}
                style={{ ...iconBtnStyle, fontSize: '0.8rem' }}
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              {isMac ? '⌘' : 'Ctrl'} shortcuts work anywhere in the app.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '0.45rem', columnGap: '1rem', fontSize: '0.8rem' }}>
              <span>Toggle sidebar</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', '\\']} />

              <span>Toggle Visual / Raw</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'E']} />

              <span>Toggle Vim mode (Raw)</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'V']} />

              <span>Download current document</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'S']} />

              <span>New document</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'K']} />

              <span>Toggle shortcuts help</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', '/']} />

              <span>Rename current document</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'R']} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text)',
  cursor: 'pointer',
  padding: '0.25rem 0.4rem',
  borderRadius: 4,
  fontFamily: 'var(--font-sans)',
  fontSize: '0.8rem',
  lineHeight: 1,
  transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease, opacity 0.12s ease',
};

const iconBtnStyle = {
  ...btnStyle,
  padding: '0.2rem 0.45rem',
  borderRadius: 999,
};

const pillBtnStyle = {
  ...btnStyle,
  borderRadius: 999,
  border: '1px solid var(--border)',
  padding: '0.3rem 0.6rem',
  fontSize: '0.72rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function ShortcutKeys({ isMac, keys }) {
  const display = keys.map((k) => {
    if (k === 'Mod') return isMac ? '⌘' : 'Ctrl';
    if (k === 'Shift') return isMac ? '⇧' : 'Shift';
    return k;
  });
  return (
    <span style={{ display: 'flex', gap: '0.25rem' }}>
      {display.map((label, i) => (
        <kbd
          key={`${label}-${i}`}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
            padding: '0.15rem 0.3rem',
            borderRadius: 3,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            minWidth: 16,
            textAlign: 'center',
          }}
        >
          {label}
        </kbd>
      ))}
    </span>
  );
}
