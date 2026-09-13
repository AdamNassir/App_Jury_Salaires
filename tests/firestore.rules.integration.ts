import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where } from 'firebase/firestore';
import express from 'express';
import { installCampaignApi } from '../server/campaignApi';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps } from 'firebase-admin/app';

const projectId = 'demo-jury-ll';
let env: RulesTestEnvironment, server: ReturnType<express.Express['listen']>, base: string;
let adminToken: string, userToken: string;
const call = async (route: string, body: unknown, token = adminToken) => {
 const response = await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
 return {status:response.status,data:await response.json()};
};
const sources = [
 {kind:'profiles',file:'Profil.csv',sheet:'Profil',rows:[['Id_Profil','Prenom_Profil','Nom_Profil','Email_Profil','Matricule_Profil'],['p1','Alice','Test','alice@example.com','001'],['p2','Bob','Test','bob@example.com','002']]},
 {kind:'rh',file:'RH.csv',sheet:'RH',rows:[['Id_Profil','Titre au 30/06','Salaire au 30/06','TJ vendu (01/07)'],['p1','Senior','50000','650']]}
];
before(async()=>{
 assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Run through npm run test:emulators.');
 process.env.FIREBASE_PROJECT_ID=projectId; process.env.ADMIN_EMAILS='admin@example.com';
 env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}});
 await env.clearFirestore();
 if(!getApps().length)initializeApp({projectId});
 const app=express(); app.use(express.json());installCampaignApi(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.on('listening',r));base=`http://127.0.0.1:${(server.address() as any).port}`;
 const token=async(uid:string,email:string)=>{
   await getAuth().createUser({uid,email,emailVerified:true,password:'Local-test-only-123!'});
   const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Local-test-only-123!',returnSecureToken:true})});return (await r.json()).idToken;
 };
 adminToken=await token('admin-user','admin@example.com');userToken=await token('alice-user','alice@example.com');
 assert.ok(adminToken);assert.ok(userToken);
 assert.equal((await call('/api/session',{})).status,200);
});
after(async()=>{await env?.cleanup();if(server) await new Promise<void>(r=>server.close(()=>r()));});

