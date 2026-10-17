// Live approvals through the relay: queue, deliver, acknowledge, limits, hot flag.
import { makeRelay } from './relay-harness.mjs';
let pass=0,fail=0; const ok=(c,m)=>{ if(c) pass++; else { fail++; console.log('FAIL:',m); } };
const R=makeRelay(); const room=R.handle({action:'pair-start',childName:'Vidyut'}); const A={roomId:room.roomId,secret:room.secret};
const add=(cmd,o={})=>R.handle({action:'cmd-add',...A,cmd,...o});
ok(add({type:'approve-points',uid:'11',amount:12}).ok,'parent can queue an approval');
ok(R.handle({action:'cmd-add',roomId:A.roomId,secret:'x',cmd:{type:'approve-points',uid:'11',amount:1}}).error==='not paired','needs the room secret');
ok(add({type:'delete-everything',uid:'11'}).error==='unknown command','unknown commands refused'); ok(add({type:'approve-points',uid:'a b',amount:1}).error==='bad child','bad child id refused'); ok(add({type:'decide',uid:'11',reqId:'x y',ok:true}).error==='bad request','bad request id refused');
ok(add({type:'decide',uid:'11',reqId:'778',ok:true,cost:90}).ok,'decision queued');
let s=R.handle({action:'sync',...A}); ok(s.ok && s.cmds.length===2 && s.cmds[0].type==='approve-points' && s.cmds[0].amount===12 && s.cmds[1].cost===90 && s.cmds[1].ok===true,'child receives both commands on its next sync');
ok(R.handle({action:'sync',...A}).cmds.length===2,'commands stay until acknowledged');
s=R.handle({action:'sync',...A,ack:[s.cmds[0].id]}); ok(s.cmds.length===1 && s.cmds[0].type==='decide','acknowledged command is removed');
s=R.handle({action:'sync',...A,ack:[s.cmds[0].id]}); ok(s.cmds.length===0,'queue empty after the second ack');
const huge=add({type:'approve-points',uid:'11',amount:99999999}); const c=R.handle({action:'sync',...A}).cmds; ok(huge.ok && c[0].amount===100000,'amount is capped'); R.handle({action:'sync',...A,ack:c.map(x=>x.id)});
for(let i=0;i<12;i++) add({type:'approve-points',uid:'11',amount:1}); ok(add({type:'approve-points',uid:'11',amount:1}).error==='too many waiting approvals','at most 12 waiting approvals');
R.handle({action:'sync',...A,ack:R.handle({action:'sync',...A}).cmds.map(x=>x.id)});
R.advance(11*60000); add({type:'approve-points',uid:'11',amount:5}); R.advance(11*60000); ok(R.handle({action:'sync',...A}).cmds.length===0,'unanswered approvals expire after 10 minutes');
// hot flag: set by parent activity, expires
const R2=makeRelay(); const r2=R2.handle({action:'pair-start',childName:'K'}); const B={roomId:r2.roomId,secret:r2.secret};
ok(R2.handle({action:'sync',...B}).hot===false,'not hot when no parent is watching'); R2.handle({action:'sync-pull',...B}); ok(R2.handle({action:'sync',...B}).hot===true,'hot while a parent phone is watching'); R2.advance(4*60000); ok(R2.handle({action:'sync',...B}).hot===false,'cools down after 3 minutes');
// kids snapshot for the parent phone
R2.handle({action:'sync',...B,snaps:[{uid:'5',date:'2026-10-17',name:'Vidyut',age:9,balance:50,pending:12,earned:50,mins:0,scheduled:660,tasks:[],open:[{i:'777',k:'ask',n:'Extra',c:0}],val:62.5,rate:2.5}]});
const pull=R2.handle({action:'sync-pull',...B}); ok(pull.kids.length===1 && pull.kids[0].pending===12 && pull.kids[0].open[0].i==='777' && pull.kids[0].val===62.5 && pull.kids[0].rate===2.5,'parent phone gets balance, waiting points, requests with ids, INR value and rate');
ok(R2.handle({action:'unpair',...B}).ok && !R2.props.has('cmds:'+B.roomId),'unpair clears the queue');
console.log(`live tests passed ${pass}, failed ${fail}`); process.exit(fail?1:0);
