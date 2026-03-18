import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';
import { useEffect } from 'react';

export default function WysiwygEditor({ content, onChange, focusToken }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      Typography,
      Markdown.configure({
        html: false,
        tightLists: true,
        breaks: false,
      }),
    ],
    content: '',
    editorProps: {
      attributes: { class: 'tiptap-editor' },
    },
    onUpdate({ editor }) {
      const md = editor.storage.markdown.getMarkdown();
      onChange(md);
    },
  });

  // Sync content in when it changes externally (e.g. doc switch)
  useEffect(() => {
    if (!editor) return;
    const current = editor.storage.markdown.getMarkdown();
    if (current !== content) {
      editor.commands.setContent(content ?? '');
    }
  }, [content, editor]);

  // Focus editor when requested by parent (e.g. after creating a new document)
  useEffect(() => {
    if (!editor) return;
    editor.commands.focus('start');
  }, [focusToken, editor]);

  return <EditorContent editor={editor} className="editor-fill" />;
}
