import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildImportPlan, parseCsv, numberValue, dateValue, type SourceTable, type ImportRequest, type ImportState } from '../src/services/importModel';
import { readSourceFile } from '../src/services/sourceFiles';
const table = (kind: SourceTable['kind'], rows: string[][]): SourceTable => ({ kind, rows, file: `${kind}.csv`, sheet: kind });
const profiles = table('profiles', [['Id_Profil','Prenom_Profil','Nom_Profil','Matricule_Profil','Email_Profil','Id_Profil_Boond'],['p1','Alice','Martin','001','alice@example.com','b1'],['p2','Paul','Durand','002','paul@example.com','b2']]);
const rh = table('rh', [['Matricule','Prénom','Nom','Nouveau\nTitre','TJ\nvendu (01/07)','Salaire au 30/06/2021 (TJ salaire)'],['001','Alice','Martin','Senior','650,5','45 000,50']]);
const empty: ImportState = { profiles: [], dossiers: [], evaluations: [] };
const request = (tables: SourceTable[], year=2027): ImportRequest => ({ year, mode:'NEW', tables });
test('CSV preserves quoted newlines, escaped quotes, BOM and identifiers', () => assert.deepEqual(parseCsv('\uFEFFId;Nom\r\n001;"A;B\nC ""D"""\r\n'),[['Id','Nom'],['001','A;B\nC "D"']]));
test('French amounts and zeros are not defaults', () => { assert.equal(numberValue('45 000,50 €'),45000.5); assert.equal(numberValue('1,5'),1.5); assert.equal(numberValue('0 %'),0); assert.equal(numberValue(''),undefined); assert.throws(()=>numberValue('abc')); });
test('Date parsing rejects impossible dates and preserves missing values',()=>{assert.equal(dateValue('01/07/2026'),'2026-07-01');assert.equal(dateValue(''),undefined);assert.throws(()=>dateValue('31/02/2026'));});
test('RH identifies campaign participants independently from the directory',()=>{const p=buildImportPlan(request([profiles,rh]),empty);assert.deepEqual(p.errors,[]);assert.equal(p.profiles.length,2);assert.equal(p.dossiers.length,1);assert.equal(p.dossiers[0].candidateId,'p1');assert.equal(p.dossiers[0].rhSnapshot.currentSalary,45000.5);assert.equal(p.dossiers[0].rhSnapshot.seniorityYears,undefined);});
test('Boond IDs resolve through the LOV; no arbitrary experience value',()=>{const resources=table('resources',[['Id_Ressource','Id_Annees_Experience_A_Embauche'],['b1','123']]);const values=table('values',[['Id_Valeur','Libelle_Valeur'],['123','1,5']]);const p=buildImportPlan(request([profiles,resources,values,rh]),empty);assert.deepEqual(p.errors,[]);assert.equal(p.profiles[0].experienceAtHire,1.5);assert.equal(p.dossiers[0].rhSnapshot.experienceYears,undefined);const missing=buildImportPlan(request([profiles,resources,rh]),empty);assert.ok(missing.errors.some(e=>e.includes('123')));});
test('Experience derives only from source seniority and resolved experience at hire',()=>{const resources=table('resources',[['Id_Ressource','Annees_Experience_A_Embauche'],['b1','1,5']]);const h=table('rh',[['Id_Profil','Ancienneté LL'],['p1','2,25']]);const p=buildImportPlan(request([profiles,resources,h]),empty);assert.equal(p.dossiers[0].rhSnapshot.experienceYears,3.75);});
test('Reimport is idempotent; another campaign keeps its own snapshot',()=>{const first=buildImportPlan(request([profiles,rh],2025),empty);const state={profiles:first.profiles,dossiers:first.dossiers,evaluations:[]};const again=buildImportPlan(request([profiles,rh],2025),state);assert.deepEqual(again.changes,[]);const next=buildImportPlan(request([profiles,rh],2027),state);assert.equal(next.dossiers.length,1);assert.equal(next.dossiers[0].campaignYear,2027);assert.equal(state.dossiers[0].campaignYear,2025);assert.equal(state.dossiers[0].rhSnapshot.currentSalary,45000.5);});
test('Ambiguous identities and conflicting RH rows block import',()=>{const duplicate=table('profiles',[...profiles.rows,['p3','Alice','Martin','001','other@example.com','']]);const p=buildImportPlan(request([duplicate,rh]),empty);assert.ok(p.errors.length>0);const h=table('rh',[...rh.rows,['001','Alice','Martin','Senior','700','60000']]);assert.ok(buildImportPlan(request([profiles,h]),empty).errors.some(e=>e.includes('contradictoires')));});
test('Blank historical fields never overwrite existing decisions, including second round and zero',()=>{const first=buildImportPlan(request([profiles,rh]),empty);first.dossiers[0].juryDecision={amount:50000,investmentPercentage:0,secondRoundFeedback:'Conserver'} as any;const p=buildImportPlan(request([profiles,rh]),{profiles:first.profiles,dossiers:first.dossiers,evaluations:[]});assert.equal(p.dossiers.length,0);assert.equal(first.dossiers[0].juryDecision.secondRoundFeedback,'Conserver');});
test('Multiple evaluation relationships for the same pair survive',()=>{const e=table('evaluations',[['Id_Profil','Id_Profil_Evaluateur','Type_Evaluation','Client','Projet','TJ Cible Min','TJ Cible Max','Indice de confiance'],['p1','p2','Coach Logiclever','C','P1','600','700','0'],['p1','p2','Commerciale','C','P2','650','750','8']]);const p=buildImportPlan(request([profiles,rh,e]),empty);assert.deepEqual(p.errors,[]);assert.equal(p.evaluations.length,2);assert.notEqual(p.evaluations[0].id,p.evaluations[1].id);assert.equal(p.evaluations[0].confidenceIndex,0);assert.equal(p.evaluations[0].validated,false);});
test('Drive requires an explicit candidate and preserves the link',()=>{const d=table('documents',[['Id_Profil','Url_Drive_Evaluation'],['p1','https://drive.google.com/file/d/example/view']]);const p=buildImportPlan(request([profiles,rh,d]),empty);assert.deepEqual(p.errors,[]);assert.equal(p.dossiers[0].documents.length,1);});
test('Meteos are joined and date filtered without fabricated ratings',()=>{const m=table('meteos',[['Id_Suivi_Meteo','Id_Consultant_Evalue_App_LL','Date_Meteo','Points_Satisfaction_Consultant_LL'],['m1','p1','01/06/2026','Conserver'],['m2','p1','01/06/2025','Ancienne']]);const p=buildImportPlan({...request([profiles,rh,m],2026),meteoFrom:'2026-01-01',meteoTo:'2026-12-31'},empty);assert.deepEqual(p.errors,[]);assert.equal(p.dossiers[0].clientFeedbacks.length,1);assert.equal(p.dossiers[0].clientFeedbacks[0].consultantSatisfaction,'Conserver');assert.equal(p.dossiers[0].clientFeedbacks[0].clientRating,undefined);});
test('Local reference workbooks can be decoded and mapped without cloud writes',async()=>{
 const tables: SourceTable[]=[];
 for(const name of ['BDD_LL_NEW_DRIVE_test.xlsx','BDD_API_BOOND_NEW_DRIVE_test.xlsx','Analyse_Jury_Salaire_2026_test.xlsx']) tables.push(...(await readSourceFile(new File([readFileSync(`Spreadsheets_used/${name}`)],name),'rh')).filter(t=>t.kind!=='meteos'));
 const p=buildImportPlan(request(tables,2026),empty);
 console.log(JSON.stringify({localWorkbookValidation:{tables:tables.map(t=>({sheet:t.sheet,rows:t.rows.length})),profiles:p.profiles.length,dossiers:p.dossiers.length,errorCount:p.errors.length,examples:p.errors.slice(0,12),warnings:p.warnings.length}}));
 assert.deepEqual(p.errors, []);assert.ok(p.dossiers.length > 50);assert.ok(tables.some(t=>t.kind==='profiles'));assert.ok(tables.some(t=>t.kind==='resources'));assert.ok(tables.some(t=>t.kind==='values'));assert.ok(tables.some(t=>t.kind==='rh'));
});


