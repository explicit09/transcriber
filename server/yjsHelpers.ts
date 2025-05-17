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