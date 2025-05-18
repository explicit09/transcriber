import React, { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { Mark } from "@tiptap/core";
import { TextSelection } from "prosemirror-state";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";

// Timestamp anchor mark
const TimestampAnchor = Mark.create({
  name: "timestamp-anchor",
  addAttributes() {
    return {
      time: { default: null },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-timestamp]",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      { ...HTMLAttributes, "data-timestamp": HTMLAttributes.time },
      0,
    ];
  },
});

// Comment anchor mark
const CommentAnchor = Mark.create({
  name: "comment-anchor",
  addAttributes() {
    return {
      id: { default: null },
    };
  },
  parseHTML() {
    return [
      {
        tag: "span[data-comment]",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      { ...HTMLAttributes, "data-comment": HTMLAttributes.id },
      0,
    ];
  },
});

// Search highlight mark
const SearchHighlight = Mark.create({
  name: "search-highlight",
  parseHTML() {
    return [
      {
        tag: "mark[data-search-highlight]",
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "mark",
      {
        ...HTMLAttributes,
        "data-search-highlight": "true",
        class: "bg-yellow-200",
      },
      0,
    ];
  },
});

interface CollaborativeEditorProps {
  docId: string;
  token: string;
  wsUrl: string;
  highlightText?: string;
}

export function CollaborativeEditor({ docId, token, wsUrl }: CollaborativeEditorProps) {
  const user = useMemo(() => {
    let name = localStorage.getItem("lx-user-name") || "";
    if (!name) {
      name = prompt("Enter your name") || "Anonymous";
      localStorage.setItem("lx-user-name", name);
    }
    let color = localStorage.getItem("lx-user-color") || "";
    if (!color) {
      const palette = [
        "#958DF1",
        "#F48FB1",
        "#80CBC4",
        "#FFB74D",
        "#A1887F",
        "#81C784",
        "#B39DDB",
        "#4FC3F7",
        "#FF8A65",
        "#E1BEE7",
      ];
      color = palette[Math.floor(Math.random() * palette.length)];
      localStorage.setItem("lx-user-color", color);
    }
    return { name, color };
  }, []);

  const ydoc = useMemo(() => new Y.Doc(), []);

  const provider = useMemo(() => {
    const p = new WebsocketProvider(wsUrl, docId, ydoc, {
      params: { token },
    });
    return p;
  }, [wsUrl, docId, token, ydoc]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TimestampAnchor,
      CommentAnchor,
      SearchHighlight,
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCursor.configure({
        provider,
        user,
      }),
    ],
  });

  // Highlight search text and keep highlights on document updates
  useEffect(() => {
    if (!editor) return;

    const applyHighlight = () => {
      const { state, view, schema } = editor;
      const mark = schema.marks["search-highlight"];
      if (!mark) return;
      let tr = state.tr;
      tr = tr.removeMark(0, state.doc.content.size, mark);

      let first: number | null = null;
      if (highlightText) {
        const regex = new RegExp(
          highlightText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "gi",
        );
        state.doc.descendants((node, pos) => {
          if (!node.isText) return true;
          const text = node.text || "";
          let m;
          while ((m = regex.exec(text))) {
            const from = pos + m.index;
            const to = from + m[0].length;
            tr = tr.addMark(from, to, mark.create());
            if (first === null) first = from;
          }
          return true;
        });
        if (first !== null) {
          tr = tr.setSelection(TextSelection.create(tr.doc, first));
        }
      }

      if (tr.docChanged || tr.selectionSet) {
        view.dispatch(tr.scrollIntoView());
        view.focus();
      }
    };

    applyHighlight();
    editor.on("update", applyHighlight);
    return () => {
      editor.off("update", applyHighlight);
    };
  }, [editor, highlightText]);

  useEffect(() => {
    const persistence = new IndexeddbPersistence(docId, ydoc);
    persistence.on("synced", () => {});

    provider.awareness.setLocalStateField("user", user);

    const saveHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const match = docId.match(/transcription-(\d+)/);
        if (match) {
          fetch(`/api/transcriptions/${match[1]}/save-collab`, {
            method: "POST",
            credentials: "include",
          });
        }
      }
    };
    window.addEventListener("keydown", saveHandler);

    return () => {
      provider.destroy();
      persistence.destroy();
      window.removeEventListener("keydown", saveHandler);
      ydoc.destroy();
    };
  }, [docId, provider, user, ydoc]);

  return <EditorContent editor={editor} />;
}

export default CollaborativeEditor;
