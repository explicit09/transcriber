import React, { useEffect, useRef } from "react";
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

export function CollaborativeEditor({
  docId,
  token,
  wsUrl,
  highlightText,
}: CollaborativeEditorProps) {
  const ydocRef = useRef<Y.Doc>();
  const providerRef = useRef<WebsocketProvider>();

  const editor = useEditor({
    extensions: [
      StarterKit,
      TimestampAnchor,
      CommentAnchor,
      SearchHighlight,
      Collaboration.configure({
        document: (ydocRef.current ||= new Y.Doc()),
      }),
      CollaborationCursor.configure({
        provider: providerRef.current,
        user: { name: "Anonymous", color: "#958DF1" },
      }),
    ],
  });

  // Highlight search text when provided
  useEffect(() => {
    if (!highlightText || !editor) return;
    const { state, view, schema } = editor;
    const mark = schema.marks["search-highlight"];
    if (!mark) return;
    let tr = state.tr;
    tr = tr.removeMark(0, state.doc.content.size, mark);
    const regex = new RegExp(
      highlightText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gi",
    );
    let first: number | null = null;
    state.doc.descendants((node, pos) => {
      if (!node.isText) return true;
      const text = node.text || "";
      let m;
      while ((m = regex.exec(text))) {
        const from = pos + m.index;
        const to = from + m[0].length;
        tr.addMark(from, to, mark.create());
        if (first === null) first = from;
      }
      return true;
    });
    if (tr.docChanged) {
      if (first !== null) {
        tr.setSelection(TextSelection.create(tr.doc, first));
      }
      view.dispatch(tr);
      if (first !== null) {
        view.focus();
      }
    }
  }, [highlightText, editor]);

  useEffect(() => {
    const doc = (ydocRef.current ||= new Y.Doc());
    // Offline persistence
    const persistence = new IndexeddbPersistence(docId, doc);
    persistence.on("synced", () => {});

    const provider = new WebsocketProvider(wsUrl, docId, doc, {
      params: { token },
    });
    providerRef.current = provider;

    return () => {
      provider.destroy();
      persistence.destroy();
      doc.destroy();
    };
  }, [docId, token, wsUrl]);

  return <EditorContent editor={editor} />;
}

export default CollaborativeEditor;
