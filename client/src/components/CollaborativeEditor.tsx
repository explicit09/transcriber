import React, { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { Mark } from "@tiptap/core";
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
    return ["span", { ...HTMLAttributes, "data-timestamp": HTMLAttributes.time }, 0];
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
    return ["span", { ...HTMLAttributes, "data-comment": HTMLAttributes.id }, 0];
  },
});

interface CollaborativeEditorProps {
  docId: string;
  token: string;
  wsUrl: string;
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
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCursor.configure({
        provider,
        user,
      }),
    ],
  });

  useEffect(() => {
    const persistence = new IndexeddbPersistence(docId, ydoc);
    persistence.on("synced", () => {});
    provider.awareness.setLocalStateField("user", user);
    return () => {
      provider.destroy();
      persistence.destroy();
      ydoc.destroy();
    };
  }, [docId, provider, user, ydoc]);

  return <EditorContent editor={editor} />;
}

export default CollaborativeEditor;
