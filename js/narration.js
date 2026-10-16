// מה ר' דוד אומר בכל שלב: הכותרת, ההסבר וכל הנקודות, ולא רק הכותרת.
import { applyPronunciation } from "./pronounce.js";

const SYMBOLS = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{3030}\u{303D}\u{FE0F}\u{200D}]/gu;

function clean(text) {
  return text
    .replace(SYMBOLS, "")
    .replace(/\*/g, "")
    .replace(/\s*\/\/?\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const endSentence = (t) => (/[.!?:…]$/.test(t) ? t : `${t}.`);

export function narrationFor(step) {
  const parts = [];
  if (step.title) parts.push(endSentence(clean(step.title)));
  if (step.say) parts.push(endSentence(clean(step.say)));
  if (step.points) step.points.forEach((p) => parts.push(endSentence(clean(p))));
  return parts.join(" ");
}

export const spokenText = (step) => applyPronunciation(narrationFor(step));

// FNV-1a: זהה בדפדפן ובשרת, כדי לדעת אם ההקלטה עדיין תואמת לטקסט
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const audioKey = (lessonId, index) => `${lessonId}-${index}`;
