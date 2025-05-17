import * as Y from 'yjs';

/**
 * Extract plain text from a Y.Doc object.
 * Handles XmlText and XmlElement (e.g. from ProseMirror),
 * preserves block structure via line breaks.
 */
export function yDocToPlainText(doc: Y.Doc): string {
  const fragments = Array.from((doc as any).share.values()) as any[];
  let result = '';

  const traverse = (node: any) => {
    if (!node) return;

    if (typeof node.toString === 'function' && node.constructor?.name === 'Text') {
      result += node.toString();
    } else if (node.constructor?.name === 'XmlText') {
      result += node.toString();
    } else if (node.toArray) {
      for (const child of node.toArray()) {
        traverse(child);
        if (child.nodeName === 'p') {
          result += '\n';
        }
      }
    }
  };

  for (const frag of fragments) {
    traverse(frag);
  }

  return result;
}

/**
 * Inserts a comment anchor into the Y.Doc at a specific text position.
 */
export function insertCommentAnchor(doc: Y.Doc, absolutePos: number, id: number) {
  const root = doc.getXmlFragment('prosemirror');
  let index = 0;
  let inserted = false;

  const traverse = (parent: any) => {
    if (inserted) return;
    const arr = parent.toArray();
    for (let i = 0; i < arr.length; i++) {
      const node = arr[i];
      if (node instanceof Y.XmlText) {
        const len = node.toString().length;
        if (index + len >= absolutePos) {
          const offset = absolutePos - index;
          const tail = node.toString().slice(offset);
          if (offset < len) {
            node.delete(offset, len - offset);
          }
          const anchor = new Y.XmlElement('span');
          anchor.setAttribute('data-comment', String(id));
          const newText = new Y.XmlText();
          if (tail) newText.insert(0, tail);
          parent.insert(i + 1, [anchor]);
          if (tail) parent.insert(i + 2, [newText]);
          inserted = true;
          return;
        }
        index += len;
      } else if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
        traverse(node);
        if (inserted) return;
      }
    }
    if (parent instanceof Y.XmlElement && parent.nodeName === 'p') {
      index += 1;
    }
  };

  traverse(root);
  if (!inserted) {
    const anchor = new Y.XmlElement('span');
    anchor.setAttribute('data-comment', String(id));
    root.push([anchor]);
  }
}