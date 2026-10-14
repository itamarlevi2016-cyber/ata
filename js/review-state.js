// A verdict belongs to exact recording bytes, never only to a lesson key.
export function currentReview(entry,row){return !!entry&&typeof entry==='object'&&entry.audioHash===row.audio_hash;}
export function reviewStatus(entry,row){return currentReview(entry,row)&&['good','bad'].includes(entry.status)?entry.status:null;}
export function reviewEntry(entry,row,patch){return {audioHash:row.audio_hash,status:reviewStatus(entry,row),notes:currentReview(entry,row)?String(entry.notes||''):'',...patch};}
export function reviewCsv(rows,state){const cell=value=>'"'+String(value??'').replaceAll('"','""')+'"';return '\uFEFF'+[['מזהה','שיעור','משך','מצב','תמלול','סימון טכני','הערות בדיקה'],...rows.map(r=>[r.key,r.lesson,r.seconds,reviewStatus(state[r.key],r)==='good'?'תקין':reviewStatus(state[r.key],r)==='bad'?'דורש תיקון':'לא נבדק',r.transcript,r.technical_flags,currentReview(state[r.key],r)?state[r.key].notes:''])].map(row=>row.map(cell).join(',')).join('\r\n');}
