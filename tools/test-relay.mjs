import vm from 'vm'; import fs from 'fs'; import crypto from 'crypto';
const src=fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url),'utf8');
function makeEnv(){
  const props=new Map(), cache=new Map(), sent=[]; let day='2026-10-17'; let off=0; const nowMs=()=>Date.now()+off;
  const env={
    Utilities:{ getUuid:()=>crypto.randomUUID(), computeDigest:(alg,t)=>[...crypto.createHash('sha256').update(String(t)).digest()].map(b=>b>127?b-256:b),
      computeHmacSha256Signature:(m,k)=>[...crypto.createHmac('sha256',k).update(String(m)).digest()].map(b=>b>127?b-256:b),
      base64Decode:b=>[...Buffer.from(b,'base64')].map(x=>x>127?x-256:x), newBlob:(bytes,mime,name)=>({bytes,mime,name}), formatDate:()=>day, DigestAlgorithm:{SHA_256:1} },
    PropertiesService:{ getScriptProperties:()=>({ getProperty:k=>props.has(k)?props.get(k):null, setProperty:(k,v)=>props.set(k,v), getProperties:()=>Object.fromEntries(props), deleteProperty:k=>props.delete(k) }) },
    CacheService:{ getScriptCache:()=>({ get:k=>{ const e=cache.get(k); if(!e) return null; if(e.exp&&e.exp<nowMs()){ cache.delete(k); return null; } return e.v; }, put:(k,v,ttl)=>cache.set(k,{v,exp:ttl?nowMs()+ttl*1000:0}), remove:k=>cache.delete(k) }) },
    MailApp:{ sendEmail:m=>sent.push(m) }, Session:{ getScriptTimeZone:()=>'UTC' },
    ContentService:{ createTextOutput:t=>({t, setMimeType(){return this;}}), MimeType:{JSON:1} }, JSON, String, Number, Math, Date, Object, console };
  vm.createContext(env); vm.runInContext(src,env);
  const post=o=>JSON.parse(env.doPost({postData:{contents:JSON.stringify(o)}}).t);
  return {env,post,sent,setDay:d=>{day=d;},advance:ms=>{off+=ms;},props};
}
let pass=0,fail=0; const ok=(c,m)=>{ if(c)pass++; else {fail++; console.log('FAIL:',m);} };
const pdf=Buffer.from('%PDF-1.4\nhello\n%%EOF').toString('base64');
{ const {post,sent}=makeEnv();
  ok(post({action:'verify',email:'bad'}).error==='bad email','rejects bad email');
  let r=post({action:'verify',email:'Parent@Example.com'}); ok(r.ok && sent.length===1 && sent[0].to==='parent@example.com','sends code to lowercase address');
  const code=sent[0].subject.match(/(\d{6})$/)[1];
  ok(post({action:'confirm',email:'parent@example.com',code:'000000'}).error==='wrong code','wrong code rejected');
  r=post({action:'confirm',email:'parent@example.com',code}); ok(r.ok && /^[0-9a-f]{64}$/.test(r.token),'right code returns token');
  const tok=r.token;
  ok(post({to:'parent@example.com',subject:'s',message:'m'}).error==='not verified','send without token blocked');
  ok(post({to:'parent@example.com',subject:'s',message:'m',token:'x'.repeat(64)}).error==='not verified','send with wrong token blocked');
  ok(post({to:'other@example.com',subject:'s',message:'m',token:tok}).error==='not verified','token is bound to its address');
  sent.length=0; r=post({to:'Parent@Example.com',subject:'S'.repeat(500),message:'m',htmlBody:'<b>x</b>',attachmentName:'../a b.pdf',attachmentBase64:'data:application/pdf;base64,'+pdf,token:tok});
  ok(r.ok && sent.length===1,'verified send works'); const m=sent[0];
  ok(m.subject.length===150 && m.name==='Screen Free Rewards' && m.attachments[0].name==='.._a_b.pdf' && m.attachments[0].mime==='application/pdf','subject clipped, fixed sender, safe pdf name');
  ok(post({to:'parent@example.com',subject:'s',message:'m',attachmentBase64:Buffer.from('not a pdf').toString('base64'),token:tok}).error==='attachment must be a PDF','non-pdf attachment refused');
  ok(post({to:'parent@example.com',subject:'s',message:'m',attachmentBase64:'A'.repeat(200001),token:tok}).error==='attachment too large','big attachment refused');
  // code attempts
  post({action:'verify',email:'kid@example.com'}); let bad; for(let i=0;i<5;i++) bad=post({action:'confirm',email:'kid@example.com',code:'111111'}); 
  ok(post({action:'confirm',email:'kid@example.com',code:'111111'}).error==='too many wrong codes, ask for a new one','locks after 5 wrong codes');
}
{ const {post,sent,setDay}=makeEnv();
  for(let i=0;i<4;i++) ok(post({action:'verify',email:'a@example.com'}).ok,'code '+(i+1));
  ok(/too many codes/.test(post({action:'verify',email:'a@example.com'}).error),'5th code refused'); setDay('2026-10-18'); ok(post({action:'verify',email:'a@example.com'}).ok,'limit resets next day');
}
{ const {post,sent}=makeEnv(); post({action:'verify',email:'p@example.com'}); const code=sent[0].subject.match(/(\d{6})$/)[1]; const tok=post({action:'confirm',email:'p@example.com',code}).token; sent.length=0;
  let n=0; for(let i=0;i<45;i++){ if(post({to:'p@example.com',subject:'s',message:'m',token:tok}).ok) n++; } ok(n===40,'per-address cap 40, got '+n);
  const g=makeEnv(); let total=0; for(let i=0;i<100;i++){ const em='u'+i+'@example.com'; const r=g.post({action:'verify',email:em}); if(r.ok) total++; } ok(total===90,'global cap 90 incl codes, got '+total);
  ok(JSON.parse(makeEnv().env.doGet().t).version===3,'doGet'); }
