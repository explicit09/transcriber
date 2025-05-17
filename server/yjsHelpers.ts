import * as Y from 'yjs';

export function extractPlainText(doc: Y.Doc, root = 'prosemirror'): string {
  const frag = doc.getXmlFragment(root);
  const walk = (node: any): string => {
    if (node instanceof Y.XmlText) {
      return node.toString();
    }
    if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
      return node.toArray().map((n: any) => walk(n)).join('');
    }
    return '';
  };
  return walk(frag).replace(/\n{2,}/g, '\n').trim();
}

export function insertCommentAnchor(doc: Y.Doc, commentId: number, position = -1, root = 'prosemirror'): void {
  const frag = doc.getXmlFragment(root);
  const span = new Y.XmlElement('span');
  span.setAttribute('data-comment', String(commentId));
  if (position < 0 || position > frag.length) {
    frag.push([span]);
  } else {
    frag.insert(position, [span]);
  }
}
