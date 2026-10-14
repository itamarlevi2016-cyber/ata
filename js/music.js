// Original, locally bundled instrumental music; no external streaming service.
import * as store from './progress.js';
import {h} from './ui.js';
export function mountMusic(host) {
  const audio=new Audio('audio/background-calm.mp3');audio.loop=true;audio.preload='none';
  let quiet=false,blocked=false,playing=false,request=0,destroyed=false;
  audio.volume=Math.max(0,Math.min(.5,Number(store.get().musicVolume??.12)));
  const button=h('button',{class:'btn ghost small',type:'button','aria-label':'הפעלת מוזיקת רקע'},'♪ הפעילו מוזיקה');
  const volume=h('input',{type:'range',min:'0',max:'.5',step:'.01',value:String(store.get().musicVolume??.12),'aria-label':'עוצמת מוזיקת רקע'});
  const label=h('label',null,'עוצמה',volume);
  const status=h('span',{class:'music-status',role:'status'});
  const settings=h('details',null,h('summary',null,'עוצמה'),label);
  const box=h('aside',{class:'background-music','aria-label':'מוזיקת רקע'},button,settings,status);host.append(box);
  function update(){const enabled=store.get().musicEnabled;button.setAttribute('aria-pressed',String(playing));
    button.textContent=playing?'♫ כיבוי מוזיקה':quiet&&enabled?'♪ מוזיקה מושהית':blocked&&enabled?'♪ הפעילו מוזיקה':enabled?'♪ הפעילו מוזיקה':'♪ מוזיקה כבויה';
    status.textContent=quiet?'שקט בזמן שיעור ומיקרופון':blocked?'לחצו להפעלה':playing?'מוזיקה שקטה ברקע':'';
    button.setAttribute('aria-label',playing?'כיבוי מוזיקת הרקע':'הפעלת מוזיקת הרקע');
  }
  async function sync(){const ticket=++request;
    if(destroyed||quiet||document.hidden||!store.get().musicEnabled){audio.pause();playing=false;update();return;}
    try{await audio.play();if(ticket!==request||destroyed||quiet||document.hidden||!store.get().musicEnabled){if(quiet||destroyed||document.hidden||!store.get().musicEnabled)audio.pause();return;}playing=true;blocked=false;}
    catch{if(ticket!==request)return;playing=false;blocked=true;}
    update();
  }
  button.addEventListener('click',()=>{if(quiet){store.save({musicEnabled:!store.get().musicEnabled});sync();return;}store.save({musicEnabled:!playing});sync();});
  volume.addEventListener('input',()=>{const value=Math.max(0,Math.min(.5,Number(volume.value)));audio.volume=value;store.save({musicVolume:value});});
  audio.addEventListener('error',()=>{playing=false;blocked=true;update();status.textContent='המוזיקה לא נטענה. נסו שוב';});
  const visibility=()=>sync();document.addEventListener('visibilitychange',visibility);
  update();
  return {setPage(page){quiet=page==='lesson'||page==='tools';sync();},destroy(){destroyed=true;request++;audio.pause();document.removeEventListener('visibilitychange',visibility);box.remove();}};
}
