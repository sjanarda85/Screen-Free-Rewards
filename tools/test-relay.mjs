import vm from 'vm'; import fs from 'fs'; import crypto from 'crypto';
const src=fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url),'utf8');
function makeEnv(){
  const props=new Map(), cache=new Map(), sent=[]; let day='2026-10-17';
  const env={
    Utilities:{ getUuid:()=>crypto.randomUUID(), computeDigest:(alg,t)=>[...crypto.createHash('sha256').update(String(t)).digest()].map(b=>b>127?b-256:b),
      computeHmacSha256Signature:(m,k)=>[...crypto.createHmac('sha256',k).update(String(m)).digest()].map(b=>b>127?b-256:b),
      base64Decode:b=>[...Buffer.from(b,'base64')].map(x=>x>127?x-256:x), newBlob:(bytes,mime,name)=>({bytes,mime,name}), formatDate:()=>day, DigestAlgorithm:{SHA_256:1} },
    PropertiesService:{ getScriptProperties:()=>({ getProperty:k=>props.has(k)?props.get(k):null, setProperty:(k,v)=>props.set(k,v), getProperties:()=>Object.fromEntries(props), deleteProperty:k=>props.delete(k) }) },
    CacheService:{ getScriptCache:()=>({ get:k=>cache.has(k)?cache.get(k):null, put:(k,v)=>cache.set(k,v), remove:k=>cache.delete(k) }) },
    MailApp:{ sendEmail:m=>sent.push(m) }, Session:{ getScriptTimeZone:()=>'UTC' },
    ContentService:{ createTextOutput:t=>({t, setMimeType(){return this;}}), MimeType:{JSON:1} }, JSON, String, Number, Math, Date, Object, console };
  vm.createContext(env); vm.runInContext(src,env);
  const post=o=>JSON.parse(env.doPost({postData:{contents:JSON.stringify(o)}}).t);
  return {env,post,sent,setDay:d=>{day=d;}};
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
  ok(JSON.parse(makeEnv().env.doGet().t).version===2,'doGet'); }
console.log(`relay tests passed ${pass}, failed ${fail}`);
