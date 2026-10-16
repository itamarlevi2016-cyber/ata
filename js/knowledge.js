import {h} from './ui.js';
export const SOURCES=[
 {title:'NIDCD — איך נוצר קול ודיבור',url:'https://www.nidcd.nih.gov/news/multimedia/how-does-human-body-produce-voice-and-speech-text-version'},
 {title:'NIDCD — שמירה על הקול',url:'https://www.nidcd.nih.gov/health/taking-care-your-voice'},
 {title:'ASHA — הפקת קול ושיטות תרגול',url:'https://www.asha.org/practice-portal/clinical-topics/voice-disorders/'}
];
const TOPICS={
 basics:['היכרות עם מערכת הקול','הפקת קול משלבת נשימה, רטט במיתרים ועיצוב הצליל בחללי הגרון והפה.','לזהות קול נוח ולהכיר את מרכיביו.'],
 posture:['יציבה ושחרור','הכתפיים והלסת אינן מקור הצליל. שחרור מתח עשוי להקל על הפקת קול מאומצת.','לארגן עמידה נוחה ושחרור עדין, בלי מתיחה בכוח.'],
 breath:['אוויר וקול','האוויר מהריאות מניע את הרטט; נשיפה על ס׳ מתרגלת אוויר גם ללא קול.','לתאם נשיפה עם משפט; לא לרדוף אחרי שיא זמן.'],
 straw:['למה מתרגלים דרך קשית?','קשית מצרה חלק ממסלול הקול ומשנה את הלחץ מעל המיתרים ואת האינטראקציה עם הרטט.','לתרגל הפקת קול נינוחה, לא לנשוף חזק יותר.'],
 hum:['המהום ותהודה','בתרגול תהודה משתמשים בהפקה קלה ובתחושות באזור הפה, ובהדרגה עוברים לדיבור.','לחפש תחושה נוחה; רטט מורגש אינו מדד רפואי.'],
 trill:['רטט שפתיים','שפתיים רוטטות מצרות לסירוגין את מוצא האוויר; זה סוג של תרגול במסלול קול מצומצם.','להרפות שפתיים ולא לדחוף את האוויר.'],
 flow:['זרימת אוויר','תרגול זרימה מתמקד בנשיפה ובהפקת קול קלה, במקום לחיצה ליצירת הצליל.','להבחין בין אוויר בלבד להוספת קול נוחה.'],
 pitch:['גובה צליל','גודל המיתרים, צורתם והמתח בהם משפיעים על גובה הצליל. חללי התהודה מעצבים את גוון הקול.','לעבור בין צלילים נוחים; דיוק אינו מצדיק מאמץ.'],
 diction:['דיקציה ודיבור ברור','הלשון והשפתיים מעצבות את הקול להברות ולמילים.','לתרגל תנועה והיגוי ברורים, בלי להגביר עוצמה.'],
 projection:['הקרנת קול','דיבור מעל רעש עלול להעמיס על הקול. מיקרופון יכול להפחית צורך להתחרות ברעש.','להיות מובן לקהל באמצעות קצב, היגוי והגברה מתאימה.'],
 pacing:['קצב והפסקות','הפסקות מחלקות רעיון למשפטים ומשאירות מקום לנשימה.','לתכנן את המשפט במקום לסיים אותו על שארית האוויר.'],
 transfer:['מהצליל אל הדיבור','תרגול תהודה מתקדם מצלילים קלים לדיבור בשיחה.','להעביר תחושת נוחות להברות, למילים ולמשפטים.'],
 teaching:['קצב דיבור בשיעור','המאזין מעבד מילים לאט יותר מהקצב שבו דובר שמכיר את החומר מפיק אותן. הפסקות נותנות זמן לעיבוד, לרישום ולשאלה.','לדבר בקצב שמאפשר לתלמידים להבין ולרשום: משפטים קצרים, הפסקה אחרי כל רעיון, ובדיקת הבנה.'],
 daily:['תרגול יומי','מנוחה ושימוש מתון בקול חשובים לצד התרגול.','לבנות הרגל קצר ועקבי ולהתאים אותו לתחושה היום.']
};
const ACT_TOPIC={posture:'posture',shoulders:'posture',neck:'posture',jaw:'posture',belly:'breath',straw:'straw',hum:'hum',trill:'trill',flow:'flow',softvoice:'flow',siren:'pitch',scale:'pitch',vowels:'diction',project:'projection',speech:'transfer',transfer:'transfer'};
const LESSON_TOPIC={intro:'basics',posture:'posture',breath:'breath',warmup:'hum',diction:'diction',projection:'projection',resonance:'hum',pace:'pacing',flow:'flow',transfer:'transfer',stage:'projection',daily:'daily',tempo:'teaching',pauses:'teaching',chunks:'teaching',shiur:'teaching',pacedaily:'teaching'};
export function knowledgeFor(lesson={},step={}) {const key=(LESSON_TOPIC[lesson.id]==='teaching'&&!['belly'].includes(step.act))?'teaching':(ACT_TOPIC[step.act]||LESSON_TOPIC[lesson.id]||'basics');return {key,title:TOPICS[key][0],mechanism:TOPICS[key][1],goal:TOPICS[key][2]};}
function section(title,...kids){return h('section',{class:'knowledge-section'},h('h3',null,title),...kids);}
export function renderKnowledge(lesson={},step={}){
 const topic=knowledgeFor(lesson,step);
 return h('div',{class:'knowledge-content'},h('p',{class:'knowledge-kicker'},'מבינים את התרגיל'),h('h2',null,topic.title),
 section('מה קורה בגוף?',h('p',null,topic.mechanism)),
 section('מטרת השלב באתר',h('p',null,topic.goal)),
 section('איך עובדים מיתרי הקול?',h('p',null,'מיתרי הקול, המכונים גם קפלי הקול, נמצאים בגרון מעל קנה הנשימה. בנשימה שקטה הם פתוחים למעבר אוויר. בהפקת קול הם מתקרבים, והאוויר מהריאות מניע רטט מחזורי שיוצר צליל.'),
 h('ol',{class:'voice-chain'},['הריאות מספקות אוויר','מיתרי הקול יוצרים רטט','הגרון והפה מעצבים את הצליל','הלשון והשפתיים מעצבות מילים'].map(t=>h('li',null,t))),
 h('p',{class:'muted'},'תחושת רטט בחזה אינה אומרת שהצליל נוצר בחזה: מקור הקול הוא המיתרים בגרון.')),
 section('מה משפיע על הקול?',h('ul',null,[
 'תכונות המיתרים והמתח בהם משפיעים על גובה הקול; חללי התהודה מעצבים את הגוון.',
 'שימוש ממושך או דיבור מעל רעש עלולים להעמיס. כדאי לשלב מנוחות.',
 'עייפות, מחלה, עשן, יובש ורפלוקס יכולים להשפיע על הקול.',
 'מתח סביב הלסת והצוואר עשוי להתלוות להפקת קול מאומצת.',
 'מים ומנוחה הם חלק מהשמירה על הקול; תרגול אינו מחליף אותם.'
 ].map(t=>h('li',null,t)))),
 h('details',{class:'knowledge-more'},h('summary',null,'מושגים שכדאי להכיר'),h('dl',null,
 h('dt',null,'גובה'),h('dd',null,'כמה הצליל נתפס כגבוה או נמוך.'),
 h('dt',null,'עוצמה'),h('dd',null,'כמה חזק הצליל נשמע; אין צורך למקסם אותה בכל תרגיל.'),
 h('dt',null,'תהודה'),h('dd',null,'עיצוב הצליל בחללים שמעל המיתרים; היא תורמת לגוון הקול.'),
 h('dt',null,'דיקציה'),h('dd',null,'בהירות ההברות והמילים בעזרת הלשון, השפתיים והלסת.'))),
 h('p',{class:'knowledge-note'},'ההסבר מיועד ללמידה כללית. כאב, צרידות או מאמץ אינם יעד לתרגול; עוצרים, ובבעיה מתמשכת פונים לאיש מקצוע.'),
 h('details',{class:'knowledge-sources'},h('summary',null,'מקורות מקצועיים'),h('ul',null,SOURCES.map(s=>h('li',null,h('a',{href:s.url,target:'_blank',rel:'noopener noreferrer'},s.title)))))
 );
}
export function pageKnowledge(){return h('details',{class:'page-knowledge'},h('summary',null,'הרחבת ידע · איך הקול עובד?'),renderKnowledge());}
