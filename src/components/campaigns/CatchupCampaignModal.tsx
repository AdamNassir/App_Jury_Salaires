import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Loader2, 
  History, 
  ShieldCheck, 
  Info, 
  Eye,
  Check,
  Users
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Campaign, UserProfile } from '../../types';
import { 
  CampaignCatchupService, 
  ProfileReferenceItem,
  DeliberationParsedRow, 
  EvaluationParsedRow, 
  CatchupPreview, 
  CatchupApplyResult 
} from '../../services/campaignCatchupService';

interface CatchupCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCampaigns: Campaign[];
  currentUser?: UserProfile | null;
  onSuccess: (message: string) => void;
}

export function CatchupCampaignModal({
  isOpen,
  onClose,
  existingCampaigns,
  currentUser,
  onSuccess
}: CatchupCampaignModalProps) {
  const [step, setStep] = useState<'SELECT' | 'PREVIEW' | 'RESULT'>('SELECT');
  
  // Year / Campaign selection
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [customYearInput, setCustomYearInput] = useState<string>('2025');

  // Files
  const [profilesFile, setProfilesFile] = useState<File | null>(null);
  const [deliberationFile, setDeliberationFile] = useState<File | null>(null);
  const [evaluationsFile, setEvaluationsFile] = useState<File | null>(null);

  // Parsed data & preview
  const [isParsing, setIsParsing] = useState(false);
  const [profilesRef, setProfilesRef] = useState<ProfileReferenceItem[]>([]);
  const [deliberationRows, setDeliberationRows] = useState<DeliberationParsedRow[]>([]);
  const [evaluationRows, setEvaluationRows] = useState<EvaluationParsedRow[]>([]);
  const [preview, setPreview] = useState<CatchupPreview | null>(null);

  // Execution
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<CatchupApplyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleYearChange = (val: string) => {
    setCustomYearInput(val);
    const parsed = parseInt(val);
    if (!isNaN(parsed) && parsed >= 2000 && parsed <= 2100) {
      setSelectedYear(parsed);
    }
  };

  const handleParseSources = async () => {
    if (!deliberationFile && !evaluationsFile) {
      setErrorMsg("Veuillez charger au moins le classeur contenant Analyse_Jury ou TJ Cible.");
      return;
    }

    setIsParsing(true);
    setErrorMsg(null);
    try {
      let profs: ProfileReferenceItem[] = [];
      let delibRows: DeliberationParsedRow[] = [];
      let evalRows: EvaluationParsedRow[] = [];

      // 1. Lire le fichier des Profils (BDD_LL_New_Drive -> feuille Profil)
      if (profilesFile) {
        profs = await CampaignCatchupService.parseProfilesReferenceFile(profilesFile);
      }

      // Si profilesFile n'était pas fourni, chercher si un onglet Profil existe dans le classeur de délibération
      if (profs.length === 0 && deliberationFile) {
        try {
          const autoProfiles = await CampaignCatchupService.parseProfilesReferenceFile(deliberationFile);
          if (autoProfiles.length > 0) profs = autoProfiles;
        } catch (_) {}
      }

      // 2. Lire le classeur Analyse_Jury (feuille Analyse_Jury)
      if (deliberationFile) {
        delibRows = await CampaignCatchupService.parseDeliberationFile(deliberationFile);
      }

      // 3. Lire le classeur Évaluations (feuille TJ Cible)
      if (evaluationsFile) {
        evalRows = await CampaignCatchupService.parseEvaluationsFile(evaluationsFile);
      } else if (deliberationFile) {
        // Dans certains cas, le classeur Analyse_Jury_Salaires contient également l'onglet "TJ Cible"
        try {
          const autoEvals = await CampaignCatchupService.parseEvaluationsFile(deliberationFile);
          if (autoEvals.length > 0) evalRows = autoEvals;
        } catch (_) {}
      }

      setProfilesRef(profs);
      setDeliberationRows(delibRows);
      setEvaluationRows(evalRows);

      const previewData = await CampaignCatchupService.previewCatchup(
        selectedYear,
        profs,
        delibRows,
        evalRows
      );

      setPreview(previewData);
      setStep('PREVIEW');
    } catch (err: any) {
      console.error("Error parsing catchup sources:", err);
      setErrorMsg(`Erreur lors de l'analyse des classeurs : ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmCatchup = async () => {
    if (!preview) return;
    setIsApplying(true);
    setErrorMsg(null);
    try {
      const result = await CampaignCatchupService.applyCatchup(
        preview,
        profilesRef,
        deliberationRows,
        evaluationRows,
        currentUser || { id: 'admin', email: 'admin@logiclever.com', displayName: 'Administrateur', roles: ['ADMIN', 'JURY'], createdAt: new Date() }
      );

      setApplyResult(result);
      setStep('RESULT');
      onSuccess(`Rattrapage ${preview.year} appliqué avec succès : ${result.dossiersUpdatedCount} dossier(s) mis à jour.`);
    } catch (err: any) {
      console.error("Error applying catchup:", err);
      setErrorMsg(`Erreur lors de l'application : ${err.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  const resetAll = () => {
    setStep('SELECT');
    setProfilesFile(null);
    setDeliberationFile(null);
    setEvaluationsFile(null);
    setProfilesRef([]);
    setDeliberationRows([]);
    setEvaluationRows([]);
    setPreview(null);
    setApplyResult(null);
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-accent/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-accent/15 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-8 py-5 border-b border-accent/10 flex items-center justify-between bg-accent/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-accent">Rattrapage / Compléter une Campagne Historique</h2>
              <p className="text-xs text-accent/50 font-light mt-0.5">
                Rapprochement exact des colonnes par position (Analyse_Jury, TJ Cible & Profils).
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-accent/10 flex items-center justify-center text-accent/40 hover:text-accent transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-8 overflow-y-auto flex-1 space-y-6">
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: SELECT SOURCES */}
          {step === 'SELECT' && (
            <div className="space-y-6">
              {/* Choix de l'année */}
              <div className="bg-accent/5 p-5 rounded-xl border border-accent/10 space-y-3">
                <div className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> 1. Sélection de l'Année Historique
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="block text-xs font-bold text-accent/70 mb-1.5">Campagnes existantes</label>
                    <select
                      value={selectedYear}
                      onChange={(e) => {
                        const yr = parseInt(e.target.value);
                        setSelectedYear(yr);
                        setCustomYearInput(String(yr));
                      }}
                      className="w-full px-4 py-2.5 bg-white border border-accent/20 rounded-xl text-sm font-bold text-accent outline-none focus:border-primary"
                    >
                      {existingCampaigns.map(c => (
                        <option key={c.id} value={c.year}>
                          {c.title} ({c.year}) {c.status === 'CLÔTURÉE' ? '— Clôturée (Préservée)' : '— Ouverte'}
                        </option>
                      ))}
                      <option value={2026}>Campagne 2026</option>
                      <option value={2025}>Campagne 2025</option>
                      <option value={2024}>Campagne 2024</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-accent/70 mb-1.5">Ou saisir une année spécifique</label>
                    <input
                      type="number"
                      min={2015}
                      max={2035}
                      value={customYearInput}
                      onChange={(e) => handleYearChange(e.target.value)}
                      placeholder="Ex: 2025"
                      className="w-full px-4 py-2.5 bg-white border border-accent/20 rounded-xl text-sm font-bold text-accent outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Dépôt des Fichiers Sources : 3 cartes épurées */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Source 1 : Référentiel Profils / Id_Profil */}
                <div className="border border-accent/15 rounded-xl p-5 bg-white shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-black uppercase tracking-wider text-accent flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-600" /> BDD Profils
                      </span>
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase">Id_Profil</span>
                    </div>
                    <p className="text-[11px] text-accent/60 font-light leading-relaxed">
                      <code>BDD_LL_New_Drive</code> (onglet <code>Profil</code> : Col A=Id_Profil, Col B=Nom, Col C=Prénom).
                    </p>
                  </div>

                  <div className="border-2 border-dashed border-accent/20 rounded-xl p-4 text-center hover:border-emerald-500 transition-all">
                    <input
                      type="file"
                      id="profilesFileInput"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => setProfilesFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label htmlFor="profilesFileInput" className="cursor-pointer block space-y-1.5">
                      <Upload className="w-6 h-6 text-emerald-600 mx-auto opacity-80" />
                      <div className="text-xs font-bold text-accent truncate">
                        {profilesFile ? profilesFile.name : "Sélectionner BDD"}
                      </div>
                      <div className="text-[10px] text-accent/40">Excel / CSV</div>
                    </label>
                  </div>
                  {profilesFile && (
                    <div className="flex items-center justify-between text-[10px] text-emerald-700 bg-emerald-50 p-2 rounded-lg font-bold">
                      <span className="flex items-center gap-1 truncate"><Check className="w-3.5 h-3.5 shrink-0" /> {profilesFile.name}</span>
                      <button onClick={() => setProfilesFile(null)} className="text-accent/40 hover:text-accent ml-1">Retirer</button>
                    </div>
                  )}
                </div>

                {/* Source 2 : Délibération Analyse_Jury */}
                <div className="border border-accent/15 rounded-xl p-5 bg-white shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-black uppercase tracking-wider text-accent flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-primary" /> Analyse_Jury
                      </span>
                      <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase">Requis</span>
                    </div>
                    <p className="text-[11px] text-accent/60 font-light leading-relaxed">
                      <code>Analyse_Jury_Salaire</code> (L2 en-tête, Col A=Matricule, B=Prénom, C=Nom, I=Grade, J=TJ, P=Salaire).
                    </p>
                  </div>

                  <div className="border-2 border-dashed border-accent/20 rounded-xl p-4 text-center hover:border-primary transition-all">
                    <input
                      type="file"
                      id="delibFileInput"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => setDeliberationFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label htmlFor="delibFileInput" className="cursor-pointer block space-y-1.5">
                      <Upload className="w-6 h-6 text-primary mx-auto opacity-80" />
                      <div className="text-xs font-bold text-accent truncate">
                        {deliberationFile ? deliberationFile.name : "Analyse_Jury"}
                      </div>
                      <div className="text-[10px] text-accent/40">Excel / CSV</div>
                    </label>
                  </div>
                  {deliberationFile && (
                    <div className="flex items-center justify-between text-[10px] text-green-700 bg-green-50 p-2 rounded-lg font-bold">
                      <span className="flex items-center gap-1 truncate"><Check className="w-3.5 h-3.5 shrink-0" /> {deliberationFile.name}</span>
                      <button onClick={() => setDeliberationFile(null)} className="text-accent/40 hover:text-accent ml-1">Retirer</button>
                    </div>
                  )}
                </div>

                {/* Source 3 : Évaluations TJ Cible */}
                <div className="border border-accent/15 rounded-xl p-5 bg-white shadow-sm flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-black uppercase tracking-wider text-accent flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-secondary" /> TJ Cible (Avis)
                      </span>
                      <span className="text-[9px] bg-accent/10 text-accent/60 px-1.5 py-0.5 rounded font-bold uppercase">Optionnel</span>
                    </div>
                    <p className="text-[11px] text-accent/60 font-light leading-relaxed">
                      Onglet <code>TJ Cible</code> (Col A=Matricule, Col J à P = Relations : Auto, Comm, Encad, Météo, Coach, Logiclever, Collègue).
                    </p>
                  </div>

                  <div className="border-2 border-dashed border-accent/20 rounded-xl p-4 text-center hover:border-secondary transition-all">
                    <input
                      type="file"
                      id="evalsFileInput"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => setEvaluationsFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    <label htmlFor="evalsFileInput" className="cursor-pointer block space-y-1.5">
                      <Upload className="w-6 h-6 text-secondary mx-auto opacity-80" />
                      <div className="text-xs font-bold text-accent truncate">
                        {evaluationsFile ? evaluationsFile.name : "TJ Cible"}
                      </div>
                      <div className="text-[10px] text-accent/40">Excel / CSV</div>
                    </label>
                  </div>
                  {evaluationsFile && (
                    <div className="flex items-center justify-between text-[10px] text-green-700 bg-green-50 p-2 rounded-lg font-bold">
                      <span className="flex items-center gap-1 truncate"><Check className="w-3.5 h-3.5 shrink-0" /> {evaluationsFile.name}</span>
                      <button onClick={() => setEvaluationsFile(null)} className="text-accent/40 hover:text-accent ml-1">Retirer</button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2.5">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                <span className="leading-relaxed">
                  <strong>Astuce :</strong> Si votre classeur <code>Analyse_Jury_Salaire</code> regroupe également les onglets <code>TJ Cible</code> et/ou <code>Profil</code>, déposez-le simplement dans <strong>Analyse_Jury</strong> : ils seront détectés et analysés automatiquement.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW CONFLICTS AND CHANGES */}
          {step === 'PREVIEW' && preview && (
            <div className="space-y-6">
              {/* Synthèse globale */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-accent/5 p-3 rounded-xl border border-accent/10">
                  <div className="text-[9px] font-black uppercase text-accent/40 tracking-widest">Campagne</div>
                  <div className="text-lg font-bold text-accent mt-0.5">{preview.year}</div>
                  <div className="text-[10px] text-accent/50 truncate">
                    {preview.campaignStatus === 'CLÔTURÉE' ? 'Clôturée (Préservée)' : 'Ouverte'}
                  </div>
                </div>

                <div className="bg-accent/5 p-3 rounded-xl border border-accent/10">
                  <div className="text-[9px] font-black uppercase text-accent/40 tracking-widest">Profils Référencés</div>
                  <div className="text-lg font-bold text-emerald-600 mt-0.5">{preview.totalProfilesReferenced}</div>
                  <div className="text-[10px] text-accent/50">avec Id_Profil</div>
                </div>

                <div className="bg-accent/5 p-3 rounded-xl border border-accent/10">
                  <div className="text-[9px] font-black uppercase text-accent/40 tracking-widest">Délibérations</div>
                  <div className="text-lg font-bold text-primary mt-0.5">{preview.totalDeliberationsParsed}</div>
                  <div className="text-[10px] text-accent/50">lignes extraites</div>
                </div>

                <div className="bg-accent/5 p-3 rounded-xl border border-accent/10">
                  <div className="text-[9px] font-black uppercase text-accent/40 tracking-widest">Réconciliés</div>
                  <div className="text-lg font-bold text-green-600 mt-0.5">{preview.matchedCandidatesCount}</div>
                  <div className="text-[10px] text-accent/50">{preview.unmatchedCandidatesCount} non trouvés</div>
                </div>
              </div>

              {/* Alertes d'identifiants non trouvés */}
              {preview.unresolvedDeliberations.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 text-xs text-amber-900">
                  <div className="font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    {preview.unresolvedDeliberations.length} collaborateur(s) de Analyse_Jury sans Id_Profil correspondant :
                  </div>
                  <div className="text-amber-800 text-[11px]">
                    Ces lignes seront ignorées tant qu'elles ne sont pas réconciliées par Matricule ou Nom dans le fichier BDD Profils :
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {preview.unresolvedDeliberations.map((unres, idx) => (
                      <span key={idx} className="bg-amber-100/80 text-amber-900 px-2 py-0.5 rounded font-mono text-[10px]">
                        {unres.nomPrenom} {unres.matricule ? `(${unres.matricule})` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tableau de prévisualisation des modifications */}
              <div className="space-y-2">
                <div className="text-xs font-black uppercase text-accent/60 tracking-widest flex items-center justify-between">
                  <span>Détail des {preview.conflicts.length} dossier(s) réconcilié(s)</span>
                  <span className="text-[10px] text-accent/40 font-normal">Clé canonique = Id_Profil</span>
                </div>
                <div className="border border-accent/15 rounded-xl overflow-hidden max-h-[350px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-accent/5 text-accent/70 font-black uppercase tracking-wider text-[10px] sticky top-0 border-b border-accent/10">
                      <tr>
                        <th className="p-3">Id_Profil</th>
                        <th className="p-3">Matricule</th>
                        <th className="p-3">Candidat</th>
                        <th className="p-3">Grade Cible</th>
                        <th className="p-3">Délibération</th>
                        <th className="p-3">Avis Évaluations</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-accent/10">
                      {preview.conflicts.map((c, i) => (
                        <tr key={i} className="hover:bg-accent/5 transition-colors">
                          <td className="p-3 font-mono font-bold text-primary">{c.idProfil}</td>
                          <td className="p-3 font-mono text-accent/60">{c.matricule || '—'}</td>
                          <td className="p-3 font-bold text-accent">{c.candidateName}</td>
                          <td className="p-3">
                            {c.deliberationChanges['newGrade'] ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary">
                                {c.deliberationChanges['newGrade'].after}
                              </span>
                            ) : (
                              <span className="text-accent/30">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            {Object.keys(c.deliberationChanges).length > 0 ? (
                              <div className="space-y-0.5 text-[11px]">
                                {c.deliberationChanges['proposedSalary0107'] && (
                                  <div>Salaire proposé : <strong className="text-primary">{c.deliberationChanges['proposedSalary0107'].after}€</strong></div>
                                )}
                                {c.deliberationChanges['tjVendu0107'] && (
                                  <div>TJ Vendu : <strong>{c.deliberationChanges['tjVendu0107'].after}€</strong></div>
                                )}
                                {c.deliberationChanges['salaire3006'] && (
                                  <div>Salaire 30/06 : <strong>{c.deliberationChanges['salaire3006'].after}€</strong></div>
                                )}
                              </div>
                            ) : (
                              <span className="text-accent/30 italic">Aucune délibération</span>
                            )}
                          </td>
                          <td className="p-3">
                            {c.evaluationsToAdd.length > 0 ? (
                              <div className="space-y-1">
                                {c.evaluationsToAdd.map((ev, idx) => (
                                  <div key={idx} className="text-[11px] flex items-center gap-1.5">
                                    <span className="font-bold">{ev.client}</span> ({ev.type})
                                    <span className={cn(
                                      "text-[9px] px-1.5 py-0.2 rounded font-black",
                                      ev.isUpdate ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                                    )}>
                                      {ev.isUpdate ? 'Mise à jour' : '+ Nouveau'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-accent/30 italic">Aucun avis</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS RESULT */}
          {step === 'RESULT' && applyResult && (
            <div className="py-10 text-center space-y-6">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-accent">Rattrapage Réalisé avec Succès !</h3>
                <p className="text-sm text-accent/60 font-light mt-1">
                  Les dossiers et évaluations de la campagne {selectedYear} ont été réconciliés et complétés avec leur <strong>Id_Profil</strong> pérenne.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto text-center pt-2">
                <div className="p-4 bg-accent/5 rounded-xl border border-accent/10">
                  <div className="text-2xl font-bold text-accent">{applyResult.dossiersUpdatedCount}</div>
                  <div className="text-[10px] uppercase font-bold text-accent/50 tracking-wider">Dossiers mis à jour</div>
                </div>
                <div className="p-4 bg-accent/5 rounded-xl border border-accent/10">
                  <div className="text-2xl font-bold text-primary">{applyResult.evaluationsCreatedCount}</div>
                  <div className="text-[10px] uppercase font-bold text-accent/50 tracking-wider">Avis créés</div>
                </div>
                <div className="p-4 bg-accent/5 rounded-xl border border-accent/10">
                  <div className="text-2xl font-bold text-secondary">{applyResult.evaluationsUpdatedCount}</div>
                  <div className="text-[10px] uppercase font-bold text-accent/50 tracking-wider">Avis réconciliés</div>
                </div>
              </div>

              {applyResult.preservedClosedStatus && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl">
                  <ShieldCheck className="w-4 h-4" /> Statut CLÔTURÉE préservé avec succès sur la campagne.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-8 py-5 border-t border-accent/10 flex items-center justify-between bg-accent/5">
          {step === 'SELECT' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-accent/60 hover:text-accent hover:bg-white transition-all cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isParsing || (!deliberationFile && !evaluationsFile && !profilesFile)}
                onClick={handleParseSources}
                className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-primary hover:bg-primary-hover text-white transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-40"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyse & Réconciliation...
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    Prévisualiser les modifications
                  </>
                )}
              </button>
            </>
          )}

          {step === 'PREVIEW' && (
            <>
              <button
                type="button"
                disabled={isApplying}
                onClick={() => setStep('SELECT')}
                className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-accent/60 hover:text-accent hover:bg-white transition-all cursor-pointer"
              >
                Retour aux fichiers
              </button>
              <button
                type="button"
                disabled={isApplying || !preview?.canProceed || preview?.conflicts.length === 0}
                onClick={handleConfirmCatchup}
                className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-green-600 hover:bg-green-700 text-white transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-40"
              >
                {isApplying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Application du rattrapage...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmer et Appliquer ({preview?.conflicts.length} dossiers)
                  </>
                )}
              </button>
            </>
          )}

          {step === 'RESULT' && (
            <button
              type="button"
              onClick={() => {
                resetAll();
                onClose();
              }}
              className="ml-auto px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-primary text-white hover:bg-primary-hover transition-all shadow-md cursor-pointer"
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
