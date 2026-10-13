// מילון הגייה: מחליף מילים בטקסט ההקראה בצורה שתוקרא נכון.
// אם שמעתם מילה שהוקראה לא נכון, מוסיפים כאן שורה: [המילה כפי שכתובה, איך להקריא אותה].
// אפשר להשתמש בניקוד, למשל: ["סרעפת", "סַרְעֶפֶת"]. אחרי שינוי, ההקלטות של השלבים הרלוונטיים נוצרות מחדש אוטומטית.
export const PRONUNCIATION = [
  ["ר'", "רבי"],
];

export function applyPronunciation(text) {
  let out = text;
  for (const [from, to] of PRONUNCIATION) out = out.split(from).join(to);
  return out;
}
