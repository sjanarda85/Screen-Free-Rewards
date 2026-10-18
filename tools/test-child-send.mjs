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
const ask=async t=>{ await p.click('#askBtn'); await p.fill('#askTitle',t); await p.click('#sendAsk'); await p.waitForTimeout(1500); };
// 3. immediate, no code
relay.sent.length=0; await ask('Extra story'); ok(relay.sent.length===2,'verified: both parents emailed straight away ('+relay.sent.length+')'); ok(/emailed to both/i.test(await p.textContent('#toast')),'toast: '+await p.textContent('#toast'));
// 4. relay outage: queued, then retried when back
down=true; relay.sent.length=0; await ask('Zoo please'); await p.waitForTimeout(6000); ok(await p.evaluate(()=>pendingMailCount())===1,'outage: queued');
down=false; await p.evaluate(()=>flushOutbox()); await p.waitForTimeout(1500); ok(relay.sent.length===2 && await p.evaluate(()=>pendingMailCount())===0,'after outage both parents got it ('+relay.sent.length+')');
// 5. redeem path
await p.evaluate(()=>{ const u=getU(); u.balance=100; u.rewards=[{id:5,name:'Ice cream',cost:30,desc:''}]; save(); updateUI(); });
relay.sent.length=0; await p.evaluate(()=>reqRedeem(5)); await p.waitForTimeout(1500); ok(relay.sent.length===2,'redeem emailed to both ('+relay.sent.length+')');
ok(!errs.length,'no page errors '+errs.join('|'));
console.log(`qa13: ${pass} passed, ${fail} failed`); await b.close();
