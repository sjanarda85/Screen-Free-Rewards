// Child "Send to both parents": unverified -> queued and flushed after verify; verified -> immediate; relay outage -> retried
import { chromium } from 'playwright-core'; import { makeRelay } from './relay-harness.mjs';
const R='file:///home/user/Screen-Free-Rewards/index.html', LINK='https://script.google.com/macros/s/AKfycbTESTLINK123/exec';
let pass=0,fail=0; const ok=(c,m)=>{ if(c) pass++; else {fail++; console.log('FAIL:',m);} };
const relay=makeRelay(); const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
let down=false; p.on('dialog',d=>{ if(d.type()==='prompt'){ const m=d.message().match(/6-digit code to (\S+?)\./); return d.accept(m?relay.codeFor(m[1]):''); } d.accept(); });
await p.route('https://script.google.com/**',async r=>{ if(down) return r.fulfill({status:500,body:'x'}); const o=JSON.parse(r.request().postData()||'{}'); await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(relay.handle(o))}); });
await p.goto(R+'#mail='+encodeURIComponent(LINK)); await p.waitForTimeout(300);
for(const [id,v] of [['sPName','Suhas'],['sPEmail','suhas85@gmail.com'],['sPName2','Divya'],['sPEmail2','divyaa.menon.md@gmail.com'],['sPPin','1357'],['sChild','Vidyut'],['sAge','9'],['sCPin','2468']]) await p.fill('#'+id,v);
await p.evaluate(()=>{ window.prompt=()=>''; }); // setup would ask for codes: skip so nothing is verified
await p.click('#doSetup'); await p.waitForTimeout(1200); await p.click('#pairModalDone').catch(()=>{});
await p.evaluate(()=>{ state.parent.tokens={}; save(); });
const ask=async t=>{ await p.click('#askBtn'); await p.fill('#askTitle',t); await p.click('#sendAsk'); await p.waitForTimeout(1500); };
// 1. nothing verified: the request is kept, the child is told, nothing is lost
relay.sent.length=0; await ask('Ten more minutes');
ok(relay.sent.length===0,'unverified: nothing sent yet'); ok(await p.evaluate(()=>pendingMailCount())===1,'one message waits in the outbox');
ok(/waiting|confirm/i.test(await p.textContent('#toast')) ,'child told it is waiting: '+await p.textContent('#toast'));
ok(await p.isVisible('#mailWait'),'child view shows the waiting line');
// 2. a parent verifies: the waiting message goes to BOTH parents by itself
for(const e of ['suhas85@gmail.com','divyaa.menon.md@gmail.com']){ relay.handle({action:'verify',email:e}); const t=relay.handle({action:'confirm',email:e,code:relay.codeFor(e)}).token; await p.evaluate(([e,t])=>{ state.parent.tokens[e]=t; save(); },[e,t]); }
relay.sent.length=0; await p.evaluate(()=>flushOutbox()); await p.waitForTimeout(1200);
ok(relay.sent.length===2 && new Set(relay.sent.map(m=>m.to)).size===2,'after verifying both parents got it: '+relay.sent.map(m=>m.to)); ok(await p.evaluate(()=>pendingMailCount())===0,'outbox empty'); ok(!(await p.isVisible('#mailWait')),'waiting line gone');
ok(/Ten more minutes/.test(relay.sent[0].htmlBody||relay.sent[0].body||''),'email mentions the request');
// 3. verified: immediate
relay.sent.length=0; await ask('Extra story'); ok(relay.sent.length===2,'verified: both parents emailed straight away ('+relay.sent.length+')'); ok(/emailed to both/i.test(await p.textContent('#toast')),'toast: '+await p.textContent('#toast'));
// 4. relay outage: queued, then retried when back
down=true; relay.sent.length=0; await ask('Zoo please'); await p.waitForTimeout(6000); ok(await p.evaluate(()=>pendingMailCount())===1,'outage: queued');
down=false; await p.evaluate(()=>flushOutbox()); await p.waitForTimeout(1500); ok(relay.sent.length===2 && await p.evaluate(()=>pendingMailCount())===0,'after outage both parents got it ('+relay.sent.length+')');
// 5. redeem path
await p.evaluate(()=>{ const u=getU(); u.balance=100; u.rewards=[{id:5,name:'Ice cream',cost:30,desc:''}]; save(); updateUI(); });
relay.sent.length=0; await p.evaluate(()=>reqRedeem(5)); await p.waitForTimeout(1500); ok(relay.sent.length===2,'redeem emailed to both ('+relay.sent.length+')');
// 6. one parent unverified: the verified one gets it, the other waits
await p.evaluate(()=>{ delete state.parent.tokens['divyaa.menon.md@gmail.com']; save(); }); relay.sent.length=0; await ask('Partial'); ok(relay.sent.length===1 && await p.evaluate(()=>state.parent.outbox[0].emails.join())==='divyaa.menon.md@gmail.com','one sent, other queued only for the missing parent');
ok(!errs.length,'no page errors '+errs.join('|'));
console.log(`qa13: ${pass} passed, ${fail} failed`); await b.close();
