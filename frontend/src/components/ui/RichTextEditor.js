import React, { useRef, useEffect } from 'react';
import { Bold, List } from 'lucide-react';

const RichTextEditor = ({ value, onChange, placeholder, minHeight = '150px' }) => {
  const editorRef = useRef(null);
  const isUpdating = useRef(false);

  useEffect(() => {
    if (editorRef.current && value && !isUpdating.current) {
      // Only update if content is different
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || '';
      }
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      isUpdating.current = true;
      const html = editorRef.current.innerHTML;
      onChange(html);
      setTimeout(() => {
        isUpdating.current = false;
      }, 0);
    }
  };

  const handleBold = () => {
    document.execCommand('bold', false, null);
    editorRef.current?.focus();
    handleInput();
  };

  const handleBulletList = () => {
    document.execCommand('insertUnorderedList', false, null);
    editorRef.current?.focus();
    handleInput();
  };

  return (
    <div className="rich-text-editor border rounded-md">
      {/* Toolbar */}
      <div className="flex gap-1 p-2 border-b bg-slate-50">
        <button
          type="button"
          onClick={handleBold}
          className="p-2 hover:bg-slate-200 rounded transition-colors"
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleBulletList}
          className="p-2 hover:bg-slate-200 rounded transition-colors"
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </button>
      </div>
      
      {/* Editor Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        className="p-3 outline-none"
        style={{ minHeight: minHeight }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      <style jsx>{`
        .rich-text-editor [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .rich-text-editor [contenteditable] {
          min-height: ${minHeight};
        }
        .rich-text-editor ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .rich-text-editor li {
          margin: 0.25rem 0;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;
