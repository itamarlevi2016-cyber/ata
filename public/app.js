'use strict';
/* קשר טוב — תצוגה, חיפוש, סינון וטפסים. הסנכרון עם השרת נמצא ב-shared.js. */

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const fields = [
  ['name', 'שם מלא', 'text', true],
  ['gender', 'מועמד / מועמדת', ['מועמד', 'מועמדת']],
  ['birthDate', 'תאריך לידה — עברי או לועזי', 'text'],
  ['age', 'גיל כפי שנמסר', 'number'],
  ['community', 'עדה', 'text'],
  ['city', 'עיר מגורים', 'text'],
  ['occupation', 'מקצוע / עיסוק', 'text'],
  ['school', 'מקום לימודים / ישיבה / סמינר', 'text'],
  ['height', 'גובה (ס״מ)', 'number'],
  ['religious', 'סגנון / השקפה', 'text'],
  ['marital', 'מצב משפחתי', ['לא נמסר', 'רווק/ה', 'גרוש/ה', 'אלמן/ה']],
  ['status', 'מצב השידוך', ['לא נבדק', 'פנוי/ה', 'בבירור', 'בהיכרות', 'מאורס/ת', 'לא פעיל/ה']],
  ['phone', 'טלפון', 'tel'],
  ['contact', 'איש / אשת קשר', 'text'],
  ['contactPhone', 'טלפון לבירורים', 'tel'],
  ['contactEmail', 'מייל איש / אשת הקשר', 'email'],
  ['family', 'פרטי המשפחה', 'text'],
  ['looking', 'מה מחפש/ת', 'textarea'],
  ['preferredAge', 'טווח גיל רצוי בשידוך', 'text'],
  ['preferredLocation', 'אזור מגורים רצוי בשידוך', 'text'],
  ['verifiedAt', 'תאריך בדיקת הפרטים האחרונה', 'date'],
];
const labels = Object.fromEntries([...fields.map(f => [f[0], f[1]]), ['notes', 'הערות']]);
const KEY = 'kesher-tov-v1';
const PAGE_SIZE = 24;
const VIEWS = ['home', 'all', 'fav', 'progress', 'pending', 'archive'];
const ENGAGED = 'מאורס/ת';

let page = 0, records = [], editing = null, nav = 'home', listView = false;
let importRows = [], importHeaders = [], importMap = {};
let failedStorage = false, legacyRecords = [], editingBase = null, newEditingId = null, newEditingCreatedAt = null;
let currentUser = null, suppressHash = false;

try { const saved = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(saved)) throw Error(); legacyRecords = saved; } catch { failedStorage = true; }
try { listView = localStorage.getItem(KEY + ':view') === 'list'; } catch {}

const uid = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const progress = r => ['בבירור', 'בהיכרות'].includes(r.status);
const initial = r => (r.name || '').split(/\s+/).slice(0, 2).map(x => x[0]).join('');
const statusClass = r => r.needsCompletion ? 'pending' : r.status === ENGAGED ? 'engaged' : progress(r) ? 'progress' : r.status === 'פנוי/ה' ? 'free' : '';
const statusText = r => r.needsCompletion ? 'שם להשלמה' : r.status || 'לא נבדק';

