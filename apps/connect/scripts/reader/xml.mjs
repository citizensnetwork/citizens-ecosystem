// A small, strict-enough XML reader for RSS and Atom, with no dependency. Pure.
//
// It builds a tree of { name, attrs, children, content } with element names lower-cased and their
// prefix kept ("content:encoded"); `content` is text and child elements in document order. Safety: a document that declares entities (<!ENTITY>) is
// refused outright (no expansion bombs, no external entities); only the five XML entities and
// numeric references are decoded; depth, node count and input size are capped; every scan is a
// forward indexOf, so the work is linear in the input.

import { decodeEntities } from "./html.mjs";

const MAX_DEPTH = 40;
const MAX_NODES = 20_000;
const MAX_CHARS = 1_000_000;

export class XmlRefused extends Error {}

function attrsOf(source) {
  const attrs = {};
  let i = 0;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i])) i++;
    const ns = i;
    while (i < source.length && !/[\s=]/.test(source[i])) i++;
    const name = source.slice(ns, i).toLowerCase();
    while (i < source.length && /\s/.test(source[i])) i++;
    if (source[i] !== "=") {
      if (!name) break;
      continue;
    }
    i++;
    while (i < source.length && /\s/.test(source[i])) i++;
    const q = source[i];
    if (q !== '"' && q !== "'") break;
    const close = source.indexOf(q, i + 1);
    if (close === -1) break;
    if (name && Object.keys(attrs).length < 30) attrs[name] = decodeEntities(source.slice(i + 1, close));
    i = close + 1;
  }
  return attrs;
}

/** Parse `text` into { name: "#document", children }. Throws XmlRefused for a document it will not read. */
export function parseXml(text) {
  const src = String(text ?? "").slice(0, MAX_CHARS);
  const root = { name: "#document", attrs: {}, children: [], content: [] };
  const stack = [root];
  let nodes = 0;
  let i = 0;
  const top = () => stack[stack.length - 1];
  const addText = (t) => {
    if (t) top().content.push(t);
  };
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    const chunk = lt === -1 ? src.slice(i) : src.slice(i, lt);
    if (chunk) addText(decodeEntities(chunk));
    if (lt === -1) break;
    if (src.startsWith("<!--", lt)) {
      const close = src.indexOf("-->", lt + 4);
      i = close === -1 ? src.length : close + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const close = src.indexOf("]]>", lt + 9);
      addText(src.slice(lt + 9, close === -1 ? src.length : close));
      i = close === -1 ? src.length : close + 3;
    } else if (src.startsWith("<?", lt)) {
      const close = src.indexOf("?>", lt + 2);
      i = close === -1 ? src.length : close + 2;
    } else if (src.startsWith("<!", lt)) {
      // DOCTYPE (with an optional internal subset). A declared entity is refused, never expanded.
      const bracket = src.indexOf("[", lt);
      const gt = src.indexOf(">", lt);
      let end = gt;
      if (bracket !== -1 && gt !== -1 && bracket < gt) {
        const subsetEnd = src.indexOf("]", bracket);
        end = subsetEnd === -1 ? -1 : src.indexOf(">", subsetEnd);
      }
      const decl = src.slice(lt, end === -1 ? src.length : end);
      if (/<!entity/i.test(decl)) throw new XmlRefused("entity declarations are not read");
      i = end === -1 ? src.length : end + 1;
    } else if (src[lt + 1] === "/") {
      const gt = src.indexOf(">", lt);
      if (gt === -1) break;
      const name = src.slice(lt + 2, gt).trim().toLowerCase();
      // Close the nearest open element of that name; a stray end tag is ignored.
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = gt + 1;
    } else {
      const gt = findTagEnd(src, lt + 1);
      if (gt === -1) break;
      let inner = src.slice(lt + 1, gt);
      const selfClosing = inner.endsWith("/");
      if (selfClosing) inner = inner.slice(0, -1);
      const nameEnd = inner.search(/[\s]|$/);
      const name = inner.slice(0, nameEnd).toLowerCase();
      i = gt + 1;
      if (!/^[a-z_][a-z0-9_.:-]{0,60}$/.test(name)) continue;
      if (++nodes > MAX_NODES) throw new XmlRefused("too many elements");
      const node = { name, attrs: attrsOf(inner.slice(nameEnd)), children: [], content: [] };
      top().children.push(node);
      top().content.push(node);
      if (!selfClosing) {
        if (stack.length > MAX_DEPTH) throw new XmlRefused("nested too deeply");
        stack.push(node);
      }
    }
  }
  return root;
}

/** The index of the ">" that ends the tag starting at `from`, skipping ">" inside quoted attribute values. */
function findTagEnd(src, from) {
  let quote = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
    else if (c === "<") return -1;
  }
  return -1;
}

/** Does `node`'s name match `name`, ignoring a namespace prefix when `name` has none? */
export function isNamed(node, name) {
  return node.name === name || (!name.includes(":") && node.name.endsWith(":" + name));
}

export const childrenNamed = (node, name) => node.children.filter((c) => isNamed(c, name));
export const firstChild = (node, name) => node.children.find((c) => isNamed(c, name)) ?? null;

/** All the text inside a node, its descendants' included, in document order (an Atom xhtml body). */
export function textOf(node) {
  if (!node) return "";
  let out = "";
  for (const part of node.content) out += typeof part === "string" ? part : textOf(part);
  return out;
}