test('APIs require authentication and administrator authority',async()=>{
 assert.equal((await call('/api/import/preview',{},'')).status,401);
 assert.equal((await call('/api/import/preview',{},userToken)).status,403);
});
test('Preview writes nothing; apply creates profiles, campaign and only RH participants',async()=>{
 const input={year:2027,mode:'NEW',tables:sources};const preview=await call('/api/import/preview',input);assert.equal(preview.status,200);assert.deepEqual(preview.data.errors,[]);
 assert.equal((await getFirestore().collection('profiles').get()).size,1); // bootstrap administrator only
 const result=await call('/api/import/apply',{...input,token:preview.data.token});assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal((await getFirestore().collection('participants').get()).size,1);
 assert.equal((await getFirestore().doc('campaigns/campaign_2027').get()).data().status,'OUVERTE');
 const login=await call('/api/session',{},userToken);assert.equal(login.status,200);assert.equal(login.data.profileId,'p1');
});
test('Unchanged imports are idempotent and old/new years coexist',async()=>{
 const repeat=await call('/api/import/preview',{year:2027,mode:'HISTORY',tables:sources});assert.equal(repeat.data.changes.length,0,JSON.stringify(repeat.data.changes));
 const input={year:2025,mode:'HISTORY',tables:sources};const p=await call('/api/import/preview',input);assert.equal((await call('/api/import/apply',{...input,token:p.data.token})).status,200);
 assert.equal((await getFirestore().collection('dossiers').get()).size,2);
});
test('Stale previews cannot overwrite a concurrent edit',async()=>{
 const input={year:2027,mode:'HISTORY',tables:sources};const p=await call('/api/import/preview',input);
 await getFirestore().doc('dossiers/p1~2027').update({annualReport:{synthesis:'Concurrent edit'}});
 assert.equal((await call('/api/import/apply',{...input,token:p.data.token})).status,409);
});
test('Self-service evaluator creates separate relationships and cannot impersonate another author',async()=>{
 const baseEval={year:2027,candidateId:'p1',type:'Auto_Evaluation',client:'Client',project:'Project',targetTJMin:600,targetTJMax:700,confidenceIndex:8,justification:'Justification',validated:true};
 const a=await call('/api/evaluations/save',{...baseEval,consultantId:'p2'},userToken);assert.equal(a.status,200,JSON.stringify(a.data));
 assert.equal((await getFirestore().doc(`evaluations/${a.data.id}`).get()).data().consultantId,'p1');
 const b=await call('/api/evaluations/save',{...baseEval,project:'Other project'},userToken);assert.equal(b.status,200);assert.notEqual(a.data.id,b.data.id);
 assert.equal((await call('/api/evaluations/save',{...baseEval,type:'Coach'},userToken)).status,400);
});
test('Rules prevent role escalation, other salary reads and RH snapshot modification',async()=>{
 const alice=env.authenticatedContext('alice-user',{email:'alice@example.com',email_verified:true}).firestore();
 await assertFails(updateDoc(doc(alice,'users','alice-user'),{roles:['ADMIN']}));
 await assertSucceeds(getDoc(doc(alice,'dossiers','p1~2027')));
 await assertFails(updateDoc(doc(alice,'dossiers','p1~2027'),{rhSnapshot:{currentSalary:1}}));
 await assertFails(updateDoc(doc(alice,'dossiers','p1~2027'),{juryDecision:{amount:1}}));
 await assertSucceeds(updateDoc(doc(alice,'dossiers','p1~2027'),{annualReport:{synthesis:'My report'}}));
 await assertFails(getDocs(query(collection(alice,'dossiers'),where('campaignYear','==',2027))));
 await assertSucceeds(getDocs(query(collection(alice,'dossiers'),where('campaignYear','==',2027),where('candidateId','==','p1'))));
 await assertFails(setDoc(doc(alice,'campaigns','campaign_2030'),{year:2030}));
});
test('Closed campaigns prevent both direct dossier writes and evaluation API writes',async()=>{
 assert.equal((await call('/api/campaign/status',{year:2027,status:'CLÔTURÉE'})).status,200);
 const alice=env.authenticatedContext('alice-user',{email:'alice@example.com',email_verified:true}).firestore();
 await assertFails(updateDoc(doc(alice,'dossiers','p1~2027'),{annualReport:{synthesis:'Forbidden'}}));
 const result=await call('/api/evaluations/save',{year:2027,candidateId:'p1',type:'Auto_Evaluation',client:'C',project:'P',targetTJMin:1,targetTJMax:2,confidenceIndex:1},userToken);assert.equal(result.status,409);
 const input={year:2027,mode:'HISTORY',tables:sources};const p=await call('/api/import/preview',input);assert.equal((await call('/api/import/apply',{...input,token:p.data.token})).status,200);
 assert.equal((await getFirestore().doc('campaigns/campaign_2027').get()).data().status,'CLÔTURÉE');
});


test('Recovery refuses active imports and resumes an interrupted closed campaign',async()=>{
 const db=getFirestore();await db.doc('_system/importLock').set({runId:'interrupted',status:'RUNNING',heartbeat:new Date().toISOString()});
 await db.doc('importRuns/interrupted').set({status:'RUNNING',previousStatuses:{campaign_2027:'CLÔTURÉE'}});
 await db.doc('campaigns/campaign_2027').update({status:'EN_PRÉPARATION',importState:'RUNNING',importRunId:'interrupted'});
 assert.equal((await call('/api/import/recover',{})).status,409);
 await db.doc('_system/importLock').update({heartbeat:new Date(Date.now()-16*60*1000).toISOString()});assert.equal((await call('/api/import/recover',{})).status,200);
 const input={year:2027,mode:'HISTORY',tables:sources};const p=await call('/api/import/preview',input);const a=await call('/api/import/apply',{...input,token:p.data.token});assert.equal(a.status,200,JSON.stringify(a.data));assert.equal((await db.doc('campaigns/campaign_2027').get()).data().status,'CLÔTURÉE');
});
test('Import crosses batch boundaries and preserves all profiles',async()=>{
 const rows=[sources[0].rows[0],...Array.from({length:205},(_,i)=>[`bulk${i}`,'Bulk',String(i),`bulk${i}@example.com`,`B${i}`])];
 const input={year:2031,mode:'NEW',tables:[{...sources[0],rows},{...sources[1],rows:[sources[1].rows[0],['bulk0','Senior','50000','650']]}]};
 const p=await call('/api/import/preview',input);assert.deepEqual(p.data.errors,[]);const a=await call('/api/import/apply',{...input,token:p.data.token});assert.equal(a.status,200,JSON.stringify(a.data));
 assert.ok((await getFirestore().doc('profiles/bulk204').get()).exists);assert.equal((await getFirestore().collection(`importRuns/${a.data.runId}/before`).get()).size,206);
});
