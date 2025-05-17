import React, { useEffect, useRef } from "react";
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
  const ydocRef = useRef<Y.Doc>();
  const providerRef = useRef<WebsocketProvider>();

  const editor = useEditor({
    extensions: [
      StarterKit,
      TimestampAnchor,
      CommentAnchor,
      Collaboration.configure({
        document: (ydocRef.current ||= new Y.Doc()),
      }),
      CollaborationCursor.configure({
        provider: providerRef.current,
        user: { name: "Anonymous", color: "#958DF1" },
      }),
    ],
  });

  useEffect(() => {
    const doc = (ydocRef.current ||= new Y.Doc());
    // Offline persistence
    const persistence = new IndexeddbPersistence(docId, doc);
    persistence.on("synced", () => {});

    const provider = new WebsocketProvider(wsUrl, docId, doc, {
      params: { token },
    });
    providerRef.current = provider;

    const saveHandler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const match = docId.match(/transcription-(\d+)/);
        if (match) {
          fetch(`/api/transcriptions/${match[1]}/save-collab`, {
            method: 'POST',
            credentials: 'include',
          });
        }
      }
    };
    window.addEventListener('keydown', saveHandler);

    return () => {
      provider.destroy();
      persistence.destroy();
      doc.destroy();
      window.removeEventListener('keydown', saveHandler);
    };
  }, [docId, token, wsUrl]);

  return <EditorContent editor={editor} />;
}

export default CollaborativeEditor;
