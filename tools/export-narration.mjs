// מייצא את טקסט ההקראה של כל שלב בקורס (JSON), בשביל יצירת ההקלטות.
import { ALL } from "../js/data.js";
import { spokenText, hashText, audioKey } from "../js/narration.js";

const items = [];
for (const lesson of ALL) {
  lesson.steps.forEach((step, i) => {
    const text = spokenText(step);
    if (text) items.push({ key: audioKey(lesson.id, i), text, hash: hashText(text) });
  });
}
console.log(JSON.stringify(items));