// ---- pairing, sync and remote controls
{ const {post,advance,props}=makeEnv();
  const room=post({action:'pair-start',childName:'Mira'}); ok(room.ok && room.roomId.length===10 && /^[0-9a-f]{32}$/.test(room.secret) && /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(room.code),'pair-start returns room, secret and a clean code');
  ok(post({action:'pair-join',code:'ZZZZ-ZZZZ',parentName:'Sam'}).error==='invalid or expired code','unknown code rejected');
  const j=post({action:'pair-join',code:room.code.toLowerCase().replace('-',' '),parentName:'Sam'}); ok(j.ok && j.roomId===room.roomId && j.secret===room.secret && j.childName==='Mira','parent joins with the code (case and dash insensitive)');
  ok(post({action:'pair-join',code:room.code,parentName:'Alex'}).ok,'second parent can join');
  ok(post({action:'pair-code',roomId:room.roomId,secret:'x'}).error==='not paired','new code needs the secret');
  const c2=post({action:'pair-code',roomId:room.roomId,secret:room.secret}); ok(c2.ok && c2.code!==room.code && c2.parents.join()==='Sam,Alex','new code and parents list');
  advance(16*60*1000); ok(post({action:'pair-join',code:c2.code,parentName:'Late'}).error==='invalid or expired code','codes expire after 15 minutes');
  const c3=post({action:'pair-code',roomId:room.roomId,secret:room.secret}); post({action:'pair-join',code:c3.code,parentName:'P3'}); const c4=post({action:'pair-code',roomId:room.roomId,secret:room.secret}); post({action:'pair-join',code:c4.code,parentName:'P4'}); const c5=post({action:'pair-code',roomId:room.roomId,secret:room.secret});
  ok(post({action:'pair-join',code:c5.code,parentName:'P5'}).error==='too many parent phones','max 4 parent phones');
  const A={roomId:room.roomId,secret:room.secret};
  ok(post({action:'sync',roomId:room.roomId,secret:'bad'}).error==='not paired' && post({action:'sync-pull',roomId:'nope',secret:'x'}).error==='not paired','wrong secret or room rejected');
  const apps=[]; for(let i=0;i<40;i++) apps.push({k:'com.app'+i,n:'App '+i,m:i});
  const cp0=post({action:'sync',...{roomId:room.roomId,secret:room.secret},date:'2026-10-17'}); ok(cp0.ok && cp0.companion===null,'no companion data yet');
  let r=post({action:'sync',...A,usage:{date:'2026-10-17',total:95.4,inApp:12,src:'companion',apps}}); ok(r.ok && r.controls.rev===0 && !r.controls.deviceLocked,'sync stores usage and returns controls');
  let p=post({action:'sync-pull',...A}); ok(p.usage['2026-10-17'].total===95 && p.usage['2026-10-17'].apps.length===30 && p.usage['2026-10-17'].apps[0].m===39 && p.usage['2026-10-17'].src==='companion','usage kept: rounded, top 30 apps, sorted');
  ok(p.childName==='Mira' && p.seen>0,'pull returns child name and last seen');
  // the web app and the companion write different fields of the same day
  const web=post({action:'sync',...A,usage:{date:'2026-10-17',src:'app',inApp:12.4,apps:[{k:'__this_app__',n:'Screen Free Rewards (this app)',m:12},{k:'manual:youtube',n:'YouTube',m:20}]}});
  ok(web.ok && web.companion.total===95 && web.companion.apps.length===30,'sync returns the companion total and apps to the web app');
  p=post({action:'sync-pull',...A}); const day=p.usage['2026-10-17']; ok(day.total===95 && day.src==='companion' && day.apps.length===30 && day.inApp===12 && day.appsApp.length===2,'web app write does not overwrite the companion data');
  const comp=post({action:'sync',...A,usage:{date:'2026-10-17',src:'companion',total:101,apps:apps.slice(0,5)}}); p=post({action:'sync-pull',...A}); ok(p.usage['2026-10-17'].total===101 && p.usage['2026-10-17'].inApp===12 && p.usage['2026-10-17'].appsApp.length===2,'companion write does not overwrite the web app fields');
  for(let d=1;d<=9;d++) post({action:'sync',...A,usage:{date:'2026-10-'+String(d).padStart(2,'0'),total:d,inApp:d,apps:[{k:'a',n:'A',m:d}]}}); p=post({action:'sync-pull',...A}); ok(Object.keys(p.usage).length===7,'only the last 7 days are kept');
  ok(post({action:'sync',...A,usage:{date:'bad',total:1}}).ok && !p.usage.bad,'bad dates ignored');
  const big=[]; for(let i=0;i<30;i++) big.push({k:'com.very.long.package.name.number.'+i+'.'+'x'.repeat(60),n:'N'.repeat(60),m:100+i}); for(let d=10;d<=17;d++) post({action:'sync',...A,usage:{date:'2026-10-'+d,total:1,apps:big}});
  ok(props.get('room:'+room.roomId).length<=8500,'room stays under the size cap: '+props.get('room:'+room.roomId).length);
  let cs=post({action:'ctrl-set',...A,controls:{deviceLocked:true,message:'M'.repeat(300),lockedApps:{'com.game':true,'com.off':false}},by:'parent'}); ok(cs.ok && cs.controls.rev===1 && cs.controls.deviceLocked && cs.controls.message.length===140 && cs.controls.lockedApps['com.game'] && !cs.controls.lockedApps['com.off'],'ctrl-set locks, clips and drops false entries');
  ok(post({action:'sync',...A}).controls.deviceLocked===true,'child sees the lock on its next sync');
  cs=post({action:'ctrl-set',...A,controls:{deviceLocked:false,lockedApps:{}}}); ok(cs.controls.rev===2 && !cs.controls.deviceLocked,'unlock bumps the revision');
  ok(post({action:'ctrl-set',roomId:room.roomId,secret:'bad',controls:{deviceLocked:true}}).error==='not paired','ctrl-set needs the secret');
  ok(post({action:'unpair',...A}).ok && post({action:'sync',...A}).error==='not paired','unpair removes the room'); }
{ const {post}=makeEnv(); const r=post({action:'pair-start',childName:'K'}); const A={roomId:r.roomId,secret:r.secret}; let n=0; for(let i=0;i<950;i++){ if(post({action:'sync',...A}).ok) n++; } ok(n===900,'per-room hourly limit 900, got '+n); }
{ const {post}=makeEnv(); let n=0; for(let i=0;i<70;i++){ if(post({action:'pair-start',childName:'x'}).ok) n++; } ok(n===60,'new rooms per day capped at 60, got '+n); }
console.log(`relay tests passed ${pass}, failed ${fail}`);
