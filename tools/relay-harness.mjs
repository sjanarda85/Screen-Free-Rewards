import vm from 'vm'; import fs from 'fs'; import crypto from 'crypto';
export function makeRelay(){
  const src=fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url),'utf8');
  const props=new Map(), cache=new Map(), sent=[]; let off=0, pinned=null; const nowMs=()=>pinned!==null?pinned:Date.now()+off; const RealDate=Date; class FD extends RealDate{ constructor(...a){ if(a.length) super(...a); else super(nowMs()); } static now(){ return nowMs(); } }
  const env={
    Utilities:{ getUuid:()=>crypto.randomUUID(), computeDigest:(a,t)=>[...crypto.createHash('sha256').update(String(t)).digest()].map(b=>b>127?b-256:b),
      computeHmacSha256Signature:(m,k)=>[...crypto.createHmac('sha256',k).update(String(m)).digest()].map(b=>b>127?b-256:b),
      base64Decode:b=>[...Buffer.from(b,'base64')].map(x=>x>127?x-256:x), newBlob:(bytes,mime,name)=>({bytes,mime,name,getAs(t){ return {bytes:[37,80,68,70,45],mime:t,name:'x.pdf',setName(n){ this.name=n; return this; }}; }}), formatDate:(d,tz,f)=>{ const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(d); return parts; }, DigestAlgorithm:{SHA_256:1} },
    PropertiesService:{ getScriptProperties:()=>({ getProperty:k=>props.has(k)?props.get(k):null, setProperty:(k,v)=>props.set(k,v), getProperties:()=>Object.fromEntries(props), deleteProperty:k=>props.delete(k) }) },
    CacheService:{ getScriptCache:()=>({ get:k=>{ const e=cache.get(k); if(!e) return null; if(e.exp&&e.exp<nowMs()){ cache.delete(k); return null; } return e.v; }, put:(k,v,ttl)=>cache.set(k,{v,exp:ttl?nowMs()+ttl*1000:0}), remove:k=>cache.delete(k) }) },
    MailApp:{ sendEmail:m=>sent.push(m) }, LockService:{ getScriptLock:()=>({waitLock(){},releaseLock(){}}) }, ScriptApp:{ _t:[], getProjectTriggers(){ return this._t; }, deleteTrigger(t){ this._t=this._t.filter(x=>x!==t); }, newTrigger(fn){ const o={fn}; const self=this; return { timeBased(){ return { everyHours(n){ return { create(){ self._t.push({getHandlerFunction:()=>fn,hours:n}); } }; } }; } }; } }, Session:{ getScriptTimeZone:()=>'UTC' },
    ContentService:{ createTextOutput:t=>({t, setMimeType(){return this;}}), MimeType:{JSON:1} }, JSON, String, Number, Math, Date:FD, Object, console, Intl };
  vm.createContext(env); vm.runInContext(src,env);
  const handle=o=>JSON.parse(env.doPost({postData:{contents:JSON.stringify(o)}}).t);
  const codeFor=email=>{ const m=[...sent].reverse().find(x=>x.to===email.toLowerCase()&&/verification code \d{6}/.test(x.subject)); return m?m.subject.match(/(\d{6})$/)[1]:'000000'; };
  return {handle,sent,codeFor,props,env,advance:ms=>{off+=ms;},setNow:iso=>{ pinned=new RealDate(iso).getTime(); },calls:[]};
}
