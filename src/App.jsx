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
  const [docs, setDocs] = useState(() => listDocs());
  const [activeId, setActiveId] = useState(() => {
    const stored = listDocs();
    const lastId = getActiveDocId();
    if (lastId && stored[lastId]) return lastId;
    const ids = Object.keys(stored);
    return ids.length > 0 ? ids[0] : null;
  });
  const [content, setContent] = useState(() => {
    const stored = listDocs();
    const lastId = getActiveDocId();
    if (lastId && stored[lastId]) return stored[lastId].content ?? '';
    const ids = Object.keys(stored);
    if (ids.length > 0) return stored[ids[0]]?.content ?? '';
    return '';
  });
  const [mode, setMode] = useState('visual'); // 'visual' | 'raw'
  const [vimMode, setVimMode] = useState(false);
  const [rawFocusToken, setRawFocusToken] = useState(0);
  const [visualFocusToken, setVisualFocusToken] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeTargetId, setCloseTargetId] = useState(null);
  const autosaveTimer = useRef(null);
  const closeConfirmRef = useRef(null);
  const shortcutsRef = useRef(null);

  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  const { theme, toggle: toggleTheme } = useTheme();

  function newDoc() {
    const id = generateId();
    saveDoc(id, { title: 'Untitled', content: '', customTitle: null, updatedAt: new Date().toISOString() });
    setDocs(listDocs());
    switchDoc(id, '');
    if (mode === 'raw') setRawFocusToken(t => t + 1);
    else setVisualFocusToken(t => t + 1);
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

      // Cmd/Ctrl + Shift + V — switch to Raw + Vim
      if (e.shiftKey && key === 'v') {
        e.preventDefault();
        // If already in Raw+Vim, this exits Vim back to normal Raw.
        if (mode === 'raw' && vimMode) {
          setVimMode(false);
          setRawFocusToken(t => t + 1);
          return;
        }
        // Otherwise, force Raw + Vim immediately.
        setMode('raw');
        setVimMode(true);
        setRawFocusToken(t => t + 1);
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

      // Cmd/Ctrl + Shift + X — close current document (with confirmation)
      if (e.shiftKey && key === 'x' && activeId) {
        e.preventDefault();
        setCloseTargetId(activeId);
        setCloseConfirmOpen(true);
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
  }, [isMac, mode, vimMode, activeId, downloadCurrentDoc, newDoc, activeDoc, beginRename]);

  // Focus the close-confirm dialog so Enter/Esc work immediately
  useEffect(() => {
    if (closeConfirmOpen && closeConfirmRef.current) {
      closeConfirmRef.current.focus();
    }
  }, [closeConfirmOpen]);

  // Focus the shortcuts dialog so Esc works immediately
  useEffect(() => {
    if (shortcutsOpen && shortcutsRef.current) {
      shortcutsRef.current.focus();
    }
  }, [shortcutsOpen]);

  // Ensure Esc closes the shortcuts menu even if focus is elsewhere
  useEffect(() => {
    if (!shortcutsOpen) return;
    function onKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShortcutsOpen(false);
      }
    }
    window.addEventListener('keydown', onKeydown, true);
    return () => window.removeEventListener('keydown', onKeydown, true);
  }, [shortcutsOpen]);

  const closeTargetDoc = closeTargetId ? docs[closeTargetId] : null;

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
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text)', letterSpacing: '0.1em', flex: 1, textAlign: 'center' }}>write.6f.md</span>
            <button
              onClick={newDoc}
              style={iconBtnStyle}
              title={isMac ? 'New document (⌘⇧K)' : 'New document (Ctrl⇧K)'}
            >
              ＋
            </button>
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
                  background: doc.id === activeId ? 'var(--bg)' : 'transparent',
                  borderLeft: doc.id === activeId ? '2px solid var(--border)' : '2px solid transparent',
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
                  onClick={e => {
                    e.stopPropagation();
                    setCloseTargetId(doc.id);
                    setCloseConfirmOpen(true);
                  }}
                  style={{ ...btnStyle, fontSize: '0.65rem', opacity: 0.4, flexShrink: 0 }}
                  title="Delete"
                >✕</button>
              </div>
            ))}
          </div>

          {/* Bottom controls */}
          <div style={{ padding: '0.6rem 0.75rem 0.7rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.75rem' }}>
            {/* Vim row (always present to avoid layout shift) */}
            <button
              onClick={() => {
                if (mode === 'raw') setVimMode(v => !v);
              }}
              style={{
                ...pillBtnStyle,
                justifyContent: 'space-between',
                opacity: mode === 'raw' ? 1 : 0.4,
                cursor: mode === 'raw' ? 'pointer' : 'default',
                borderStyle: 'dashed',
              }}
              disabled={mode !== 'raw'}
              title={
                mode === 'raw'
                  ? (isMac ? 'Switch to Raw + Vim (⌘⇧V)' : 'Switch to Raw + Vim (Ctrl⇧V)')
                  : (isMac ? 'Vim mode (Raw only) — use ⌘⇧V' : 'Vim mode (Raw only) — use Ctrl⇧V')
              }
            >
              <span>Vim mode</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: vimMode && mode === 'raw' ? 'var(--text)' : 'var(--text-muted)' }}>
                {vimMode ? 'on' : 'off'}
              </span>
            </button>

            {/* Mode row */}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={() => setMode('visual')}
                style={{
                  ...pillBtnStyle,
                  flex: 1,
                  background: mode === 'visual' ? 'var(--bg)' : 'transparent',
                  color: mode === 'visual' ? 'var(--text)' : 'var(--text-muted)',
                }}
                title={isMac ? 'Switch to Visual (⌘⇧E)' : 'Switch to Visual (Ctrl⇧E)'}
              >
                Visual
              </button>
              <button
                onClick={() => setMode('raw')}
                style={{
                  ...pillBtnStyle,
                  flex: 1,
                  background: mode === 'raw' ? 'var(--bg)' : 'transparent',
                  color: mode === 'raw' ? 'var(--text)' : 'var(--text-muted)',
                }}
                title={isMac ? 'Switch to Raw (⌘⇧E)' : 'Switch to Raw (Ctrl⇧E)'}
              >
                Raw
              </button>
            </div>

            {/* Download row: full width */}
            <button
              onClick={downloadCurrentDoc}
              style={{
                ...pillBtnStyle,
                justifyContent: 'space-between',
                fontSize: '0.72rem',
                opacity: activeId ? 1 : 0.4,
                cursor: activeId ? 'pointer' : 'default',
              }}
              disabled={!activeId}
              title={
                activeId
                  ? (isMac ? 'Download current document (⌘⇧S)' : 'Download current document (Ctrl⇧S)')
                  : 'Download current document'
              }
            >
              <span>Download as .md</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {isMac ? '⌘⇧S' : 'Ctrl⇧S'}
              </span>
            </button>

            {/* Theme + shortcuts section at the bottom */}
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.1rem' }}>
              <button
                onClick={() => theme !== 'light' && toggleTheme()}
                style={{
                  ...pillBtnStyle,
                  flex: 1,
                  background: theme === 'light' ? 'var(--bg)' : 'transparent',
                  color: theme === 'light' ? 'var(--text)' : 'var(--text-muted)',
                }}
                title="Switch to light theme"
              >
                Light
              </button>
              <button
                onClick={() => theme !== 'dark' && toggleTheme()}
                style={{
                  ...pillBtnStyle,
                  flex: 1,
                  background: theme === 'dark' ? 'var(--bg)' : 'transparent',
                  color: theme === 'dark' ? 'var(--text)' : 'var(--text-muted)',
                }}
                title="Switch to dark theme"
              >
                Dark
              </button>
              <button
                onClick={() => setShortcutsOpen(true)}
                style={{
                  ...pillBtnStyle,
                  flex: 1,
                }}
                title={isMac ? 'Show keyboard shortcuts (⌘/)' : 'Show keyboard shortcuts (Ctrl/)'}
              >
                Shortcuts
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Editor area */}
        <main
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            justifyContent: activeId ? 'flex-start' : 'center',
          }}
        >
          {!activeId ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                color: 'var(--text-muted)',
                height: '100%',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                no document selected
              </span>
              <button
                onClick={newDoc}
                style={{
                  ...btnStyle,
                  color: 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                }}
              >
                create one →
              </button>
            </div>
          ) : mode === 'visual' ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                overflowY: 'auto',
                display: 'flex',
                justifyContent: 'flex-start',
              }}
            >
              <WysiwygEditor
                key={activeId}
                content={content}
                onChange={handleContentChange}
                focusToken={visualFocusToken}
              />
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%' }}>
              <RawEditor
                key={`${activeId}-${vimMode}`}
                content={content}
                onChange={handleContentChange}
                vimMode={vimMode}
                focusToken={rawFocusToken}
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

      {closeConfirmOpen && closeTargetDoc && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) setCloseConfirmOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 40,
          }}
        >
          <div
            ref={closeConfirmRef}
            tabIndex={-1}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const id = closeTargetDoc.id;
                setCloseConfirmOpen(false);
                setCloseTargetId(null);
                removeDoc(id);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setCloseConfirmOpen(false);
                setCloseTargetId(null);
              }
            }}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '1.2rem 1.5rem',
              width: 360,
              maxWidth: '90vw',
              boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
                Delete document?
              </div>
              <button
                onClick={() => {
                  setCloseConfirmOpen(false);
                  setCloseTargetId(null);
                }}
                style={{ ...iconBtnStyle, fontSize: '0.8rem' }}
                title="Cancel (Esc)"
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.9rem' }}>
              This will delete{' '}
              <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                {closeTargetDoc.customTitle || closeTargetDoc.title || 'Untitled'}
              </span>
              . This can’t be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '0.4rem' }}>
              <button
                onClick={() => {
                  setCloseConfirmOpen(false);
                  setCloseTargetId(null);
                }}
                style={{ ...pillBtnStyle, paddingInline: '0.7rem' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = closeTargetDoc.id;
                  setCloseConfirmOpen(false);
                  setCloseTargetId(null);
                  removeDoc(id);
                }}
                style={{
                  ...pillBtnStyle,
                  paddingInline: '0.7rem',
                  background: 'var(--accent, var(--bg))',
                  borderColor: 'var(--border)',
                  color: 'var(--surface)',
                }}
              >
                Delete
              </button>
            </div>
            <div style={{ marginTop: '0.6rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Press Enter to confirm, Esc to cancel.
            </div>
          </div>
        </div>
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
              ref={shortcutsRef}
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
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
              {isMac ? '⌘' : 'Ctrl'} shortcuts work anywhere in the app.
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.4fr) auto',
                rowGap: '0.5rem',
                columnGap: '1.25rem',
                fontSize: '0.8rem',
              }}
            >
              <span>New document</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'K']} />

              <span>Rename current document</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'R']} />

              <span>Download current document</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'S']} />

              <span>Toggle Visual / Raw</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'E']} />

              <span>Raw + Vim</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'V']} />

              <span>Toggle sidebar</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', '\\']} />

              <span>Toggle shortcuts help</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', '/']} />

              <span>Close current document</span>
              <ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'X']} />
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