test('Legacy UID archives retain their IDs and historical salary when linked to APP_LL', () => {
 const old = { id:'old-doc', candidateId:'old-uid', candidateName:'Alice Martin', campaignYear:2025, status:'VALIDE', annualReport:{currentSalary:40000,synthesis:'Archive'}, documents:[] } as any;
 const p=buildImportPlan(request([profiles,rh]),{...empty,dossiers:[old],legacyUsers:[{id:'old-uid',email:'alice@example.com'} as any]});
 assert.deepEqual(p.errors,[]);assert.deepEqual(p.accountLinks,[{uid:'old-uid',profileId:'p1'}]);
 const migrated=p.dossiers.find(d=>d.id==='old-doc')!;assert.equal(migrated.candidateId,'p1');assert.equal(migrated.rhSnapshot.currentSalary,40000);assert.equal(migrated.status,'VALIDE');assert.equal(migrated.annualReport.synthesis,'Archive');
 assert.equal(old.candidateId,'old-uid');
});
test('Reimport preserves evaluation validation and text when optional fields are blank', () => {
 const rows=[['Id_Profil','Id_Profil_Evaluateur','Type_Evaluation','Client','Projet'],['p1','p2','Coach Logiclever','C','P']];
 const first=buildImportPlan(request([profiles,rh,table('evaluations',rows)]),empty);first.evaluations[0].validated=true;first.evaluations[0].justification='Keep';
 const next=buildImportPlan(request([profiles,rh,table('evaluations',rows)]),{profiles:first.profiles,dossiers:first.dossiers,evaluations:first.evaluations});assert.deepEqual(next.errors,[]);assert.equal(next.evaluations.length,0);
});
test('Excel percentage cell formats preserve percentage units', async () => {
 const excel=await import('exceljs');const book=new excel.default.Workbook();const sheet=book.addWorksheet('Deliberation');sheet.addRow(['Id_Profil','% Investissement']);sheet.addRow(['p1',0.6]);sheet.getCell('B2').numFmt='0%';
 const bytes=await book.xlsx.writeBuffer();const tables=await readSourceFile(new File([bytes as any],'percent.xlsx'),'rh');assert.equal(tables[0].rows[1][1],'60');
});
