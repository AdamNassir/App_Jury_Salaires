import type { UserProfile, Dossier, ConsultantFeedback, ClientFeedback } from '../types';

export type TableKind = 'profiles' | 'resources' | 'values' | 'rh' | 'evaluations' | 'documents' | 'meteos';
export interface SourceTable { kind: TableKind; file: string; sheet: string; rows: string[][] }
export interface ImportRequest { year: number; mode: 'NEW' | 'HISTORY'; tables: SourceTable[]; meteoFrom?: string; meteoTo?: string }
export interface ImportState { profiles: UserProfile[]; dossiers: Dossier[]; evaluations: ConsultantFeedback[]; legacyUsers?: (UserProfile & { profileId?: string })[] }
export interface ImportPlan { profiles: UserProfile[]; dossiers: Dossier[]; evaluations: ConsultantFeedback[]; accountLinks: { uid: string; profileId: string }[]; errors: string[]; warnings: string[]; changes: { entity: string; id: string; action: string; fields: string[] }[] }
export const evaluationTypes = ['Auto_Evaluation', 'Commerciale', 'Encadrement', 'Meteo_Client', 'Coach Logiclever', 'Collègue_Mission'] as const;
export const normalize = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_\s]+/g, ' ').trim();
export const stableId = (...parts: unknown[]) => parts.map(p => encodeURIComponent(String(p ?? '').trim()).replace(/~/g, '%7E')).join('~');
export const dossierId = (profile: string, year: number) => stableId(profile, year);

// CSV state machine: quoted separators, embedded newlines, escaped quotes, BOM and CRLF.
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0];
  const delimiter = [';', ',', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || !field) quoted = !quoted;
      else throw new Error('Guillemet inattendu dans le CSV.');
    } else if (!quoted && (c === delimiter || c === '\n' || c === '\r')) {
      row.push(field); field = '';
      if (c !== delimiter) { if (row.some(v => v.trim())) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else field += c;
  }
  if (quoted) throw new Error('Champ CSV entre guillemets non terminé.');
  row.push(field); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

export function numberValue(value: string): number | undefined {
  if (!value?.trim()) return undefined;
  let clean = value.trim().replace(/[\s\u00a0\u202f€%]/g, '');
  if (clean.includes(',')) { if (clean.includes('.')) clean = clean.replace(/\./g, ''); clean = clean.replace(',', '.'); }
  if (!/^-?\d+(\.\d+)?$/.test(clean)) throw new Error(`Nombre invalide : « ${value} »`);
  const result = Number(clean); if (!Number.isFinite(result)) throw new Error('Nombre hors limites.');
  return result;
}
export function dateValue(value: string): string | undefined {
  if (!value?.trim()) return undefined;
  const s = value.trim(); const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString().slice(0, 10) !== iso) throw new Error(`Date invalide : « ${value} »`);
  return iso;
}
export function evaluationType(value: string) {
  const key = normalize(value);
  const match = evaluationTypes.find(t => normalize(t) === key)
    || (['meteo client', 'météo client'].includes(key) ? 'Meteo_Client' : undefined)
    || (['collegue mission', 'collegue en mission', 'collegue mission'].includes(key) ? 'Collègue_Mission' : undefined);
  if (!match) throw new Error(`Type d’évaluation inconnu : « ${value} ». Coach Logiclever est un type unique.`);
  return match;
}
function grade(value: string): any {
  if (!value) return undefined;
  const v = normalize(value).replace(/^\d+\s*[-–]\s*/, '');
  const g = ['Junior', 'Confirmé', 'Senior', 'Expert'].find(g => normalize(g) === v);
  if (!g) throw new Error(`Grade inconnu : « ${value} »`);
  return g;
}
function compact<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
type RecordRow = { line: number; get: (...headers: string[]) => string };
function records(t: SourceTable): RecordRow[] {
  const markers: Record<TableKind, string[]> = { profiles: ['id profil'], resources: ['id ressource'], values: ['id valeur'], rh: ['matricule', 'id profil'], evaluations: ['id profil', 'matricule'], documents: ['url drive evaluation'], meteos: ['id suivi meteo'] };
  const at = t.rows.findIndex(r => r.some(v => markers[t.kind].includes(normalize(v))));
  if (at < 0) throw new Error(`${t.file} / ${t.sheet} : en-tête ${markers[t.kind].join(' ou ')} introuvable.`);
  const headers = t.rows[at].map(normalize);
  return t.rows.slice(at + 1).map((row, index) => ({ line: at + index + 2, get: (...names: string[]) => {
    const indices = headers.flatMap((h, i) => names.some(n => normalize(n) === h) ? [i] : []);
    const found = indices.map(i => String(row[i] ?? '').trim()).filter(Boolean);
    if (new Set(found).size > 1) throw new Error(`Colonnes ambiguës : ${names.join(' / ')}`);
    return found[0] || '';
  }})).filter((_, i) => t.rows[at + 1 + i].some(v => String(v).trim()));
}

