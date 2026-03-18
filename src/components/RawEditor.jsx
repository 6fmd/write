import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { vim } from '@replit/codemirror-vim';
import { oneDark } from '@codemirror/theme-one-dark';

export default function RawEditor({ content, onChange, vimMode, theme, focusToken }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      // Ensure our Mod-Shift-E override wins over any internal keymaps
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Shift-e',
            run: () => true,
            preventDefault: true,
          },
        ]),
      ),
      ...(vimMode ? [vim()] : []),
      history(),
      markdown(),
      ...(theme === 'dark' ? [oneDark] : []),
      lineNumbers(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { height: '100%', background: 'transparent' },
        '.cm-content': { fontFamily: 'var(--font-mono)', fontSize: '0.9rem' },
        '.cm-gutters': { background: 'var(--surface)', borderRight: '1px solid var(--border)' },
      }),
    ];

    const state = EditorState.create({
      doc: content ?? '',
      extensions,
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [vimMode, theme]); // recreate when vim mode or theme toggles

  // Focus editor only when explicitly requested — skip the initial mount so
  // switching modes on mobile doesn't pop up the virtual keyboard.
  const didMountRef = useRef(false);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!didMountRef.current) { didMountRef.current = true; return; }
    view.focus();
  }, [focusToken]);

  // Sync content in when doc changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content ?? '' },
      });
    }
  }, [content]);

  return <div ref={containerRef} className="raw-editor-container" />;
}
