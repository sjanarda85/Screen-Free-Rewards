// No code, no Verify: child's Send to both parents emails both parents at once on a fresh device
import { chromium } from 'playwright-core'; import { makeRelay } from './relay-harness.mjs';
const R='file:///home/user/Screen-Free-Rewards/index.html', LINK='https://script.google.com/macros/s/AKfycbTESTLINK123/exec';
let pass=0,fail=0; const ok=(c,m)=>{ if(c) pass++; else {fail++; console.log('FAIL:',m);} };
const relay=makeRelay(); const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage(); const dlg=[]; p.on('dialog',d=>{ dlg.push(d.type()+':'+d.message()); d.accept(''); });
await p.route('https://script.google.com/**',async r=>{ const o=JSON.parse(r.request().postData()||'{}'); await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(relay.handle(o))}); });
await p.goto(R+'#mail='+encodeURIComponent(LINK)); await p.waitForTimeout(300);
for(const [id,v] of [['sPName','Suhas'],['sPEmail','suhas85@gmail.com'],['sPName2','Divya'],['sPEmail2','divyaa.menon.md@gmail.com'],['sPPin','1357'],['sChild','Vidyut'],['sAge','9'],['sCPin','2468']]) await p.fill('#'+id,v);
await p.click('#doSetup'); await p.waitForTimeout(1500); await p.click('#pairModalDone').catch(()=>{});
ok(!dlg.some(x=>/prompt/.test(x)),'no code prompt during setup: '+dlg.join('|'));
// wipe tokens to mimic a fresh/other device: sending must still work with no typing
await p.evaluate(()=>{ state.parent.tokens={}; save(); });
relay.sent.length=0; await p.click('#askBtn'); await p.fill('#askTitle','Ten more minutes'); await p.click('#sendAsk'); await p.waitForTimeout(2500);
const to=relay.sent.map(m=>m.to); ok(to.length===2&&to.includes('suhas85@gmail.com')&&to.includes('divyaa.menon.md@gmail.com'),'both parents emailed at once: '+to);
ok(await p.evaluate(()=>pendingMailCount())===0,'nothing queued'); ok(/emailed to both/i.test(await p.textContent('#toast')),'toast: '+await p.textContent('#toast'));
ok(relay.sent.every(m=>/Not you\?/.test(m.body)),'every mail says why it arrived');
ok(!dlg.some(x=>/prompt/.test(x)),'no prompt at send time');
console.log(`qa14: ${pass} passed, ${fail} failed`); await b.close();
