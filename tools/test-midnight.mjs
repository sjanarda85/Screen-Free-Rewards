// Tests the relay's midnight summary: claim rules, time zones, stale data, quotas, privacy.
import { makeRelay } from './relay-harness.mjs';
let pass=0,fail=0; const ok=(c,m)=>{ if(c) pass++; else { fail++; console.log('FAIL:',m); } };
function family(R,email,name='Sam'){ // verified parent + paired room
  R.handle({action:'verify',email}); const code=R.codeFor(email); const tok=R.handle({action:'confirm',email,code}).token;
  const room=R.handle({action:'pair-start',childName:name}); return {tok,A:{roomId:room.roomId,secret:room.secret}};
}
const snap=(date,uid='11',over={})=>({uid,date,name:'Vidyut',age:9,balance:80,pending:5,earned:50,mins:42,scheduled:660,tasks:[{t:'Read <b>',p:30}],open:[{k:'redeem',n:'Movie night',c:40}],...over});
{ const R=makeRelay(); const {tok,A}=family(R,'p1@example.com'); const sync=o=>R.handle({action:'sync',...A,...o});
  R.setNow('2026-10-17T20:00:00Z');
  ok(sync({tz:'Asia/Kolkata',snaps:[snap('2026-10-17')],to:[{e:'p1@example.com',t:tok,n:'Suhas'},{e:'evil@example.com',t:'x'.repeat(64),n:'E'}]}).ok,'sync accepts snapshot');
  const room=JSON.parse(R.props.get('room:'+A.roomId)); ok(room.to.length===1 && room.to[0].e==='p1@example.com','only addresses with a valid token are kept'); ok(room.tz==='Asia/Kolkata','time zone stored');
  ok(sync({tz:'../bad zone',snaps:[{uid:'x',date:'bad'},snap('2026-10-17','a b')]}).ok && JSON.parse(R.props.get('room:'+A.roomId)).tz==='Asia/Kolkata' && Object.keys(JSON.parse(R.props.get('room:'+A.roomId)).snaps).length===1,'bad time zone, date and id ignored');
  R.sent.length=0;
  // 20:00Z is 01:30 on the 18th in Kolkata, so the 17th report is due
  ok(R.env.midnightSummaries()===1 && R.sent.length===1,'report sent for the day that just ended in the family time zone');
  const m=R.sent[0]; ok(m.to==='p1@example.com' && /daily summary: Vidyut, 2026-10-17/.test(m.subject),'subject names child and day'); ok(/bgcolor="#eaf0fb"/.test(m.htmlBody) && /light only/.test(m.htmlBody) && /cid:logo/.test(m.htmlBody),'light blue and grey html with bgcolor and logo'); ok(m.inlineImages && m.inlineImages.logo && m.inlineImages.logo.mime==='image/png','logo is attached inline');
  ok(/Read &lt;b&gt;/.test(m.htmlBody) && !/Read <b>/.test(m.htmlBody),'child text is escaped'); ok(m.attachments&&m.attachments.length===1 && /\.pdf$/.test(m.attachments[0].name),'PDF attached'); ok(/Earned that day: 50/.test(m.body),'text body has numbers');
  ok(R.env.midnightSummaries()===0 && R.sent.length===1,'never sent twice for the same day');
  ok(R.handle({action:'daily-claim',...A,key:'2026-10-17:11'}).claimed===false,'app cannot claim a day the relay already sent');
  R.setNow('2026-10-18T20:00:00Z'); R.sent.length=0;
  ok(R.handle({action:'daily-claim',...A,key:'2026-10-18:11'}).claimed===true,'app claims the next day first');
  ok(R.handle({action:'daily-claim',...A,key:'2026-10-18:11'}).claimed===false,'second claim refused');
  ok(R.env.midnightSummaries()===0 && R.sent.length===0,'relay skips a day the app claimed');
  ok(R.handle({action:'daily-release',...A,key:'2026-10-18:11'}).ok,'release works'); R.sent.length=0; ok(R.env.midnightSummaries()===1 && /latest numbers from 2026-10-17/.test(R.sent[0].htmlBody),'after a release the relay sends, using the last synced numbers');
}
{ // stale data: device did not sync on the day
  const R=makeRelay(); const {tok,A}=family(R,'p2@example.com'); R.setNow('2026-10-17T10:00:00Z');
  R.handle({action:'sync',...A,tz:'UTC',snaps:[snap('2026-10-15')],to:[{e:'p2@example.com',t:tok,n:'P'}]}); R.sent.length=0; R.setNow('2026-10-18T00:30:00Z');
  ok(R.env.midnightSummaries()===1 && /did not sync on this day/.test(R.sent[0].htmlBody) && /2026-10-15/.test(R.sent[0].htmlBody),'stale numbers are labelled with their date');
}
{ // failure gives the claim back; quota
  const R=makeRelay(); const {tok,A}=family(R,'p3@example.com'); R.setNow('2026-10-17T10:00:00Z');
  R.handle({action:'sync',...A,tz:'UTC',snaps:[snap('2026-10-17'),snap('2026-10-17','22',{name:'Neel'})],to:[{e:'p3@example.com',t:tok,n:'P'}]}); R.sent.length=0; R.setNow('2026-10-18T00:10:00Z');
  ok(R.env.midnightSummaries()===2 && R.sent.map(x=>/Vidyut|Neel/.exec(x.subject)[0]).sort().join()==='Neel,Vidyut','one report per child');
  const R2=makeRelay(); const f=family(R2,'p4@example.com'); R2.setNow('2026-10-17T10:00:00Z'); R2.handle({action:'sync',...f.A,tz:'UTC',snaps:[snap('2026-10-17')],to:[{e:'p4@example.com',t:f.tok,n:'P'}]}); R2.setNow('2026-10-18T00:10:00Z');
  const orig=R2.env.MailApp.sendEmail; R2.env.MailApp.sendEmail=()=>{ throw new Error('quota'); }; ok(R2.env.midnightSummaries()===0,'a failed send reports nothing sent');
  R2.env.MailApp.sendEmail=orig; R2.sent.length=0; ok(R2.env.midnightSummaries()===1,'the claim was given back, so the next hourly run retries');
}
{ // before local midnight nothing is due; room without parents or snapshots is skipped; trigger install
  const R=makeRelay(); const {tok,A}=family(R,'p5@example.com'); R.setNow('2026-10-17T10:00:00Z');
  R.handle({action:'sync',...A,tz:'UTC',snaps:[snap('2026-10-17')],to:[{e:'p5@example.com',t:tok,n:'P'}]}); R.sent.length=0;
  ok(R.env.midnightSummaries()===0 && R.sent.length===0,'same day: nothing due yet (yesterday has no data)');
  const R3=makeRelay(); const g=family(R3,'p6@example.com'); R3.setNow('2026-10-18T01:00:00Z'); R3.sent.length=0; ok(R3.env.midnightSummaries()===0,'room with no snapshot is skipped');
  R.env.installMidnightTrigger(); R.env.installMidnightTrigger(); ok(R.env.ScriptApp.getProjectTriggers().length===1 && R.env.ScriptApp.getProjectTriggers()[0].hours===1,'trigger installed once, hourly');
  ok(R.handle({action:'daily-claim',...A,key:'bad'}).error==='bad key' && R.handle({action:'daily-claim',roomId:A.roomId,secret:'x',key:'2026-10-17:1'}).error==='not paired','claim validates key and secret');
  const size=R.props.get('room:'+A.roomId).length; ok(size<8500,'room size '+size);
  ok(R.handle({action:'unpair',...A}).ok && !R.props.has('sent:'+A.roomId) && !R.props.has('room:'+A.roomId),'unpair removes room and sent record');
}
{ // logo on ordinary emails: only a real small PNG is accepted
  const R=makeRelay(); R.handle({action:'verify',email:'q@example.com'}); const tok=R.handle({action:'confirm',email:'q@example.com',code:R.codeFor('q@example.com')}).token;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]).toString('base64');
  R.sent.length=0; ok(R.handle({to:'q@example.com',subject:'s',message:'m',htmlBody:'<img src="cid:logo">',logoBase64:png,token:tok}).ok && R.sent[0].inlineImages && R.sent[0].inlineImages.logo.name==='logo.png','valid PNG logo is attached');
  R.sent.length=0; R.handle({to:'q@example.com',subject:'s',message:'m',htmlBody:'x',logoBase64:Buffer.from('<script>alert(1)</script>').toString('base64'),token:tok}); ok(!R.sent[0].inlineImages,'non-PNG data is ignored, mail still sends');
  R.sent.length=0; R.handle({to:'q@example.com',subject:'s',message:'m',htmlBody:'x',logoBase64:Buffer.alloc(30000,1).toString('base64'),token:tok}); ok(!R.sent[0].inlineImages,'oversize logo ignored');
  R.sent.length=0; R.handle({to:'q@example.com',subject:'s',message:'m',logoBase64:png,token:tok}); ok(!R.sent[0].inlineImages,'no logo without an html body');
}
console.log(`midnight tests passed ${pass}, failed ${fail}`); process.exit(fail?1:0);
