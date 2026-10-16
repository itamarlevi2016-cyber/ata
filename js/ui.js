// עזרים קטנים לבניית DOM.

const SVG_TAGS = new Set(["svg", "path", "circle", "ellipse", "rect", "line", "g", "text", "defs"]);

export function h(tag, attrs, ...kids) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.setAttribute("class", v);
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  const add = (kid) => {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) kid.forEach(add);
    else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  };
  kids.forEach(add);
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

// הדגשה בטקסט: *מילה* הופכת לתגית מודגשת
export function richText(text) {
  const frag = document.createDocumentFragment();
  text.split(/(\*[^*]+\*)/).forEach((part) => {
    if (part.startsWith("*") && part.endsWith("*")) frag.append(h("mark", { class: "em" }, part.slice(1, -1)));
    else if (part) frag.append(part);
  });
  return frag;
}
