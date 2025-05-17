import * as Y from 'yjs';

export function extractPlainText(doc: Y.Doc): string {
  const frag = doc.getXmlFragment('prosemirror');
  let text = '';

  const walk = (node: any) => {
    if (node instanceof Y.XmlText) {
      text += node.toString();
    } else if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
      const children = (node as any).toArray();
      for (const child of children) {
        walk(child);
      }
      if (node instanceof Y.XmlElement && node.nodeName === 'p') {
        text += '\n';
      }
    }
  };

  (frag as any).toArray().forEach(walk);
  return text;
}

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
