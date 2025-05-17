import * as Y from 'yjs';

function collectText(node: Y.XmlElement | Y.XmlFragment | Y.XmlText): string {
  if (node instanceof Y.XmlText) {
    return node.toString();
  }
  let text = '';
  for (const child of node.toArray()) {
    text += collectText(child as any);
    if (child instanceof Y.XmlElement && child.nodeName === 'p') {
      text += '\n';
    }
  }
  return text;
}

/** Extract plain text from a TipTap/Yjs document */
export function extractPlainText(doc: Y.Doc): string {
  const fragment = doc.getXmlFragment('prosemirror');
  return collectText(fragment).trim();
}

function insertInNode(node: Y.XmlElement | Y.XmlFragment | Y.XmlText, pos: number, id: number): boolean {
  if (node instanceof Y.XmlText) {
    const len = node.toString().length;
    if (pos <= len) {
      node.insert(pos, '', { comment: String(id) });
      return true;
    }
    return false;
  }
  let offset = 0;
  for (const child of node.toArray()) {
    const len = collectText(child as any).length;
    if (pos < offset + len) {
      return insertInNode(child as any, pos - offset, id);
    }
    offset += len;
  }
  return false;
}

/** Insert a comment anchor mark at the given absolute position */
export function insertCommentAnchor(doc: Y.Doc, position: number, commentId: number) {
  const fragment = doc.getXmlFragment('prosemirror');
  insertInNode(fragment, position, commentId);
}


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
