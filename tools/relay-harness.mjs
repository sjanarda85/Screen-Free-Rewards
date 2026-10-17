import vm from 'vm'; import fs from 'fs'; import crypto from 'crypto';
export function makeRelay(){
  const src=fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url),'utf8');
  const props=new Map(), cache=new Map(), sent=[]; let off=0; const nowMs=()=>Date.now()+off;
  const env={
    Utilities:{ getUuid:()=>crypto.randomUUID(), computeDigest:(a,t)=>[...crypto.createHash('sha256').update(String(t)).digest()].map(b=>b>127?b-256:b),
      computeHmacSha256Signature:(m,k)=>[...crypto.createHmac('sha256',k).update(String(m)).digest()].map(b=>b>127?b-256:b),
      base64Decode:b=>[...Buffer.from(b,'base64')].map(x=>x>127?x-256:x), newBlob:(bytes,mime,name)=>({bytes,mime,name}), formatDate:()=>new Date().toISOString().slice(0,10), DigestAlgorithm:{SHA_256:1} },
    PropertiesService:{ getScriptProperties:()=>({ getProperty:k=>props.has(k)?props.get(k):null, setProperty:(k,v)=>props.set(k,v), getProperties:()=>Object.fromEntries(props), deleteProperty:k=>props.delete(k) }) },
    CacheService:{ getScriptCache:()=>({ get:k=>{ const e=cache.get(k); if(!e) return null; if(e.exp&&e.exp<nowMs()){ cache.delete(k); return null; } return e.v; }, put:(k,v,ttl)=>cache.set(k,{v,exp:ttl?nowMs()+ttl*1000:0}), remove:k=>cache.delete(k) }) },
    MailApp:{ sendEmail:m=>sent.push(m) }, Session:{ getScriptTimeZone:()=>'UTC' },
    ContentService:{ createTextOutput:t=>({t, setMimeType(){return this;}}), MimeType:{JSON:1} }, JSON, String, Number, Math, Date, Object, console };
  vm.createContext(env); vm.runInContext(src,env);
  const handle=o=>JSON.parse(env.doPost({postData:{contents:JSON.stringify(o)}}).t);
  const codeFor=email=>{ const m=[...sent].reverse().find(x=>x.to===email.toLowerCase()&&/verification code \d{6}/.test(x.subject)); return m?m.subject.match(/(\d{6})$/)[1]:'000000'; };
  return {handle,sent,codeFor,props,advance:ms=>{off+=ms;},calls:[]};
}