function toast(t) { $('toast').textContent = t; $('toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.remove('show'), 4000); }
function open(id) { $(id).showModal(); }
function close(id) { $(id).close(); }

// טעינה עצלה של ספריות כבדות (Excel / Word) רק כשצריך אותן.
const loadedScripts = {};
function loadScript(src) {
  return loadedScripts[src] || (loadedScripts[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src; s.onload = resolve;
    s.onerror = () => { delete loadedScripts[src]; reject(Error('לא ניתן לטעון רכיב. בדקי את החיבור ונסי שוב.')); };
    document.head.append(s);
  }));
}

/* ---------- שמירה ---------- */
async function persist(next, baseOverride = null) {
  if (!sharedReady) { toast('המאגר המשותף עדיין אינו מחובר. המתיני לחיבור ונסי לשמור שוב.'); return false; }
  const before = new Map(records.map(r => [r.id, r])); if (baseOverride?.id) before.set(baseOverride.id, baseOverride);
  const after = new Map(next.map(r => [r.id, r])), operations = [];
  for (const r of next) {
    const old = before.get(r.id);
    if (!old) { operations.push({ id: r.id, type: 'create', record: r }); continue; }
    const changes = {}, base = {};
    for (const k of new Set([...Object.keys(old), ...Object.keys(r)])) {
      if (k.startsWith('_') || ['id', 'updatedAt', 'updatedBy', 'userOverrides', 'customOverrides'].includes(k)) continue;
      if (JSON.stringify(old[k] ?? null) !== JSON.stringify(r[k] ?? null)) { changes[k] = r[k] ?? null; base[k] = old[k] ?? null; }
    }
    if (Object.keys(changes).length) operations.push({ id: r.id, type: 'patch', changes, base });
  }
  for (const [id, r] of before) if (!after.has(id)) operations.push({ id, type: 'delete', version: r._version });
  return commitOperations(operations);
}

/* ---------- חיפוש וסינון ---------- */
const searchable = r => [r.name, ...(r.aliases || []), r.city, r.community, r.occupation, r.school, r.religious, r.looking, r.contact, r.family, r.notes, ...Object.values(r.custom || {})].filter(Boolean).join(' ').toLocaleLowerCase('he');
const digits = s => String(s || '').replace(/\D/g, '');

function filtered() {
  const q = $('search').value.trim().toLocaleLowerCase('he'), qDigits = digits(q);
  const gender = $('genderFilter').value, community = $('communityFilter').value, status = $('statusFilter').value;
  const minAge = Number($('minAge').value), maxAge = Number($('maxAge').value), city = $('cityFilter').value.trim(), missing = $('missingFilter').value;
  const result = records.filter(r =>
    (nav === 'archive' ? r.status === ENGAGED : nav === 'pending' ? r.needsCompletion : !r.needsCompletion && r.status !== ENGAGED)
    && (nav !== 'fav' || r.favorite) && (nav !== 'progress' || progress(r))
    && (!gender || r.gender === gender) && (!community || r.community === community) && (!status || r.status === status)
    && (!minAge || (Number(r.age) > 0 && Number(r.age) >= minAge)) && (!maxAge || (Number(r.age) > 0 && Number(r.age) <= maxAge))
    && (!city || (r.city || '').includes(city)) && (!missing || !String(r[missing] || '').trim())
    && (!q || searchable(r).includes(q) || (qDigits.length >= 4 && [r.phone, r.contactPhone].some(p => digits(p).includes(qDigits)))));
  const sort = $('sort').value;
  return result.sort((a, b) => sort === 'age' ? (Number(a.age) || 999) - (Number(b.age) || 999)
    : sort === 'ageDesc' ? (Number(b.age) || -1) - (Number(a.age) || -1)
    : sort === 'recent' ? (b.createdAt || 0) - (a.createdAt || 0)
    : String(a[sort] || '').localeCompare(String(b[sort] || ''), 'he'));
}

/* ---------- פרטי קשר ---------- */
function contactEmail(r) { return Object.hasOwn(r, 'contactEmail') ? r.contactEmail : (r.custom?.['מייל אשת קשר'] || ''); }
const validPhone = v => /^\+?[\d\s()-]{7,22}$/.test(String(v || '').trim());
const validEmail = v => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(String(v || '').trim());
function contactLink(value, type) {
  const v = String(value || '').trim(); if (!v) return '';
  const safe = type === 'email' ? validEmail(v) : validPhone(v);
  return safe ? `<a class="contact-link" href="${type === 'email' ? 'mailto:' + encodeURIComponent(v) : 'tel:' + v.replace(/[^+\d]/g, '')}">${icon(type === 'email' ? 'mail' : 'phone')}<bdi>${esc(v)}</bdi></a>` : `<span class="contact-value">${esc(v)}</span>`;
}
function contactInline(r) {
  const phone = String(r.contactPhone || '').trim(), email = String(contactEmail(r) || '').trim();
  if (phone && validPhone(phone)) return `<a class="contact-inline" href="tel:${phone.replace(/[^+\d]/g, '')}" title="חיוג אל ${esc(r.contact || phone)}">${icon('phone')}<span>${esc(r.contact || phone)}</span></a>`;
  if (email && validEmail(email)) return `<a class="contact-inline" href="mailto:${encodeURIComponent(email)}" title="מייל אל ${esc(r.contact || email)}">${icon('mail')}<span>${esc(r.contact || email)}</span></a>`;
  return `<span class="contact-none">${r.contact ? esc(r.contact) + ' · ' : ''}אין טלפון</span>`;
}
function sourceContacts(r) {
  const phone = /(?:\+972[\s-]?[1-9]|0[2-9])[\s-]?\d(?:[\s-]?\d){6,7}\b/, email = /[^\s<>@;]+@[^\s<>@;]+\.[a-z]{2,}/i;
  const texts = [r.notes, r.resumeText, ...Object.entries(r.custom || {}).filter(([k]) => !['מייל אשת קשר', 'מקור', 'מקור רזומה', 'קובצי מקור מצורפים'].includes(k)).map(([k, v]) => k + ': ' + v)];
  return [...new Set(texts.filter(Boolean).flatMap(t => String(t).split(/\n|;\s*/)).map(t => t.trim()).filter(t => phone.test(t) || email.test(t)))].filter(t => t !== r.contactPhone && t !== contactEmail(r));
}
function contactBlock(r, full = false) {
  const email = contactEmail(r), extra = sourceContacts(r);
  return `<section class="contact-panel" aria-label="פרטי קשר לבירורים"><small>יצירת קשר לבירורים</small><strong>${esc(r.contact || 'איש קשר לא צוין')}</strong><div class="contact-actions">${contactLink(r.contactPhone, 'phone')}${contactLink(email, 'email')}</div>${!r.contactPhone && !email ? '<p class="contact-missing">לא נמסרו טלפון או מייל של איש הקשר</p>' : ''}${r.phone ? `<div class="candidate-contact"><small>טלפון המועמד/ת</small>${contactLink(r.phone, 'phone')}</div>` : ''}${extra.length ? `<details class="contact-source" ${full ? 'open' : ''}><summary>פרטי קשר נוספים מהמקור (${extra.length})</summary><p>יש לקרוא את התיאור לצד המספר כדי לזהות למי הוא שייך.</p>${extra.map(t => `<div dir="auto">${esc(t)}</div>`).join('')}</details>` : ''}</section>`;
}

/* ---------- תצוגה ---------- */
function subline(r) { return [r.gender, r.age ? `גיל ${r.age}` : '', r.city].filter(Boolean).join(' · '); }

function cardHtml(r) {
  const data = [['community', 'עדה'], ['religious', 'סגנון / השקפה'], ['occupation', 'עיסוק'], ['school', 'מקום לימודים']].filter(([k]) => r[k]).slice(0, 4);
  const looking = r.looking ? `<div class="wide"><small>מה מחפש/ת</small><span>${esc(r.looking)}</span></div>` : '';
  const body = data.length || looking ? `<div class="card-data">${data.map(([k, l]) => `<div><small>${l}</small><span title="${esc(r[k])}">${esc(r[k])}</span></div>`).join('')}${looking}</div>` : '<p class="card-empty">עדיין אין פרטים נוספים בכרטיס</p>';
  return `<article class="card ${r.gender === 'מועמד' ? 'male' : ''}" data-id="${esc(r.id)}" tabindex="0" aria-label="פתיחת הכרטיס של ${esc(r.name)}">
    <div class="card-top"><span class="initials" aria-hidden="true">${esc(initial(r))}</span><div><h3><button data-detail="${esc(r.id)}">${esc(r.name)}</button></h3><div class="subline">${esc(subline(r)) || 'פרטים להשלמה'}</div></div><button class="fav ${r.favorite ? 'on' : ''}" data-fav="${esc(r.id)}" aria-label="${r.favorite ? 'הסרה מהמסומנים' : 'סימון השם'}" aria-pressed="${!!r.favorite}">${icon('heart')}</button></div>
    ${body}
    <div class="card-bottom"><span class="status ${statusClass(r)}">${esc(statusText(r))}</span>${r.needsCompletion ? `<button class="complete-card" data-edit="${esc(r.id)}">${icon('pencil')} השלמת השם</button>` : contactInline(r)}</div>
  </article>`;
}
function rowHtml(r) {
  return `<tr><td><button class="name-cell" data-detail="${esc(r.id)}">${esc(r.name)}</button></td><td>${esc(r.age)}</td><td>${esc(r.community)}</td><td>${esc(r.city)}</td><td>${esc(r.occupation || r.school)}</td><td><span class="status ${statusClass(r)}">${esc(statusText(r))}</span></td><td>${contactInline(r)}</td><td><div class="row-actions"><button class="icon-button" data-edit="${esc(r.id)}" aria-label="עריכת ${esc(r.name)}">${icon('pencil')}</button></div></td></tr>`;
}

function render() {
  document.body.dataset.view = nav;
  const isHome = nav === 'home';
  document.querySelector('.hero').hidden = !isHome; document.querySelector('.stats').hidden = !isHome; $('homeShortcuts').hidden = !isHome; document.querySelector('.database').hidden = isHome;
  const active = records.filter(r => !r.needsCompletion && r.status !== ENGAGED), pending = records.filter(r => r.needsCompletion && r.status !== ENGAGED).length;
  for (const [id, n] of [['pendingCount', pending], ['pendingHome', pending], ['archiveCount', records.filter(r => r.status === ENGAGED).length], ['countAll', active.length], ['navCount', active.length], ['countMale', active.filter(r => r.gender === 'מועמד').length], ['countFemale', active.filter(r => r.gender === 'מועמדת').length], ['countProgress', active.filter(progress).length]]) $(id).textContent = n;
  const communities = [...new Set(records.map(r => r.community).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he')), selected = $('communityFilter').value;
  $('communityFilter').innerHTML = '<option value="">כל העדות</option>' + communities.map(c => `<option ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const result = filtered();
  updateDirectoryTools(result.length);
  $('sectionHint').textContent = nav === 'pending' ? 'הפרטים שנמסרו סודרו; נדרש שם מלא או אימות זהות מהמציעה' : nav === 'archive' ? 'דווח על אירוסין — הרשומות הוסרו מהמאגר הפעיל' : nav === 'fav' ? 'שמות שסומנו בלב. הרשימה משותפת לכל הצוות' : 'הגילים לפי הדיווח המקורי · יש לבדוק זמינות ופרטים עדכניים';
  $('resultCount').textContent = result.length;
  $('sectionTitle').firstChild.textContent = { archive: 'ארכיון אירוסין ', pending: 'שמות להשלמה ', fav: 'שמות מסומנים ', progress: 'בתהליך היכרות ' }[nav] || 'מאגר השמות ';
  $('empty').hidden = !!result.length;
  $('empty').querySelector('h3').textContent = records.length ? 'לא נמצאו שמות מתאימים' : 'כאן מתחילים חיבורים חדשים';
  $('empty').querySelector('p').textContent = records.length ? 'נסי לשנות את החיפוש או את הסינון.' : 'הוסיפי שם ראשון או ייבאי רשימה קיימת מקובץ.';
  $('emptyAdd').hidden = !!records.length;
  $('cards').hidden = listView || !result.length; $('tableWrap').hidden = !listView || !result.length;
  $('demoBanner').hidden = !records.some(r => r.demo);
  const pages = Math.max(1, Math.ceil(result.length / PAGE_SIZE));
  page = Math.min(page, pages - 1);
  const shown = result.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  $('pagination').hidden = result.length <= PAGE_SIZE;
  $('pageLabel').textContent = `עמוד ${page + 1} מתוך ${pages}`;
  $('prevPage').disabled = page === 0; $('nextPage').disabled = page + 1 >= pages;
  $('cards').innerHTML = shown.map(cardHtml).join('');
  $('tableBody').innerHTML = shown.map(rowHtml).join('');
  document.querySelectorAll('[data-nav]').forEach(b => { b.classList.toggle('active', b.dataset.nav === nav); b.setAttribute('aria-current', b.dataset.nav === nav ? 'page' : 'false'); });
  if (!sharedReady) { $('empty').hidden = true; $('sectionHint').textContent = 'טוענת את המאגר המשותף…'; }
}

function updateDirectoryTools(count) {
  const bits = [['search', 'חיפוש'], ['genderFilter', ''], ['communityFilter', 'עדה'], ['statusFilter', 'מצב'], ['minAge', 'מגיל'], ['maxAge', 'עד גיל'], ['cityFilter', 'עיר'], ['missingFilter', 'חסר']]
    .filter(([id]) => $(id).value)
    .map(([id, label]) => { const el = $(id); const text = el.tagName === 'SELECT' ? el.selectedOptions[0].textContent : el.value; return { id, text: label ? `${label}: ${text}` : text }; });
  $('filterSummary').innerHTML = bits.length
    ? `<span>${count} תוצאות</span>` + bits.map(b => `<span class="chip">${esc(b.text)}<button data-clear="${b.id}" aria-label="הסרת הסינון ${esc(b.text)}">${icon('x')}</button></span>`).join('') + (bits.length > 1 ? `<button class="text-button small" id="clearAll">איפוס הכול</button>` : '')
    : '';
  const extra = ['minAge', 'maxAge', 'cityFilter', 'missingFilter'].filter(id => $(id).value).length;
  $('filterCount').hidden = !extra; $('filterCount').textContent = extra;
  $('gridBtn').classList.toggle('active', !listView); $('listBtn').classList.toggle('active', listView);
  $('gridBtn').setAttribute('aria-pressed', String(!listView)); $('listBtn').setAttribute('aria-pressed', String(listView));
}

/* ---------- טופס עריכה ---------- */
function formSection(key) { const titles = { name: 'היכרות ופרטים אישיים', occupation: 'לימודים, עיסוק וסגנון', phone: 'קשר ומשפחה', looking: 'מה מחפש/ת ובדיקת הפרטים' }; return titles[key] ? `<h3 class="form-section-title">${titles[key]}</h3>` : ''; }
$('formFields').innerHTML = fields.map(([key, label, type, required]) => `${formSection(key)}<label class="${type === 'textarea' ? 'wide' : ''}">${label}${required ? ' *' : ''}${type === 'textarea' ? `<textarea name="${key}" rows="3" placeholder="סגנון, תכונות שחשובות, כיוון תורני או מקצועי וכל העדפה שנמסרה"></textarea>` : Array.isArray(type) ? `<select name="${key}">${type.map(v => `<option>${v}</option>`).join('')}</select>` : `<input name="${key}" type="${type}" ${required ? 'required maxlength="120"' : ''} ${key === 'birthDate' ? 'placeholder="למשל: כ״ד תשרי תשס״ג; אפשר גם תאריך חלקי"' : ''} ${key === 'age' ? 'min="18" max="120" step="0.1"' : key === 'height' ? 'min="80" max="250"' : ''}>`}</label>`).join('');

function customRow(key = '', value = '') {
  const div = document.createElement('div'); div.className = 'custom-row';
  div.innerHTML = `<input placeholder="שם השדה" aria-label="שם שדה נוסף" value="${esc(key)}"><input placeholder="הפרטים" aria-label="תוכן שדה נוסף" value="${esc(value)}"><button type="button" class="icon-button" aria-label="הסרת השדה">${icon('x')}</button>`;
  div.querySelector('button').onclick = () => div.remove(); $('customFields').append(div);
}
function edit(id) {
  editing = id || null; const r = records.find(x => x.id === id) || {};
  editingBase = JSON.parse(JSON.stringify(r)); newEditingId = uid(); newEditingCreatedAt = Date.now();
  $('editConflict').hidden = true; $('duplicateHint').hidden = true; $('editForm').reset(); $('customFields').innerHTML = '';
  for (const [key] of fields) $('editForm').elements[key].value = r[key] ?? (key === 'gender' ? 'מועמד' : key === 'status' ? 'פנוי/ה' : key === 'marital' ? 'לא נמסר' : '');
  $('editForm').elements.notes.value = r.notes || '';
  Object.entries(r.custom || {}).forEach(([k, v]) => customRow(k, v));
  $('completionLabel').hidden = !r.needsCompletion; $('completeIdentity').checked = false;
  $('editTitle').textContent = id ? 'עריכת הכרטיס' : 'הוספת שם חדש';
  open('editDialog'); $('editForm').querySelector('.form-body').scrollTop = 0;
}
// התראה על כפילות אפשרית בזמן הקלדה (לפי שם או טלפון).
function checkDuplicate() {
  const name = norm($('editForm').elements.name.value), phone = digits($('editForm').elements.phone.value);
  const dupes = records.filter(r => r.id !== editing && ((name.length > 3 && norm(r.name) === name) || (phone.length >= 9 && digits(r.phone) === phone)));
  $('duplicateHint').hidden = !dupes.length;
  if (dupes.length) $('duplicateHint').textContent = `שימי לב: ייתכן שכבר קיים כרטיס דומה במאגר — ${dupes.slice(0, 3).map(r => r.name).join(', ')}.`;
}
['name', 'phone'].forEach(k => $('editForm').elements[k].addEventListener('input', checkDuplicate));

$('editForm').onsubmit = async e => {
  e.preventDefault();
  const old = editing ? editingBase : null;
  const r = { ...old, id: editing || newEditingId, createdAt: old?.createdAt || newEditingCreatedAt, updatedAt: Date.now(), custom: {} };
  for (const [k] of fields) r[k] = String($('editForm').elements[k].value).trim();
  if (!r.name) { toast('יש למלא שם מלא'); return; }
  r.notes = $('editForm').elements.notes.value.trim();
  r.userOverrides = [...new Set([...(old?.userOverrides || []), ...fields.map(f => f[0]).filter(k => String(r[k] || '') !== String(old?.[k] || '')), ...(r.notes !== (old?.notes || '') ? ['notes'] : [])])];
  if ($('completeIdentity').checked) { r.needsCompletion = false; r.userOverrides.push('needsCompletion'); }
  document.querySelectorAll('.custom-row').forEach(row => { const [k, v] = row.querySelectorAll('input'); if (k.value.trim()) r.custom[k.value.trim()] = v.value.trim(); });
  r.customOverrides = [...new Set([...(old?.customOverrides || []), ...Object.keys(r.custom).filter(k => r.custom[k] !== old?.custom?.[k])])];
  if (await persist(editing ? records.map(x => x.id === editing ? r : x) : [...records.filter(x => x.id !== r.id), r], old)) {
    close('editDialog'); toast('הכרטיס נשמר בהצלחה');
    if (r.status === ENGAGED && old?.status !== ENGAGED) openCelebration(r.id);
  }
};

/* ---------- כרטיס מלא ---------- */
function sourceLinks(r) { return (r.documents || []).filter(d => /^\/documents\/[A-Za-z0-9_.-]+$/.test(d.url)).map(d => `<a class="source-download" href="${esc(d.url)}" download="${esc(d.filename)}">${icon('file')} ${esc(d.kind || 'רזומה מקור')} · ${esc(d.filename)}</a>`).join(''); }
function downloadProfile(id) {
  const r = records.find(x => x.id === id); if (!r) return;
  try { download(KTExport.buildDocx(r), (r.name || 'כרטיס').replace(/[\\/:*?"<>|]/g, '-') + ' — כל הפרטים.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); toast('קובץ Word עם כל הפרטים הורד'); }
  catch { toast('לא ניתן ליצור את הקובץ. נסי לרענן את העמוד.'); }
}
function detail(id, fromHash = false) {
  const r = records.find(x => x.id === id); if (!r) return;
  $('detailContent').dataset.recordId = id; $('detailContent').dataset.version = String(r._version);
  const essentials = [['birthDate', 'תאריך לידה'], ['city', 'עיר מגורים'], ['looking', 'מה מחפש/ת'], ['verifiedAt', 'בדיקת פרטים אחרונה']];
  const rest = [...fields.filter(([k]) => !['name', 'gender', 'birthDate', 'city', 'looking', 'verifiedAt', 'contact', 'contactPhone', 'contactEmail', 'phone'].includes(k) && r[k]).map(([k, l]) => [l, r[k]]), ...Object.entries(r.custom || {})];
  const updated = r._changedAt ? new Date(r._changedAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '';
  $('detailContent').innerHTML = `<div class="modal-head"><h2>הכרטיס המלא</h2><button class="icon-button close" data-close="detailDialog" aria-label="סגירה">${icon('x')}</button></div>
    <div class="detail-hero ${r.gender === 'מועמד' ? 'male' : ''}"><span class="initials" aria-hidden="true">${esc(initial(r))}</span><div><h2>${esc(r.name)}</h2><p class="muted">${esc(subline(r))}</p></div><span class="status ${statusClass(r)}">${esc(statusText(r))}</span></div>
    <div class="form-body">
      ${contactBlock(r, true)}
      <p class="source-date">דיווח מקורי: ${esc(r.custom?.['תאריך דיווח'] || 'לא נמסר')} · שדה ריק מציין מידע שטרם נמסר</p>
      <section class="profile-essentials">${essentials.map(([k, l]) => `<p><strong>${l}</strong><span class="${r[k] ? '' : 'none'}">${esc(r[k] || 'טרם נמסר')}</span></p>`).join('')}</section>
      ${rest.length ? `<div class="detail-grid">${rest.map(([k, v]) => `<div><small>${esc(k)}</small><span>${esc(v)}</span></div>`).join('')}</div>` : ''}
      ${r.documents?.length ? `<div class="source-files"><h3>קובצי הרזומה המקוריים</h3>${sourceLinks(r)}</div>` : ''}
      ${r.notes ? `<h3>הערות ומידע נוסף</h3><div class="detail-notes">${esc(r.notes)}</div>` : ''}
      ${r.resumeText ? `<details class="resume-source"><summary>הצגת טקסט הרזומה המלא</summary><div>${esc(r.resumeText)}</div></details>` : ''}
      ${updated ? `<p class="audit">עודכן לאחרונה ${esc(updated)}${r._updatedBy ? ` · על ידי ${esc(r._updatedBy)}` : ''}</p>` : ''}
    </div>
    <div class="modal-footer">
      <button class="primary" data-edit="${esc(r.id)}">${icon('pencil')} עריכת פרטים</button>
      <button class="outline" data-fav="${esc(r.id)}" aria-pressed="${!!r.favorite}">${icon('heart')} ${r.favorite ? 'מסומן' : 'סימון'}</button>
      <button class="outline" data-engage="${esc(r.id)}">${r.status === ENGAGED ? 'החזרה למאגר' : icon('sparkles') + ' דיווח על אירוסין'}</button>
      <details class="more-actions"><summary class="outline" aria-label="פעולות נוספות">${icon('more')}</summary><div class="menu"><button data-download="${esc(r.id)}">${icon('download')} הורדת כל הפרטים ב־Word</button><button class="danger" data-delete="${esc(r.id)}">${icon('x')} מחיקת הכרטיס</button></div></details>
    </div>`;
  if (!$('detailDialog').open) open('detailDialog');
  if (!fromHash) setHash('card/' + id);
}
$('detailDialog').addEventListener('close', () => { if (location.hash.startsWith('#card/')) setHash(nav); });

/* ---------- אירועים ---------- */
document.addEventListener('click', async e => {
  if (e.target.closest('a,.contact-source')) return;
  const clear = e.target.closest('[data-clear],#clearAll');
  if (clear) { if (clear.id === 'clearAll') resetFilters(); else $(clear.dataset.clear).value = ''; page = 0; render(); return; }
  const b = e.target.closest('[data-close],[data-fav],[data-detail],[data-edit],[data-delete],[data-engage],[data-download]');
  if (b) {
    if (b.dataset.download) downloadProfile(b.dataset.download);
    else if (b.dataset.engage) {
      const r = records.find(x => x.id === b.dataset.engage); if (!r) return;
      if (r.status !== ENGAGED) { openCelebration(r.id); return; }
      if (await persist(records.map(x => x.id === r.id ? { ...x, status: 'לא נבדק', updatedAt: Date.now(), userOverrides: [...new Set([...(x.userOverrides || []), 'status'])] } : x))) { close('detailDialog'); toast('הכרטיס הוחזר למאגר'); }
    }
    else if (b.dataset.close) close(b.dataset.close);
    else if (b.dataset.fav) { const id = b.dataset.fav; await persist(records.map(r => r.id === id ? { ...r, favorite: !r.favorite } : r)); if ($('detailDialog').open) detail(id, true); }
    else if (b.dataset.detail) detail(b.dataset.detail);
    else if (b.dataset.edit) { if ($('detailDialog').open) close('detailDialog'); edit(b.dataset.edit); }
    else if (b.dataset.delete && confirm('להעביר את הכרטיס ל„נמחקו לאחרונה”? השינוי יופיע אצל כולן, וניתן לשחזר אותו מהעזרה.')) { if (await persist(records.filter(r => r.id !== b.dataset.delete))) { close('detailDialog'); toast('הכרטיס הועבר לנמחקו לאחרונה'); } }
    return;
  }
  const card = e.target.closest('.card'); if (card) detail(card.dataset.id);
});
$('cards').onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) { e.preventDefault(); detail(e.target.dataset.id); } };

['addBtn', 'heroAdd', 'emptyAdd'].forEach(id => $(id).onclick = () => edit());
$('addCustom').onclick = () => customRow();
['helpBtn', 'helpTop'].forEach(id => $(id).onclick = () => open('helpDialog'));
['importBtn', 'heroImport', 'importNav'].forEach(id => $(id).onclick = () => open('importDialog'));
for (const id of ['search', 'genderFilter', 'communityFilter', 'statusFilter', 'minAge', 'maxAge', 'cityFilter', 'missingFilter', 'sort']) $(id).addEventListener('input', () => { page = 0; render(); });
$('moreFilters').onclick = () => { $('extraFilters').hidden = !$('extraFilters').hidden; $('moreFilters').setAttribute('aria-expanded', String(!$('extraFilters').hidden)); };
function resetFilters() { page = 0; for (const id of ['search', 'genderFilter', 'communityFilter', 'statusFilter', 'minAge', 'maxAge', 'cityFilter', 'missingFilter']) $(id).value = ''; }
$('clearFilters').onclick = () => { resetFilters(); render(); };
document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => goToSection(b.dataset.nav));
document.querySelectorAll('[data-stat]').forEach(b => b.onclick = () => { resetFilters(); nav = b.dataset.stat === 'progress' ? 'progress' : 'all'; $('genderFilter').value = b.dataset.stat === 'male' ? 'מועמד' : b.dataset.stat === 'female' ? 'מועמדת' : ''; setHash(nav); render(); window.scrollTo({ top: 0, behavior: 'instant' }); });
for (const [id, v] of [['listBtn', true], ['gridBtn', false]]) $(id).onclick = () => { listView = v; try { localStorage.setItem(KEY + ':view', v ? 'list' : 'grid'); } catch {} render(); };
$('clearDemo').onclick = async () => { if (confirm('להסיר את כל כרטיסי ההדגמה?')) await persist(records.filter(r => !r.demo)); };
$('statusFilter').addEventListener('change', () => { if ($('statusFilter').value === ENGAGED) nav = 'archive'; else if (nav === 'archive') nav = 'all'; render(); });
$('prevPage').onclick = () => { page--; render(); $('sectionTitle').scrollIntoView({ block: 'start' }); };
$('nextPage').onclick = () => { page++; render(); $('sectionTitle').scrollIntoView({ block: 'start' }); };
$('browseNames').onclick = () => goToSection('all');
document.querySelector('.brand').onclick = e => { e.preventDefault(); goToSection('home'); };
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => goToSection(b.dataset.go));
$('homeCelebrate').onclick = () => $('reportCelebrationBtn').click();

/* ---------- ניווט וכתובות ---------- */
function setHash(h) { if (location.hash === '#' + h) return; suppressHash = true; location.hash = h; }
function goToSection(section) { nav = section; resetFilters(); setHash(section); render(); window.scrollTo({ top: 0, behavior: 'instant' }); }
function applyHash() {
  const [kind, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (kind === 'card' && id) { if (nav === 'home') { nav = 'all'; render(); } if (records.find(r => r.id === id)) detail(id, true); return; }
  if ($('detailDialog').open) close('detailDialog');
  if (VIEWS.includes(kind) && kind !== nav) { nav = kind; resetFilters(); render(); }
}
window.addEventListener('hashchange', () => { if (suppressHash) { suppressHash = false; return; } applyHash(); });

/* ---------- משתמשת מחוברת ---------- */
function showUser(user) {
  currentUser = user || null; $('userChip').hidden = !user; if (!user) return;
  $('userName').textContent = user.name || user.email; $('userEmail').textContent = user.name ? user.email : '';
  const hour = new Date().getHours(), greeting = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';
  $('heroGreeting').textContent = `${greeting}, ${(user.name || '').split(' ')[0] || ''}`.replace(/, $/, '');
  const admin = user.role === 'admin', pending = Number(user.pendingRequests || 0);
  $('membersBtn').hidden = !admin; $('pendingBadge').hidden = !pending; $('pendingBadge').textContent = pending;
  if (admin && pending && !showUser.toldPending) { showUser.toldPending = true; toast(`${pending} בקשות הצטרפות ממתינות לאישורך`); }
}

/* ---------- חברות המרחב (מנהלות) ---------- */
const accessApi = (body) => fetch('/api/access', body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Kesher-Client': '1' }, body: JSON.stringify(body) } : { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error || 'הפעולה נכשלה'); return d; });
function renderMembers(data) {
  const when = t => t ? new Date(t).toLocaleDateString('he-IL') : '';
  const pending = data.members.filter(m => m.status === 'pending'), approved = data.members.filter(m => m.status === 'approved'), rejected = data.members.filter(m => m.status === 'rejected');
  const person = m => `<span><b>${esc(m.name || m.email)}</b><small>${esc(m.email)}${m.note ? ' · ' + esc(m.note) : ''}</small></span>`;
  $('membersBody').innerHTML = `
    <h3>בקשות הצטרפות ממתינות${pending.length ? ` (${pending.length})` : ''}</h3>
    ${pending.length ? pending.map(m => `<div class="member-row">${person(m)}<small class="member-date">${when(m.requestedAt)}</small><div class="button-row"><button class="primary small" data-access="approve" data-email="${esc(m.email)}" data-name="${esc(m.name)}">${icon('check')} אישור</button><button class="outline small" data-access="reject" data-email="${esc(m.email)}">דחייה</button></div></div>`).join('') : '<p class="muted">אין בקשות ממתינות. מי שתתחבר לאתר ותשלח בקשה תופיע כאן.</p>'}
    <h3>מנהלות קבועות</h3>
    <p class="muted">מוגדרות בקובץ ההגדרות של האתר ולא ניתן לשנות אותן מכאן: ${data.admins.length ? data.admins.map(esc).join(', ') : 'אין'}.</p>
    <h3>חברות מאושרות (${approved.length})</h3>
    ${approved.length ? approved.map(m => `<div class="member-row">${person(m)}<span class="status ${m.role === 'admin' ? 'progress' : ''}">${m.role === 'admin' ? 'מנהלת' : 'חברה'}</span><small class="member-date">אושרה ${when(m.decidedAt)}${m.decidedBy ? ' · ' + esc(m.decidedBy) : ''}</small><div class="button-row">${m.email === currentUser?.email ? '<small class="muted">זו את</small>' : `<button class="outline small" data-access="${m.role === 'admin' ? 'demote' : 'promote'}" data-email="${esc(m.email)}">${m.role === 'admin' ? 'הפיכה לחברה רגילה' : 'הפיכה למנהלת'}</button><button class="text-button small danger" data-access="remove" data-email="${esc(m.email)}">הסרה</button>`}</div></div>`).join('') : '<p class="muted">עדיין אין חברות מאושרות.</p>'}
    ${rejected.length ? `<h3>בקשות שנדחו (${rejected.length})</h3>${rejected.map(m => `<div class="member-row">${person(m)}<small class="member-date">${when(m.decidedAt)}</small><div class="button-row"><button class="outline small" data-access="approve" data-email="${esc(m.email)}" data-name="${esc(m.name)}">אישור בכל זאת</button><button class="text-button small" data-access="remove" data-email="${esc(m.email)}">מחיקה מהרשימה</button></div></div>`).join('')}` : ''}`;
}
async function openMembers() {
  open('membersDialog'); $('membersBody').innerHTML = '<p class="muted">טוענת…</p>';
  try { renderMembers(await accessApi()); } catch (e) { $('membersBody').innerHTML = `<p class="banner banner-warn">${esc(e.message)}</p>`; }
}
$('membersBtn').onclick = openMembers;
$('membersDialog').addEventListener('click', async e => {
  const b = e.target.closest('[data-access]'); if (!b) return;
  const labels = { approve: 'לאשר את', reject: 'לדחות את הבקשה של', remove: 'להסיר את', promote: 'להפוך למנהלת את', demote: 'להפוך לחברה רגילה את' };
  if (['remove', 'reject', 'demote'].includes(b.dataset.access) && !confirm(`${labels[b.dataset.access]} ${b.dataset.email}?`)) return;
  b.disabled = true;
  try { const data = await accessApi({ action: b.dataset.access, email: b.dataset.email, name: b.dataset.name || '' }); renderMembers({ ...data, admins: (await accessApi()).admins }); toast('הרשימה עודכנה'); refreshShared(true); }
  catch (err) { toast(err.message); b.disabled = false; }
});

/* ---------- ייצוא וגיבוי ---------- */
function download(data, name, type) { const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function backup() { download(JSON.stringify(records.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')))), null, 2), 'kesher-tov-backup-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json'); toast('קובץ הגיבוי הורד'); }
['backupBtn', 'helpBackup'].forEach(id => $(id).onclick = backup);
async function sheetDownload(rows, name) {
  try { await loadScript('/xlsx.min.js'); } catch (e) { toast(e.message); return; }
  const wb = XLSX.utils.book_new(), sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, sheet, 'שמות'); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.writeFile(wb, name);
}
$('templateBtn').onclick = () => sheetDownload([Object.fromEntries([...fields.map(([k, l]) => [l, k === 'name' ? 'שם לדוגמה' : k === 'age' ? 23 : k === 'gender' ? 'מועמדת' : '']), ['הערות', 'מחקי שורת דוגמה זו לפני הייבוא']])], 'kesher-tov-template.xlsx');
$('exportExcel').onclick = () => { if (!records.length) return toast('המאגר עדיין ריק'); sheetDownload(records.map(r => ({ ...Object.fromEntries([...fields.map(([k, l]) => [l, r[k] || '']), ['הערות', r.notes || '']]), ...r.custom })), 'kesher-tov-export.xlsx'); };
$('missingReport').onclick = () => {
  const rows = [['שם / זיהוי בפרסום', 'חסר במקור', 'איש/אשת קשר', 'טלפון לבירורים', 'מייל איש/אשת קשר', 'תאריך דיווח', 'מקור', 'הערת זיהוי']];
  for (const r of records) { const missing = [r.needsCompletion ? 'שם מלא או אימות זהות' : '', !r.birthDate ? 'תאריך לידה' : '', !r.city ? 'עיר מגורים' : '', !r.looking ? 'העדפות בשידוך' : '', !r.age ? 'גיל מדווח' : ''].filter(Boolean); if (missing.length) rows.push([r.name, missing.join(' · '), r.contact, r.contactPhone, contactEmail(r), r.custom?.['תאריך דיווח'], r.custom?.['מקור'], r.custom?.['חסר להשלמה']]); }
  const cell = v => { let s = String(v ?? ''); if (/^[=+@\-]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; };
  download('﻿' + rows.map(row => row.map(cell).join(',')).join('\r\n'), 'kesher-tov-missing-source-details.csv', 'text/csv;charset=utf-8'); toast('רשימת החוסרים ואנשי הקשר הורדה');
};

/* ---------- ייבוא ---------- */
const norm = s => String(s ?? '').trim().replace(/[\s_\-\/״"׳'().:]/g, '').toLowerCase();
const aliases = { name: ['שם', 'שם מלא', 'שם ושם משפחה', 'שם המועמד', 'שם המועמדת', 'fullname', 'name'], gender: ['מין', 'מגדר', 'מועמד מועמדת', 'gender'], birthDate: ['תאריך לידה', 'תאריך לידה כפי הרזומה', 'תאריך לידה עברי', 'תאריך לידה לועזי', 'birthDate', 'dob'], verifiedAt: ['תאריך בדיקת הפרטים האחרונה', 'verifiedAt'], preferredAge: ['טווח גיל רצוי בשידוך', 'preferredAge'], preferredLocation: ['אזור מגורים רצוי בשידוך', 'preferredLocation'], age: ['גיל', 'גיל כפי שנמסר', 'age'], community: ['עדה', 'מוצא', 'ethnicity', 'community'], city: ['עיר', 'מגורים', 'עיר מגורים', 'כתובת', 'city'], occupation: ['מקצוע', 'עיסוק', 'עבודה', 'מקצוע עיסוק', 'occupation'], school: ['מקום לימודים', 'ישיבה', 'סמינר', 'מקום לימודים ישיבה סמינר', 'school'], height: ['גובה', 'גובה סמ', 'height'], religious: ['סגנון', 'השקפה', 'זרם', 'סגנון השקפה', 'religious'], marital: ['מצב משפחתי', 'marital'], status: ['מצב', 'סטטוס', 'מצב השידוך', 'status'], phone: ['טלפון', 'נייד', 'phone'], contact: ['איש קשר', 'אשת קשר', 'איש אשת קשר', 'contact'], contactPhone: ['טלפון לבירורים', 'contactphone'], contactEmail: ['מייל אשת קשר', 'מייל איש קשר', 'מייל איש אשת הקשר', 'contactEmail'], family: ['משפחה', 'פרטי המשפחה', 'family'], looking: ['מחפש', 'מחפשת', 'מה מחפש ת', 'looking'], notes: ['הערות', 'מידע נוסף', 'notes'] };
function match(h) { return Object.keys(aliases).find(k => aliases[k].some(a => norm(a) === norm(h))) || 'custom'; }

async function readFile(file) {
  $('importPreview').hidden = true; $('importMessage').textContent = 'קוראת את הקובץ…';
  try {
    if (file.size > 10 * 1024 * 1024) throw Error('הקובץ גדול מ־10MB. פצלי אותו לקבצים קטנים יותר.');
    const ext = file.name.split('.').pop().toLowerCase(); let rows;
    if (ext === 'json') {
      rows = JSON.parse(await file.text()); if (!Array.isArray(rows)) throw Error('קובץ JSON צריך להכיל רשימת רשומות.');
      rows = rows.map(r => {
        const flat = {};
        for (const [k, v] of Object.entries(r)) { if (k.startsWith('_') || ['id', 'createdAt', 'updatedAt', 'updatedBy', 'demo', 'seedRevision', 'userOverrides', 'legacyIds', 'documents', 'resumeText', 'aliases', 'customOverrides'].includes(k)) continue; if (k === 'custom' && v && typeof v === 'object') Object.assign(flat, v); else flat[k] = v; }
        Object.defineProperty(flat, '_sourceMeta', { value: { documents: Array.isArray(r.documents) ? r.documents.filter(d => d && typeof d.url === 'string' && /^\/documents\/[A-Za-z0-9_.-]+$/.test(d.url)) : [], resumeText: typeof r.resumeText === 'string' ? r.resumeText : '', aliases: Array.isArray(r.aliases) ? r.aliases.filter(v => typeof v === 'string') : [] } });
        return flat;
      });
    } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
      await loadScript('/xlsx.min.js');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: ext === 'csv', cellDates: false });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      if (wb.SheetNames.length > 1) $('importMessage').textContent = 'נקרא הגיליון הראשון בלבד: ' + wb.SheetNames[0];
    } else if (ext === 'docx') {
      await loadScript('/mammoth.min.js');
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }); rows = [parseResume(result.value, file.name)];
    } else if (ext === 'txt') {
      rows = (await file.text()).trim().split(/\r?\n\s*\r?\n/).map(block => { const row = {}; for (const line of block.split(/\r?\n/)) { const m = line.match(/^([^:：]+)[:：]\s*(.*)$/); if (m) row[m[1].trim()] = m[2].trim(); else if (line.trim()) row['הערות'] = (row['הערות'] || '') + line + '\n'; } return row; });
    } else throw Error('סוג הקובץ אינו נתמך. בחרי Excel, CSV, Word (DOCX), JSON או TXT.');
    if (!rows.length) throw Error('לא נמצאו רשומות בקובץ.');
    if (rows.length > 10000) throw Error('ניתן לייבא עד 10,000 רשומות בכל פעם.');
    importRows = rows; importHeaders = [...new Set(rows.flatMap(r => Object.keys(r)))]; importMap = Object.fromEntries(importHeaders.map(h => [h, match(h)]));
    $('mapping').innerHTML = importHeaders.map((h, i) => `<label>${esc(h)}<select data-map="${i}"><option value="custom">שדה נוסף</option><option value="ignore">לא לייבא</option>${Object.entries(labels).map(([k, l]) => `<option value="${k}" ${importMap[h] === k ? 'selected' : ''}>${l}</option>`).join('')}${h === 'favorite' ? '<option value="favorite" selected>מסומנים</option>' : h === 'needsCompletion' ? '<option value="needsCompletion" selected>דורש השלמה</option>' : ''}</select></label>`).join('');
    document.querySelectorAll('[data-map]').forEach(s => { importMap[importHeaders[+s.dataset.map]] = s.value; s.onchange = () => { importMap[importHeaders[+s.dataset.map]] = s.value; previewImport(); }; });
    $('importMessage').textContent = 'הקובץ נקרא בהצלחה. הפרטים לא נשמרו עדיין.'; $('importPreview').hidden = false; previewImport();
  } catch (e) { $('importMessage').textContent = e.message || 'לא ניתן לקרוא את הקובץ.'; }
}
function convertRows() {
  const used = new Set(records.map(r => norm(r.name) + '|' + norm(r.phone || ''))), valid = []; let invalid = 0, duplicates = 0;
  for (const row of importRows) {
    const r = { ...(row._sourceMeta || {}), id: uid(), createdAt: Date.now(), status: 'לא נבדק', custom: {} };
    for (const h of importHeaders) { const val = row[h]; if (val === undefined || val === null || val === '') continue; const dest = importMap[h]; if (dest === 'custom') r.custom[h] = String(val); else if (dest === 'favorite' || dest === 'needsCompletion') r[dest] = val === true || val === 'true'; else if (dest !== 'ignore') r[dest] = String(val).trim(); }
    if (!r.name || (r.age && (!/^\d+(?:\.\d+)?$/.test(r.age) || +r.age < 18 || +r.age > 120))) { invalid++; continue; }
    if (r.gender) { if (['זכר', 'גבר', 'בחור', 'male'].includes(r.gender.toLowerCase())) r.gender = 'מועמד'; if (['נקבה', 'אישה', 'בחורה', 'female'].includes(r.gender.toLowerCase())) r.gender = 'מועמדת'; }
    if (!['מועמד', 'מועמדת'].includes(r.gender)) { if (r.gender) r.custom['מגדר כפי שיובא'] = r.gender; r.gender = ''; }
    if (!['לא נבדק', 'פנוי/ה', 'בבירור', 'בהיכרות', 'מאורס/ת', 'לא פעיל/ה'].includes(r.status)) { r.custom['מצב כפי שיובא'] = r.status; r.status = 'לא נבדק'; }
    const key = norm(r.name) + '|' + norm(r.phone || ''); if (used.has(key)) { duplicates++; continue; } used.add(key); valid.push(r);
  }
  return { valid, invalid, duplicates };
}
function previewImport() {
  const { valid, invalid, duplicates } = convertRows();
  $('previewHead').innerHTML = '<tr><th>שם</th><th>גיל</th><th>עדה</th><th>מקום לימודים</th><th>פרטים נוספים</th></tr>';
  $('previewBody').innerHTML = valid.slice(0, 8).map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.age)}</td><td>${esc(r.community)}</td><td>${esc(r.school)}</td><td>${esc(Object.entries(r.custom).map(([k, v]) => k + ': ' + v).join(' · '))}</td></tr>`).join('');
  $('importSummary').textContent = `${valid.length} רשומות מוכנות לייבוא · ${duplicates} כפילויות ידולגו · ${invalid} רשומות ללא שם או עם גיל לא תקין ידולגו. מוצגות עד 8 רשומות בתצוגה המקדימה.`;
  $('confirmImport').disabled = !valid.length;
}
$('fileInput').onchange = e => { if (e.target.files[0]) readFile(e.target.files[0]); };
$('dropZone').ondragover = e => { e.preventDefault(); };
$('dropZone').ondrop = e => { e.preventDefault(); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
$('confirmImport').onclick = async () => { const { valid } = convertRows(); if (!valid.length) return; if (await persist([...records, ...valid])) { close('importDialog'); $('importPreview').hidden = true; $('fileInput').value = ''; $('importMessage').textContent = ''; toast(`${valid.length} רשומות נוספו בהצלחה`); goToSection('all'); } };

function parseResume(raw, filename) {
  const text = raw.replace(/\r/g, '').trim(), compact = text.replace(/\s+/g, ' ');
  const named = compact.match(/^(.{2,70}?)\s*(?:בן|בת)\s*(\d+(?:[.,]\d+)?)/); let name = named ? named[1].replace(/^(?:פרטים|רזומה|בס[״"]ד)\s*[:–-]?\s*/, '').trim() : '';
  const labelled = text.match(/(?:^|\n)\s*שם(?: מלא)?\s*[:：]\s*([^\n]+)/); if (labelled) name = labelled[1].trim();
  const age = compact.match(/(?:גיל\s*[:：]?|בן|בת)\s*(\d+(?:[.,]\d+)?)/), ht = compact.match(/גובה\s*[:：]?\s*(\d(?:[.,]\d{1,2})|\d{3})(?!\d)/);
  const city = compact.match(/(?:גרים|גרה|מגורים)\s*[:：]?\s*ב?([^,.\n]{2,50}?)(?:\s+רחוב|[.,]|$)/), school = compact.match(/לומד(?:ת)?\s+בישיבת\s+(.{2,45}?)(?:\s+ועד|\.|,|גובה)/);
  return { 'שם מלא': name || 'שם לא זוהה — ' + filename, 'גיל': age ? age[1].replace(',', '.') : '', 'מועמד / מועמדת': compact.match(/בת\s*\d/) ? 'מועמדת' : compact.match(/בן\s*\d/) ? 'מועמד' : '', 'גובה (ס״מ)': ht ? String(Math.round(Number(ht[1].replace(',', '.')) * (Number(ht[1].replace(',', '.')) < 3 ? 100 : 1))) : '', 'עיר מגורים': city ? city[1].trim() : '', 'מקום לימודים / ישיבה / סמינר': school ? school[1].trim() : '', 'מצב השידוך': 'לא נבדק', 'הערות': 'ייבוא אוטומטי מ־' + filename + '; יש לבדוק את הגיל ויתר הפרטים מול עדכונים מאוחרים.\n\n' + text, 'needsCompletion': !name, 'מקור קובץ': filename };
}

/* ---------- התחלה ---------- */
(function start() { const [kind] = location.hash.replace(/^#\/?/, '').split('/'); if (VIEWS.includes(kind)) nav = kind; else if (kind === 'card') nav = 'all'; })();
render();
initializeShared().then(applyHash);