export function buildImportPlan(request: ImportRequest, existing: ImportState): ImportPlan {
  const plan: ImportPlan = { profiles: [], dossiers: [], evaluations: [], accountLinks: [], errors: [], warnings: [], changes: [] };
  if (!Number.isInteger(request.year) || request.year < 2000 || request.year > 2100) { plan.errors.push('Année invalide.'); return plan; }
  const profiles = new Map(existing.profiles.map(p => [p.id, compact(p)]));
  const dossiers = new Map(existing.dossiers.map(d => [d.id, compact(d)]));
  const touchedProfiles = new Set<string>(), touchedDossiers = new Set<string>();
  const results = new Map<string, ConsultantFeedback>();
  const seen = new Map<string, string>();
  const each = (kind: TableKind, fn: (row: RecordRow, table: SourceTable) => void) => request.tables.filter(t => t.kind === kind).forEach(t => {
    try { for (const row of records(t)) { try { fn(row, t); } catch (e) { plan.errors.push(`${t.file} / ${t.sheet}, ligne ${row.line} : ${(e as Error).message}`); } } }
    catch (e) { plan.errors.push((e as Error).message); }
  });
  const unique = (kind: string, key: string, value: unknown) => {
    const k = kind + ':' + key, serialized = JSON.stringify(value);
    if (seen.has(k) && seen.get(k) !== serialized) throw new Error(`Deux lignes contradictoires pour ${kind} ${key}.`);
    seen.set(k, serialized);
  };
  const resolve = (r: RecordRow, evaluator = false) => {
    const id = evaluator ? r.get('Id_Profil_Evaluateur', 'Id_Profil_Eveluateur') : r.get('Id_Profil', 'Id_Profil_Consultant_Evalue', 'Id_Consultant_Evalue_App_LL');
    if (id) { if (!profiles.has(id)) throw new Error(`Id_Profil inconnu : ${id}`); return profiles.get(id)!; }
    if (evaluator) throw new Error('Id_Profil_Evaluateur manquant.');
    const mat = r.get('Matricule', 'Matricule_Profil');
    const first = r.get('Prénom', 'Prenom_Profil'), last = r.get('Nom', 'Nom_Profil');
    const candidates = [...profiles.values()].filter(p => mat ? normalize(p.matricule) === normalize(mat) : first && last && normalize(p.firstName) === normalize(first) && normalize(p.lastName) === normalize(last));
    if (candidates.length !== 1) throw new Error(`Profil ${mat || `${first} ${last}`} : ${candidates.length} correspondance(s). Fournir un Id_Profil ou corriger le référentiel.`);
    if (mat && ((first && normalize(candidates[0].firstName) !== normalize(first)) || (last && normalize(candidates[0].lastName) !== normalize(last)))) plan.warnings.push(`Matricule ${mat} : le nom RH « ${first} ${last} » diffère du référentiel. L’Id_Profil unique ${candidates[0].id} et le nom du référentiel sont utilisés.`);
    return candidates[0];
  };
  const getDossier = (p: UserProfile) => {
    const matches = [...dossiers.values()].filter(d => d.candidateId === p.id && d.campaignYear === request.year);
    if (matches.length > 1) throw new Error(`Plusieurs dossiers existants pour ${p.id} / ${request.year}. Résoudre le conflit avant import.`);
    const d = matches[0] || { id: dossierId(p.id, request.year), candidateId: p.id, candidateName: p.displayName, candidateEmail: p.email || '', campaignYear: request.year, status: 'OUVERT' as const, assignedConsultantIds: [], consultantFeedbacks: {}, createdAt: null, updatedAt: null };
    dossiers.set(d.id, d); touchedDossiers.add(d.id); return d;
  };
  each('profiles', r => {
    const id = r.get('Id_Profil'); if (!id || id.includes('/')) throw new Error('Id_Profil manquant ou contenant /.');
    const firstName = r.get('Prenom_Profil', 'Prénom'), lastName = r.get('Nom_Profil', 'Nom');
    if (!firstName || !lastName) throw new Error('Prénom et nom obligatoires dans Profil.');
    const email = r.get('Email_Profil', 'Email').toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email invalide.');
    const patch = compact({ id, profileId: id, firstName, lastName, displayName: `${firstName} ${lastName}`, ...(email ? { email } : {}), matricule: r.get('Matricule_Profil', 'Matricule') || undefined, profileType: r.get('Type_Profil') || undefined, boondId: r.get('Id_Profil_Boond') || undefined, entryDate: dateValue(r.get('Date_Embauche', 'Date entrée LL')), expertGradeDate: dateValue(r.get('Date_Expert', 'Date de passage au grade expert (si concerné)')) });
    unique('Profil', id, patch); profiles.set(id, { roles: ['EVALUATOR'], email: '', createdAt: null, ...profiles.get(id), ...patch }); touchedProfiles.add(id);
  });
  // Legacy accounts used their Firebase UID (or an auto-ID) as the business identity.
  // Reconcile only an unambiguous source email/matricule, never just a guessed name.
  for (const legacy of existing.legacyUsers || []) {
    if (legacy.profileId && !legacy.profileId.startsWith('admin-')) continue;
    const matches = [...profiles.values()].filter(p => !p.id.startsWith('admin-') && ((legacy.email && p.email && normalize(legacy.email) === normalize(p.email)) || (legacy.matricule && p.matricule && normalize(legacy.matricule) === normalize(p.matricule))));
    if (matches.length > 1) { plan.errors.push(`Ancien compte ${legacy.id} : rapprochement APP_LL ambigu.`); continue; }
    if (!matches.length) { if (existing.dossiers.some(d => d.candidateId === legacy.id)) plan.warnings.push(`Ancien profil ${legacy.id} sans correspondance APP_LL : ses archives restent intactes, mais non rattachées.`); continue; }
    const p = matches[0]; plan.accountLinks.push({ uid: legacy.id, profileId: p.id });
    for (const d of dossiers.values()) if (d.candidateId === legacy.id && d.candidateId !== p.id) {
      d.candidateId = p.id;
      d.rhSnapshot = { id: p.id, displayName: d.candidateName, currentGrade: d.annualReport?.currentGrade, currentSalary: d.annualReport?.currentSalary, currentTJM: d.annualReport?.currentTJM, ...d.rhSnapshot };
      touchedDossiers.add(d.id);
      plan.warnings.push(`Archive ${d.campaignYear} / ${d.candidateName} : rattachement à ${p.id}, sans modifier son contenu.`);
    }
  }
  const values = new Map<string, string>();
  each('values', r => {
    // ID_Boond is only unique within Nom_Valeur. Other LOV families reuse 0, 1, ...
    const family = normalize(r.get('Nom_Valeur'));
    if (family && family !== normalize('Annees_Experience_A_Embauche')) return;
    const id = r.get('ID_Boond') || r.get('Id_Valeur'), value = r.get('Libelle_Valeur');
    if (!id) throw new Error('ID_Boond / Id_Valeur manquant dans la famille expérience.');
    unique('Valeur Boond expérience', id, value); values.set(id, value);
    const external = r.get('Id_Valeur'); if (external) values.set(external, value);
  });
  each('resources', r => {
    const id = r.get('Id_Ressource'), valId = r.get('Id_Annees_Experience_A_Embauche');
    const linked = [...profiles.values()].filter(p => p.boondId === id);
    if (!linked.length) { plan.warnings.push(`Ressource Boond ${id} sans profil lié : ignorée.`); return; }
    if (linked.length > 1) throw new Error(`Ressource Boond ${id} reliée à plusieurs profils.`);
    const resolved = valId ? values.get(valId) : r.get('Annees_Experience_A_Embauche');
    if (valId && resolved === undefined) throw new Error(`Valeur Boond ${valId} introuvable dans Boond_Liste_Valeur.`);
    const exp = numberValue((resolved || '').replace(/\s*(ans?|années?)\s*$/i, ''));
    if (exp !== undefined) { if (exp < 0) throw new Error('Expérience négative.'); unique('Expérience', linked[0].id, exp); linked[0].experienceAtHire = exp; touchedProfiles.add(linked[0].id); }
    else plan.warnings.push(`${linked[0].displayName} : expérience à l’embauche non renseignée dans Boond.`);
  });
  each('rh', (r, table) => {
    if (!['Id_Profil', 'Matricule', 'Prénom', 'Nom'].some(key => r.get(key))) { plan.warnings.push(`${table.file}, ligne ${r.line} sans identité : ligne de synthèse ignorée.`); return; }
    const p = resolve(r), d = getDossier(p);
    // Only source values: no date of execution, inferred year or invented RH amounts.
    const totalExp = numberValue(r.get('Exp.(année pleine)', 'Exp. (année pleine)', 'Exp.', 'Exp', 'Experience'));
    const seniority = numberValue(r.get('Ancienneté chez LL', 'Ancienneté LL'));
    const snapshot = compact({ id: p.id, displayName: p.displayName, firstName: p.firstName, lastName: p.lastName, matricule: p.matricule, email: p.email, entryDate: dateValue(r.get('Date entrée LL')) || p.entryDate, expertGradeDate: dateValue(r.get('Date de passage au grade expert (si concerné)')) || p.expertGradeDate, experienceAtHire: p.experienceAtHire, seniorityYears: seniority, expertYears: numberValue(r.get('Année en tant qu’expert', "Année en tant qu'expert", 'Ancienneté Expert')), experienceYears: totalExp ?? (seniority !== undefined && p.experienceAtHire !== undefined ? seniority + p.experienceAtHire : undefined), currentGrade: grade(r.get('Titre au 30/06', 'Grade actuel', 'Nouveau Titre')), currentSalary: numberValue(r.get('Salaire au 30/06', ...table.rows.flat().filter(h => /^salaire au 30\/06\/\d{4}/i.test(String(h))))), currentTJM: numberValue(r.get('TJ vendu (01/07)', 'TJ_Vendu (01/07)')) });
    for (const [key, value] of Object.entries(snapshot)) if (typeof value === 'number' && value < 0) throw new Error(`${key} négatif.`);
    unique('RH', p.id, snapshot);
    if (seniority !== undefined && p.experienceAtHire !== undefined) snapshot.experienceYears = seniority + p.experienceAtHire;
    d.rhSnapshot = { ...d.rhSnapshot, ...snapshot };
    d.sourceFiles = [...new Set([...(d.sourceFiles || []), table.file])];
    if (snapshot.seniorityYears === undefined) plan.warnings.push(`${p.displayName} : ancienneté LL absente ; les calculs qui en dépendent seront indisponibles.`);
    const annual = compact({ targetTJM: numberValue(r.get('TJ Cible')), wishedSalary: numberValue(r.get('Salaire souhaité', ...table.rows.flat().filter(h => /^salaire souhait[eé] au /i.test(String(h))))) });
    const decision = compact({ finalGrade: grade(r.get('Nouveau Grade')), amount: numberValue(r.get('Salaire proposé au 01/07')), investmentPercentage: numberValue(r.get('% Investissement', '% Investissement (moyenne attendue à 60)')), missionPercentage: numberValue(r.get('% Mission', '% Mission (Moyenne attendue à 98%)')), maxSalaryIfTJIncreases: numberValue(r.get('Salaire MAX proposé si TJ vendu augmente', 'Salaire MAX proposé si TJ augmente')), maxSalaryIfVenduIncreases: numberValue(r.get("Salaire MAX proposé si TJ vendu augmenté en cours d'année")), whyThisSalary: r.get('Pourquoi ce salaire proposé') || undefined, whatToDoMore: r.get("Ce qu'il faut faire pour avoir plus") || undefined, referentJury: r.get('Référent Jury de salaire') || undefined, consultantFeeling: r.get('Ressenti consultant') || undefined, secondRoundFeedback: r.get('Retour Second tour') || undefined, primeBefore: numberValue(r.get('Prime bureautique ancienneté (avant jury)')), primeAfter: numberValue(r.get('Prime bureautique ancienneté (après jury)')) });
    if (Object.keys(annual).length) d.annualReport = { ...d.annualReport, ...annual } as any;
    if (Object.keys(decision).length) d.juryDecision = { ...d.juryDecision, ...decision } as any;
    for (const key of ['investmentPercentage', 'missionPercentage']) if (decision[key] !== undefined && (decision[key] < 0 || decision[key] > 100)) throw new Error(`${key} doit être compris entre 0 et 100.`);
    if (Object.values(annual).some(v => typeof v === 'number' && v < 0) || Object.values(decision).some(v => typeof v === 'number' && v < 0)) throw new Error('Montant négatif.');
  });
  each('evaluations', r => {
    const p = resolve(r), evaluator = resolve(r, true), d = getDossier(p);
    const type = evaluationType(r.get('Type_Evaluation')), client = r.get('Client'), project = r.get('Projet');
    if (type === 'Auto_Evaluation' && p.id !== evaluator.id) throw new Error('Une auto-évaluation doit référencer la même personne.');
    const id = stableId(request.year, p.id, evaluator.id, client, project, type);
    const min = numberValue(r.get('TJ Cible Min')), max = numberValue(r.get('TJ Cible Max')), confidence = numberValue(r.get('Indice de confiance'));
    if ((min !== undefined && min < 0) || (max !== undefined && max < 0) || (min !== undefined && max !== undefined && min > max)) throw new Error('Fourchette TJ invalide.');
    if (confidence !== undefined && (confidence < 0 || confidence > 10)) throw new Error('Indice de confiance hors de 0–10.');
    const old = existing.evaluations.find(e => e.id === id);
    const patch = compact({ id, candidateId: p.id, campaignYear: request.year, consultantId: evaluator.id, consultantName: evaluator.displayName, type, client, project, targetTJMin: min, targetTJMax: max, justification: r.get('Justification TJ Cible', 'Justication TJ Cible') || undefined, improvementAxes: r.get('Axes pour augmenter le TJ') || undefined, confidenceIndex: confidence, sourceGrade: r.get('Grade') || undefined, sourceTJM: numberValue(r.get('TJ_Vendu (01/07)', 'TJ vendu (01/07)')) });
    const value = { validated: false, updatedAt: null, ...old, ...patch } as ConsultantFeedback;
    unique('Évaluation', id, value); results.set(id, value);
  });
  each('documents', r => { const p = resolve(r), d = getDossier(p), url = r.get('Url_Drive_Evaluation'); const parsed = new URL(url); if (parsed.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(parsed.hostname)) throw new Error('URL Drive HTTPS invalide.'); d.documents = [...(d.documents || []).filter(v => v.url !== url), { type: 'DRIVE', name: `Auto-évaluation ${request.year}`, url, uploadedAt: null }]; });
  each('meteos', r => {
    const date = dateValue(r.get('Date_Meteo'));
    if (!request.meteoFrom || !request.meteoTo) throw new Error('Définir la période des météos à importer.');
    if (!date) throw new Error('Date_Meteo manquante.');
    if (date < request.meteoFrom || date > request.meteoTo) return;
    const p = resolve(r); const matches = [...dossiers.values()].filter(d => d.candidateId === p.id && d.campaignYear === request.year);
    if (!matches.length) { plan.warnings.push(`Météo ${r.get('Id_Suivi_Meteo')} : profil hors campagne, ignorée.`); return; }
    const d = getDossier(p), sourceId = r.get('Id_Suivi_Meteo'); if (!sourceId) throw new Error('Id_Suivi_Meteo manquant.');
    const f: ClientFeedback = { id: stableId('meteo', sourceId), sourceId, clientId: r.get('Id_Client_App_LL'), client: r.get('Client') || r.get('Id_Client_App_LL'), mission: r.get('Projet'), authorProfileId: r.get('Id_Realisateur_Meteo_App_LL'), realizationDate: date, sourceStatus: r.get('Statut'), sourceUrl: r.get('Lien_Meteo'), satisfactionItems: r.get('Points_Satisfaction_Client'), improvementAxes: r.get('Axe_Amelioration_Client'), perspectives: r.get('Perspectives_Mission_Client'), recommendation: r.get('A_Recommander'), clientVision: r.get('Vision_Generale_Client'), consultantVision: r.get('Vision_Generale_Consultant_LL'), consultantSatisfaction: r.get('Points_Satisfaction_Consultant_LL'), consultantImprovement: r.get('Axe_Amelioration_Consultant_LL'), consultantPerspectives: r.get('Perspectives_Mission_Consultant_LL') };
    unique('Météo', sourceId, f); d.clientFeedbacks = [...(d.clientFeedbacks || []).filter(v => v.sourceId !== sourceId), f];
  });
  if (!request.tables.some(t => t.kind === 'rh')) plan.errors.push('Fichier RH / délibérations requis pour définir les participants de la campagne.');
  if (!touchedDossiers.size) plan.errors.push('Aucun dossier de campagne identifié.');
  const changed = (entity: string, item: any, old: any) => {
    const keys = Object.keys(item).filter(k => JSON.stringify(item[k]) !== JSON.stringify(old?.[k]));
    if (!keys.length) return false;
    plan.changes.push({ entity, id: item.id, action: old ? 'Mettre à jour' : 'Créer', fields: keys }); return true;
  };
  plan.profiles = [...touchedProfiles].map(id => profiles.get(id)!).filter(p => changed('Profil', p, existing.profiles.find(v => v.id === p.id)));
  plan.dossiers = [...touchedDossiers].map(id => dossiers.get(id)!).filter(d => changed('Dossier', d, existing.dossiers.find(v => v.id === d.id)));
  plan.evaluations = [...results.values()].filter(e => changed('Évaluation', e, existing.evaluations.find(v => v.id === e.id)));
  for (const link of plan.accountLinks) plan.changes.push({ entity: 'Compte', id: link.uid, action: 'Rattacher au profil ' + link.profileId, fields: ['profileId'] });
  plan.warnings = [...new Set(plan.warnings)];
  return compact(plan);
}
