import * as Y from 'yjs';

export function extractPlainText(doc: Y.Doc): string {
  const fragment = doc.getXmlFragment('prosemirror');
  function traverse(node: Y.XmlFragment | Y.XmlElement | Y.XmlText): string {
    if (node instanceof Y.XmlText) {
      return node.toString();
    }
    if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
      return node.toArray().map(child => traverse(child as any)).join('');
    }
    return '';
  }
  return traverse(fragment);
}
