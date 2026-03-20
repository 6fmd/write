import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import WysiwygEditor from './components/WysiwygEditor';
import RawEditor from './components/RawEditor';
import { useTheme } from './hooks/useTheme';
import Fuse from 'fuse.js';
import {
  listDocs, getDoc, saveDoc, deleteDoc,
  getActiveDocId, setActiveDocId, generateId, extractTitle,
  migrateFromLocalStorage, getStorageUsage
} from './lib/storage';
import './App.css';

const AUTOSAVE_DELAY = 800;

export default function App() {
  const [docs, setDocs] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [storageUsage, setStorageUsage] = useState(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [maxWidthLimit, setMaxWidthLimit] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1800);
  const [wrapWidth, setWrapWidth] = useState(() => {
    const limit = typeof window !== 'undefined' ? window.innerWidth : 1800;
    try {
      const raw = localStorage.getItem('write-md:wrapWidthPx');
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? Math.min(limit, Math.max(200, n)) : Math.min(limit, 980);
    } catch {
      return Math.min(limit, 980);
    }
  });

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 768);
      setMaxWidthLimit(window.innerWidth);
      setWrapWidth(prev => Math.min(window.innerWidth, Math.max(200, prev)));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [activeId, setActiveId] = useState(null);
  const [content, setContent] = useState('');

  const fetchUsage = useCallback(async () => {
    const usage = await getStorageUsage();
    if (usage) setStorageUsage(usage);
  }, []);

  useEffect(() => {
    async function init() {
      await migrateFromLocalStorage();
      const stored = await listDocs();
      const lastId = await getActiveDocId();
      setDocs(stored);
      if (lastId && stored[lastId]) {
        setActiveId(lastId);
        setContent(stored[lastId].content ?? '');
      } else {
        const ids = Object.keys(stored);
        if (ids.length > 0) {
          setActiveId(ids[0]);
          setContent(stored[ids[0]]?.content ?? '');
        }
      }
      setIsLoading(false);
      fetchUsage();
    }
    init();
  }, [fetchUsage]);

  const [mode, setMode] = useState('visual'); // 'visual' | 'raw'
  const [vimMode, setVimMode] = useState(false);
  const [rawFocusToken, setRawFocusToken] = useState(0);
  const [visualFocusToken, setVisualFocusToken] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeTargetId, setCloseTargetId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statsPinned, setStatsPinned] = useState(() => {
    try { return localStorage.getItem('write-md:statsPinned') === 'true'; }
    catch { return false; }
  });
  const [storagePinned, setStoragePinned] = useState(() => {
    try { return localStorage.getItem('write-md:storagePinned') === 'true'; }
    catch { return false; }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const raw = localStorage.getItem('write-md:sidebarWidth');
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? Math.min(480, Math.max(160, n)) : 220;
    } catch {
      return 220;
    }
  });

  const isResizingSidebar = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);
  const autosaveTimer = useRef(null);
  const closeConfirmRef = useRef(null);
  const shortcutsRef = useRef(null);
  const shortcutsWasOpenRef = useRef(false);
  const searchInputRef = useRef(null);

  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  const { theme, toggle: toggleTheme } = useTheme();

  const [isDraggingOverSidebar, setIsDraggingOverSidebar] = useState(false);

  function isEmptyDocContent(md) {
    return (md ?? '').trim() === '';
  }

  function requestCloseDoc(id) {
    if (!id) return;
    const doc = docs[id];
    if (!doc) return;

    const effectiveContent = id === activeId ? content : (doc.content ?? '');
    if (isEmptyDocContent(effectiveContent)) {
      removeDoc(id);
      return;
    }

    setCloseTargetId(id);
    setCloseConfirmOpen(true);
  }

  async function newDoc() {
    const id = generateId();
    await saveDoc(id, { title: 'Untitled', content: '', customTitle: null, updatedAt: new Date().toISOString() });
    const d = await listDocs();
    setDocs(d);
    switchDoc(id, '');
    if (mode === 'raw') setRawFocusToken(t => t + 1);
    else setVisualFocusToken(t => t + 1);
    fetchUsage();
  }

  function switchDoc(id, forcedContent) {
    if (id === activeId && forcedContent === undefined) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setActiveId(id);
    setActiveDocId(id);
    const c = forcedContent !== undefined ? forcedContent : (docs[id]?.content ?? '');
    setContent(c);
    if (mode === 'raw') setRawFocusToken(t => t + 1);
    else setVisualFocusToken(t => t + 1);
  }

  async function removeDoc(id) {
    await deleteDoc(id);
    const d = await listDocs();
    const remaining = Object.keys(d);
    setDocs(d);
    if (activeId === id) {
      if (remaining.length > 0) { switchDoc(remaining[0], d[remaining[0]]?.content ?? ''); }
      else { setActiveId(null); setContent(''); }
    }
    fetchUsage();
  }

  const handleContentChange = useCallback((newContent) => {
    setContent(newContent);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      if (!activeId) return;
      const existing = await getDoc(activeId);
      const title = extractTitle(newContent);
      const payload = existing?.customTitle
        ? { content: newContent }
        : { title, content: newContent };
      await saveDoc(activeId, payload);
      setDocs(await listDocs());
      fetchUsage();
    }, AUTOSAVE_DELAY);
  }, [activeId, fetchUsage]);

  const activeDoc = activeId ? docs[activeId] : null;
  const sortedDocs = Object.values(docs).sort((a, b) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  );

  const displayDocs = useMemo(() => {
    if (!searchQuery.trim()) return sortedDocs;
    const fuse = new Fuse(sortedDocs, {
      keys: ['title', 'customTitle', 'content'],
      threshold: 0.3,
      ignoreLocation: true,
    });
    return fuse.search(searchQuery).map(result => result.item);
  }, [sortedDocs, searchQuery]);

  useEffect(() => {
    try { localStorage.setItem('write-md:wrapWidthPx', String(wrapWidth)); } catch { }
  }, [wrapWidth]);

  useEffect(() => {
    try { localStorage.setItem('write-md:sidebarWidth', String(sidebarWidth)); } catch { }
  }, [sidebarWidth]);

  useEffect(() => {
    function onMouseMove(e) {
      if (!isResizingSidebar.current) return;
      const newWidth = Math.min(480, Math.max(160, resizeStartWidth.current + e.clientX - resizeStartX.current));
      setSidebarWidth(newWidth);
    }
    function onMouseUp() {
      if (!isResizingSidebar.current) return;
      isResizingSidebar.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('write-md:statsPinned', String(statsPinned)); } catch { }
  }, [statsPinned]);

  useEffect(() => {
    try { localStorage.setItem('write-md:storagePinned', String(storagePinned)); } catch { }
  }, [storagePinned]);

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

  function handlePrint() {
    if (!activeId || !activeDoc) return;
    window.print();
  }

  function beginRename(doc) {
    setRenamingId(doc.id);
    setRenameValue(doc.customTitle ?? doc.title ?? 'Untitled');
  }

  async function commitRename(docId) {
    const value = renameValue.trim();
    await saveDoc(docId, { customTitle: value || null });
    setDocs(await listDocs());
    setRenamingId(null);
    setRenameValue('');
    fetchUsage();
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  function commitRenameIfLeaving(currentDocId, nextDocId) {
    if (!currentDocId) return;
    if (currentDocId === nextDocId) return;
    commitRename(currentDocId);
  }

  useEffect(() => {
    function handleKeydown(e) {
      const isMod = isMac ? e.metaKey : e.ctrlKey;
      if (!isMod) return;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (e.shiftKey && key === 'f') {
        e.preventDefault();
        setSidebarOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }
      if (!e.shiftKey && key === '\\') {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
        return;
      }
      if (e.shiftKey && key === 'e') {
        e.preventDefault();
        const next = mode === 'visual' ? 'raw' : 'visual';
        setMode(next);
        if (next === 'raw') setTimeout(() => setRawFocusToken(t => t + 1), 0);
        else setTimeout(() => setVisualFocusToken(t => t + 1), 0);
        return;
      }
      if (e.shiftKey && key === 'v') {
        e.preventDefault();
        if (mode === 'raw' && vimMode) {
          setVimMode(false);
          setRawFocusToken(t => t + 1);
          return;
        }
        setMode('raw');
        setVimMode(true);
        setTimeout(() => setRawFocusToken(t => t + 1), 0);
        return;
      }
      if (e.shiftKey && key === 's') {
        e.preventDefault();
        downloadCurrentDoc();
        return;
      }
      if (e.shiftKey && key === 'k') {
        e.preventDefault();
        newDoc();
        return;
      }
      if (e.shiftKey && key === 'r' && activeDoc) {
        e.preventDefault();
        beginRename(activeDoc);
        return;
      }
      if (e.shiftKey && key === 'x' && activeId) {
        e.preventDefault();
        requestCloseDoc(activeId);
        return;
      }
      if (!e.shiftKey && key === 'p') {
        e.preventDefault();
        handlePrint();
        return;
      }
      if (!e.shiftKey && key === '/') {
        e.preventDefault();
        setShortcutsOpen(prev => !prev);
        return;
      }
      if (key === 'escape' && !shortcutsOpen && !closeConfirmOpen && !renamingId) {
        const active = document.activeElement;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (!isInput) {
          e.preventDefault();
          if (mode === 'raw') setRawFocusToken(t => t + 1);
          else setVisualFocusToken(t => t + 1);
        }
      }
    }

    window.addEventListener('keydown', handleKeydown, true);
    return () => window.removeEventListener('keydown', handleKeydown, true);
  }, [isMac, mode, vimMode, activeId, content, docs, downloadCurrentDoc, handlePrint, newDoc, activeDoc, beginRename, shortcutsOpen, closeConfirmOpen, renamingId, requestCloseDoc]);

  useEffect(() => {
    if (closeConfirmOpen && closeConfirmRef.current) closeConfirmRef.current.focus();
  }, [closeConfirmOpen]);

  useEffect(() => {
    if (shortcutsOpen) {
      shortcutsWasOpenRef.current = true;
      if (shortcutsRef.current) shortcutsRef.current.focus();
    } else if (shortcutsWasOpenRef.current) {
      shortcutsWasOpenRef.current = false;
      if (mode === 'raw') setRawFocusToken(t => t + 1);
      else setVisualFocusToken(t => t + 1);
    }
  }, [shortcutsOpen, mode]);

  useEffect(() => {
    if (!shortcutsOpen) return;
    function onKeydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); setShortcutsOpen(false); }
    }
    window.addEventListener('keydown', onKeydown, true);
    return () => window.removeEventListener('keydown', onKeydown, true);
  }, [shortcutsOpen]);

  const closeTargetDoc = closeTargetId ? docs[closeTargetId] : null;

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  const formatBytes = (bytes) => {
    if (bytes === 0 || !bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <span className="loading-text">Loading documents...</span>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      {sidebarOpen && (
        <aside
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOverSidebar(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDraggingOverSidebar(false); }}
          onDrop={async (e) => {
            e.preventDefault();
            setIsDraggingOverSidebar(false);
            const files = Array.from(e.dataTransfer.files);
            let lastId = null;
            let addedCount = 0;
            let lastContent = '';
            for (const file of files) {
              if (file.name.endsWith('.md') || file.name.endsWith('.txt')) {
                const text = await file.text();
                const id = generateId();
                const customTitle = file.name.replace(/\.[^/.]+$/, '');
                await saveDoc(id, { title: extractTitle(text) || customTitle, content: text, customTitle, updatedAt: new Date().toISOString() });
                lastId = id;
                lastContent = text;
                addedCount++;
              }
            }
            if (addedCount > 0) {
              setDocs(await listDocs());
              if (lastId) switchDoc(lastId, lastContent);
              fetchUsage();
            }
          }}
          className={[
            'sidebar',
            isMobile ? 'sidebar--mobile sidebar-mobile' : '',
            isDraggingOverSidebar ? 'sidebar--dragging' : '',
          ].filter(Boolean).join(' ')}
          style={!isMobile ? { width: sidebarWidth } : undefined}
        >
          {/* Header */}
          <div className="sidebar-header">
            <button
              className="btn-icon"
              onClick={() => setSidebarOpen(false)}
              title={isMac ? 'Hide sidebar (⌘\\)' : 'Hide sidebar (Ctrl\\)'}
            >←</button>
            <span className="sidebar-brand">write.6f.md</span>
            <button
              className="btn-icon"
              onClick={newDoc}
              title={isMac ? 'New document (⌘⇧K)' : 'New document (Ctrl⇧K)'}
            >＋</button>
          </div>

          {/* Search */}
          <div className="sidebar-search">
            <div className="search-wrap">
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder={isMac ? 'Search... (⌘⇧F)' : 'Search... (Ctrl⇧F)'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setSearchQuery('');
                    searchInputRef.current?.blur();
                    if (mode === 'raw') setRawFocusToken(t => t + 1);
                    else setVisualFocusToken(t => t + 1);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (displayDocs.length > 0) {
                      switchDoc(displayDocs[0].id);
                      searchInputRef.current?.blur();
                      if (isMobile) setSidebarOpen(false);
                    }
                  }
                }}
              />
              {searchQuery && (
                <button
                  className="search-clear"
                  onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                  title="Clear search"
                >✕</button>
              )}
            </div>
          </div>

          {/* Doc list */}
          <div className="doc-list">
            {displayDocs.length === 0 && (
              <p className="doc-list-empty">
                {searchQuery ? 'No documents match your search.' : 'No documents yet.'}
              </p>
            )}
            {displayDocs.map(doc => (
              <div
                key={doc.id}
                className={`doc-item${doc.id === activeId ? ' doc-item--active' : ''}`}
                onClick={() => {
                  commitRenameIfLeaving(renamingId, doc.id);
                  switchDoc(doc.id);
                  if (isMobile) setSidebarOpen(false);
                }}
              >
                {renamingId === doc.id ? (
                  <input
                    autoFocus
                    ref={el => { if (el && isMobile) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350); }}
                    className="doc-rename-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    onBlur={() => commitRename(doc.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitRename(doc.id); }
                      else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                    }}
                  />
                ) : (
                  <span className="doc-title">
                    {doc.customTitle || doc.title || 'Untitled'}
                  </span>
                )}
                {renamingId !== doc.id && (
                  <button
                    className="btn btn--dim"
                    style={{ fontSize: '0.7rem' }}
                    onClick={e => {
                      e.stopPropagation();
                      commitRenameIfLeaving(renamingId, doc.id);
                      switchDoc(doc.id);
                      beginRename(doc);
                    }}
                    title="Rename"
                    aria-label="Rename document"
                  >✎</button>
                )}
                <button
                  className="btn btn--dim"
                  style={{ fontSize: '0.65rem' }}
                  onClick={e => {
                    e.stopPropagation();
                    commitRenameIfLeaving(renamingId, doc.id);
                    requestCloseDoc(doc.id);
                  }}
                  title="Delete"
                >✕</button>
              </div>
            ))}
          </div>

          {/* Footer controls */}
          <div className="sidebar-footer">
            {/* Width slider */}
            <div className="width-control" title="Max content width in pixels">
              <span className="width-label">Width</span>
              <input
                className="wrap-slider"
                style={{ flex: 1, minWidth: 0, margin: '0 0.5rem' }}
                type="range"
                min={200}
                max={Math.max(200, maxWidthLimit)}
                step={20}
                value={wrapWidth}
                onChange={(e) => setWrapWidth(Number(e.target.value))}
                aria-label="Wrap width"
              />
              <span className="width-value">{wrapWidth}</span>
            </div>

            {/* Mode row */}
            <div className="btn-row">
              <button
                className={`btn-pill btn--flex${mode === 'visual' ? ' btn-pill--active' : ' btn-pill--inactive'}`}
                onClick={() => { document.activeElement?.blur(); setMode('visual'); setVimMode(false); setTimeout(() => setVisualFocusToken(t => t + 1), 0); }}
                title={isMac ? 'Switch to Visual (⌘⇧E)' : 'Switch to Visual (Ctrl⇧E)'}
              >Visual</button>
              <button
                className={`btn-pill btn--flex${mode === 'raw' && !vimMode ? ' btn-pill--active' : ' btn-pill--inactive'}`}
                onClick={() => { document.activeElement?.blur(); setMode('raw'); setVimMode(false); setTimeout(() => setRawFocusToken(t => t + 1), 0); }}
                title={isMac ? 'Switch to Raw (⌘⇧E)' : 'Switch to Raw (Ctrl⇧E)'}
              >Raw</button>
              <button
                className={`btn-pill btn--flex${mode === 'raw' && vimMode ? ' btn-pill--active' : ' btn-pill--inactive'}`}
                onClick={() => {
                  document.activeElement?.blur();
                  if (mode === 'raw' && vimMode) { setVimMode(false); setRawFocusToken(t => t + 1); }
                  else { setMode('raw'); setVimMode(true); setTimeout(() => setRawFocusToken(t => t + 1), 0); }
                }}
                title={isMac ? 'Raw + Vim (⌘⇧V)' : 'Raw + Vim (Ctrl⇧V)'}
              >Vim</button>
            </div>

            {/* Action row */}
            <div className="btn-row">
              <button
                className="btn-pill btn--flex"
                onClick={handlePrint}
                disabled={!activeId}
                title={isMac ? 'Print (⌘P)' : 'Print (Ctrl+P)'}
              >Print</button>
              <button
                className="btn-pill btn--flex"
                onClick={downloadCurrentDoc}
                disabled={!activeId}
                title={isMac ? 'Download as .md (⌘⇧S)' : 'Download as .md (Ctrl⇧S)'}
              >Download (.md)</button>
            </div>

            <button
              className="btn-pill btn-pill--full"
              onClick={() => setShortcutsOpen(true)}
              title={isMac ? 'More options & Shortcuts (⌘/)' : 'More options & Shortcuts (Ctrl/)'}
            >More...</button>
          </div>

          {/* Resize handle */}
          {!isMobile && (
            <div
              className="sidebar-resize-handle"
              onMouseDown={(e) => {
                e.preventDefault();
                isResizingSidebar.current = true;
                resizeStartX.current = e.clientX;
                resizeStartWidth.current = sidebarWidth;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
              }}
            />
          )}
        </aside>
      )}

      {/* Main */}
      <div
        className="main-panel"
        style={{ '--editor-max-width': `${wrapWidth}px` }}
      >
        <main className={`editor-area${!activeId ? ' editor-area--centered' : ''}`}>
          {!activeId ? (
            <div className="editor-empty">
              <span className="editor-empty-hint">no document selected</span>
              <button className="btn btn--mono" onClick={newDoc}>create one →</button>
            </div>
          ) : mode === 'visual' ? (
            <div className="editor-scroll">
              <WysiwygEditor
                key={activeId}
                content={content}
                onChange={handleContentChange}
                focusToken={visualFocusToken}
              />
            </div>
          ) : (
            <div className="editor-fill">
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

      {/* Floating sidebar toggle */}
      {!sidebarOpen && (
        <button
          className="btn-icon sidebar-toggle"
          onClick={() => { document.activeElement?.blur(); setSidebarOpen(true); }}
          title={isMac ? 'Show sidebar (⌘\\)' : 'Show sidebar (Ctrl\\)'}
        >☰</button>
      )}

      {/* Pinned stats */}
      {(statsPinned || storagePinned) && (
        <div className="pinned-stats">
          {statsPinned && (
            <div className="pinned-stats__counts">
              <span>{wordCount} words</span>
              <span>{charCount} chars</span>
            </div>
          )}
          {statsPinned && storagePinned && <div className="pinned-stats__divider" />}
          {storagePinned && storageUsage && (
            <span>{formatBytes(storageUsage.usage)} / {formatBytes(storageUsage.quota)}</span>
          )}
        </div>
      )}

      {/* Delete confirm dialog */}
      {closeConfirmOpen && closeTargetDoc && (
        <div
          className="overlay overlay--front"
          onClick={e => { if (e.target === e.currentTarget) setCloseConfirmOpen(false); }}
        >
          <div
            ref={closeConfirmRef}
            tabIndex={-1}
            className="dialog dialog--confirm"
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
          >
            <div className="dialog-header">
              <div className="dialog-title">Delete document?</div>
              <button
                className="btn-icon"
                onClick={() => { setCloseConfirmOpen(false); setCloseTargetId(null); }}
                title="Cancel (Esc)"
              >✕</button>
            </div>
            <div className="dialog-body">
              This will delete{' '}
              <strong>{closeTargetDoc.customTitle || closeTargetDoc.title || 'Untitled'}</strong>
              . This can't be undone.
            </div>
            <div className="dialog-footer">
              <button
                className="btn-pill"
                style={{ paddingInline: '0.7rem' }}
                onClick={() => { setCloseConfirmOpen(false); setCloseTargetId(null); }}
              >Cancel</button>
              <button
                className="btn-pill btn-pill--selected"
                style={{ paddingInline: '0.7rem' }}
                onClick={() => {
                  const id = closeTargetDoc.id;
                  setCloseConfirmOpen(false);
                  setCloseTargetId(null);
                  removeDoc(id);
                }}
              >Delete</button>
            </div>
            <div className="dialog-hint">Press Enter to confirm, Esc to cancel.</div>
          </div>
        </div>
      )}

      {/* Shortcuts / More dialog */}
      {shortcutsOpen && (
        <div
          className="overlay overlay--back"
          onClick={e => { if (e.target === e.currentTarget) setShortcutsOpen(false); }}
        >
          <div
            ref={shortcutsRef}
            tabIndex={-1}
            className="dialog dialog--shortcuts"
            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setShortcutsOpen(false); } }}
          >
            <div className="dialog-header dialog-header--lg">
              <div className="dialog-title dialog-title--lg">More</div>
              <button className="btn-icon" onClick={() => setShortcutsOpen(false)} title="Close (Esc)">✕</button>
            </div>

            {/* Document Stats */}
            <div className="section">
              <div className="section-header">
                <div className="section-title">Document Stats</div>
                <button
                  className={`btn-pill${statsPinned ? '' : ' btn-pill--muted'}`}
                  style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}
                  onClick={() => setStatsPinned(p => !p)}
                  title={statsPinned ? 'Unpin from screen' : 'Pin to screen'}
                >{statsPinned ? 'unpin' : 'pin'}</button>
              </div>
              <div className="stats-row">
                <div><strong>{wordCount}</strong> <span className="stats-muted">words</span></div>
                <div><strong>{charCount}</strong> <span className="stats-muted">chars</span></div>
                <div><strong>{readTime}</strong> <span className="stats-muted">min read</span></div>
              </div>
            </div>

            {/* Storage Usage */}
            {storageUsage && (
              <div className="section">
                <div className="section-header">
                  <div className="section-title">Storage Usage</div>
                  <button
                    className={`btn-pill${storagePinned ? '' : ' btn-pill--muted'}`}
                    style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}
                    onClick={() => setStoragePinned(p => !p)}
                    title={storagePinned ? 'Unpin from screen' : 'Pin to screen'}
                  >{storagePinned ? 'unpin' : 'pin'}</button>
                </div>
                <div className="storage-amount">{formatBytes(storageUsage.usage)} / {formatBytes(storageUsage.quota)}</div>
                <div className="storage-bar">
                  <div
                    className="storage-bar__fill"
                    style={{ width: `${Math.min(100, (storageUsage.usage / storageUsage.quota) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Preferences */}
            <div className="section">
              <div className="section-title">Preferences</div>
              <div className="prefs-row">
                <span className="prefs-label">Theme</span>
                <button
                  className={`btn-pill btn--flex${theme === 'light' ? ' btn-pill--selected' : ''}`}
                  onClick={() => theme !== 'light' && toggleTheme()}
                >Light</button>
                <button
                  className={`btn-pill btn--flex${theme === 'dark' ? ' btn-pill--selected' : ''}`}
                  onClick={() => theme !== 'dark' && toggleTheme()}
                >Dark</button>
              </div>
            </div>

            {/* Keyboard shortcuts */}
            <div>
              <div className="section-title">Keyboard shortcuts</div>
              <div className="shortcuts-hint">{isMac ? '⌘' : 'Ctrl'} shortcuts work anywhere in the app.</div>
              <div className="shortcuts-grid">
                <div className="shortcuts-col">
                  <div className="shortcut-row"><span>New doc</span><ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'K']} /></div>
                  <div className="shortcut-row"><span>Rename</span><ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'R']} /></div>
                  <div className="shortcut-row"><span>Close doc</span><ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'X']} /></div>
                  <div className="shortcut-row"><span>Search</span><ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'F']} /></div>
                  <div className="shortcut-row"><span>Print</span><ShortcutKeys isMac={isMac} keys={['Mod', 'P']} /></div>
                  <div className="shortcut-row"><span>Download (MD)</span><ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'S']} /></div>
                </div>
                <div className="shortcuts-col">
                  <div className="shortcut-row"><span>Visual/Raw</span><ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'E']} /></div>
                  <div className="shortcut-row"><span>Raw+Vim</span><ShortcutKeys isMac={isMac} keys={['Mod', 'Shift', 'V']} /></div>
                  <div className="shortcut-row"><span>Sidebar</span><ShortcutKeys isMac={isMac} keys={['Mod', '\\']} /></div>
                  <div className="shortcut-row"><span>More Menu</span><ShortcutKeys isMac={isMac} keys={['Mod', '/']} /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShortcutKeys({ isMac, keys }) {
  const display = keys.map((k) => {
    if (k === 'Mod') return isMac ? '⌘' : 'Ctrl';
    if (k === 'Shift') return isMac ? '⇧' : 'Shift';
    return k;
  });
  return (
    <span className="kbd-row">
      {display.map((label, i) => (
        <kbd key={`${label}-${i}`} className="key">{label}</kbd>
      ))}
    </span>
  );
}
