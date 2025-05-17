import * as Y from 'yjs';

/**
 * Recursively extract plain text from a Yjs node.
 */
function traverse(node: any): string {
  if (node instanceof Y.Text || node instanceof Y.XmlText) {
    return node.toString();
  }
  if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
    let text = '';
    for (const child of node.toArray()) {
      text += traverse(child);
    }
    return text;
  }
  return '';
}

/**
 * Extract plain text from a Y.Doc produced by TipTap/ProseMirror.
 * This walks all shared types in the document and concatenates their
 * textual representation.
 */
export function extractPlainText(doc: Y.Doc): string {
  let text = '';
  for (const type of doc.share.values()) {
    text += traverse(type);
  }
  return text;
}
