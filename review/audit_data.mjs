import {LESSONS} from './js/data.js';
import {narrationFor} from './js/narration.js';
console.log(JSON.stringify(LESSONS.flatMap(l=>l.steps.map((s,i)=>({key:l.id+'-'+i, lesson:l.title, original:narrationFor(s)})))));
