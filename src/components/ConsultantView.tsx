import React, { useState, useEffect } from 'react';
import { updateDoc, doc, serverTimestamp, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, Dossier, ConsultantFeedback, ConsultationType } from '../types';
import { User, MessageSquare, Target, Save, CheckCircle2, Search, Filter } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConsultantViewProps {
  dossiers: Dossier[];
  profile: UserProfile;
}

export function ConsultantView({ dossiers, profile }: ConsultantViewProps) {
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'TO_TREAT'>('TO_TREAT');
  const [candidates, setCandidates] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    const q = query(collection(db, 'users'), where('roles', 'array-contains', 'CANDIDATE'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users: Record<string, UserProfile> = {};
      snapshot.docs.forEach(doc => {
        users[doc.id] = { id: doc.id, ...doc.data() } as UserProfile;
      });
      setCandidates(users);
    });
    return () => unsubscribe();
  }, []);

  // Filter based on assignments and status
  const filteredDossiers = dossiers.filter(d => {
    // Cannot evaluate own dossier
    if (d.candidateId === profile.id) return false;

    const isJury = profile.roles?.includes('JURY') || profile.roles?.includes('ADMIN');
    const isAssigned = d.assignedConsultantIds?.includes(profile.id);
    const hasAssignments = (profile.assignedCandidateIds && profile.assignedCandidateIds.length > 0);
    
    // If specific assignments exist, filter to them; otherwise show all peer dossiers for review
    if (!isJury && hasAssignments && !isAssigned) return false;
    
    if (filterStatus === 'TO_TREAT') {
      const myFeedback = d.consultantFeedbacks?.[profile.id];
      // "A traiter" = Not yet validated OR missing justification, and dossier not yet finalized
      const isComplete = myFeedback?.validated && (myFeedback?.justification?.length || 0) > 10;
      return d.status !== 'VALIDE' && !isComplete;
    }
    // "Tous" = All assigned dossiers
    return true;
  });

  const selectedDossier = dossiers.find(d => d.id === selectedDossierId) || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="lg:col-span-4 space-y-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-secondary tracking-tight">Vos Dossiers</h2>
          <div className="flex bg-accent/5 rounded-base p-1 border border-accent/10">
            <button 
              onClick={() => setFilterStatus('TO_TREAT')}
              className={cn("px-4 py-2 rounded-base text-[10px] font-black uppercase transition-all tracking-widest", filterStatus === 'TO_TREAT' ? "bg-primary text-white shadow-sm" : "text-accent/40 hover:bg-accent/10")}
            >
              À traiter
            </button>
            <button 
              onClick={() => setFilterStatus('ALL')}
              className={cn("px-4 py-2 rounded-base text-[10px] font-black uppercase transition-all tracking-widest", filterStatus === 'ALL' ? "bg-primary text-white shadow-sm" : "text-accent/40 hover:bg-accent/10")}
            >
              Tous
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {filteredDossiers.map(d => (
            <button
              key={d.id}
              onClick={() => setSelectedDossierId(d.id)}
              className={cn(
                "w-full p-8 rounded-xl border transition-all text-left group shadow-sm",
                selectedDossierId === d.id 
                  ? "bg-accent border-accent text-white ring-2 ring-primary ring-offset-2" 
                  : "bg-white border-accent/10 hover:border-secondary text-accent"
              )}
            >
              <div className="flex items-center gap-6">
                <div className={cn(
                  "w-14 h-14 rounded-base flex items-center justify-center shrink-0 shadow-inner transition-colors",
                  selectedDossierId === d.id ? "bg-white/10" : "bg-accent/5"
                )}>
                  <User className="w-7 h-7" />
                </div>
                <div className="overflow-hidden">
                  <div className="font-bold text-xl truncate mb-1">{d.candidateName}</div>
                  <div className={cn(
                    "text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2",
                    selectedDossierId === d.id ? "text-white/40" : "text-accent/30"
                  )}>
                    {d.status === 'OUVERT' ? 'En attente' : d.status === 'COMPLET' ? 'Dossier Complet' : 'Dossier Validé'}
                    {d.consultantFeedbacks?.[profile.id]?.validated && (
                      <span className="flex items-center gap-2 text-green-400 font-black">
                        <CheckCircle2 className="w-4 h-4" /> PRÊT
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {filteredDossiers.length === 0 && (
            <div className="p-16 text-center bg-accent/5 border border-dashed border-accent/20 rounded-xl text-accent/20 italic text-lg font-light">
              Aucun dossier à traiter pour le moment.
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-8">
        {selectedDossier ? (
          <div className="space-y-8">
            <div className="bg-white p-12 rounded-xl border border-accent/10 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 -mr-16 -mt-16 rounded-full" />
              <div className="flex items-center justify-between mb-12 pb-10 border-b border-accent/10 relative">
                <div>
                  <h2 className="text-accent mb-2">{selectedDossier.candidateName}</h2>
                  <p className="text-accent/40 text-lg font-light italic">Dossier de candidature 2025</p>
                </div>
                <StatusBadge status={selectedDossier.status} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <DossierSection title="Grade actuel" content={candidates[selectedDossier.candidateId]?.currentGrade || selectedDossier.annualReport?.currentGrade} />
                <DossierSection title="TJM actuel" content={candidates[selectedDossier.candidateId] ? `${candidates[selectedDossier.candidateId]?.currentTJM}€` : (selectedDossier.annualReport?.currentTJM ? `${selectedDossier.annualReport.currentTJM}€` : undefined)} />
              </div>
            </div>

            <ConsultantFeedbackForm 
              dossier={selectedDossier} 
              consultant={profile} 
            />
          </div>
        ) : (
          <div className="h-full min-h-[600px] flex flex-col items-center justify-center bg-white border border-dashed border-accent/10 rounded-xl text-accent/10">
            <Search className="w-24 h-24 mb-6 opacity-5" />
            <p className="text-3xl font-light italic text-accent/20">Sélectionnez un dossier à évaluer</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Dossier['status'] }) {
  const styles = {
    OUVERT: "border-secondary/20 text-secondary bg-secondary/5",
    COMPLET: "border-primary/20 text-primary bg-primary/5",
    VALIDE: "border-green-200 text-green-600 bg-green-50"
  };
  return (
    <span className={cn("px-6 py-2 rounded-base text-[10px] font-black uppercase tracking-[0.2em] border shadow-sm", styles[status])}>
      {status === 'OUVERT' ? 'En cours' : status === 'COMPLET' ? 'Complet' : 'Validé'}
    </span>
  );
}

function DossierSection({ title, content, isFullWidth }: { title: string, content?: string, isFullWidth?: boolean }) {
  return (
    <div className={cn(isFullWidth && "md:col-span-2")}>
      <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4 px-2">{title}</h4>
      <div className="bg-accent/5 p-8 rounded-xl text-lg leading-relaxed min-h-[80px] text-accent/80 border border-accent/10 shadow-inner font-light">
        {content || <span className="italic opacity-30 font-normal">Non renseigné</span>}
      </div>
    </div>
  );
}

function ConsultantFeedbackForm({ dossier, consultant }: { dossier: Dossier, consultant: UserProfile }) {
  const [loading, setLoading] = useState(false);
  const isReadOnly = dossier.status === 'VALIDE';
  const existingFeedback = dossier.consultantFeedbacks?.[consultant.id];
  
  const [formData, setFormData] = useState<Partial<ConsultantFeedback>>(
    existingFeedback || {
      type: 'Commerciale',
      targetTJMin: 0,
      targetTJMax: 0,
      justification: '',
      improvementAxes: '',
      confidenceIndex: 5,
      validated: false
    }
  );

  // Update form data if existing feedback changes (e.g. from database update)
  useEffect(() => {
    if (existingFeedback) {
      setFormData(existingFeedback);
    }
  }, [existingFeedback]);

  // Auto-save logic
  React.useEffect(() => {
    if (isReadOnly) return;
    const timer = setTimeout(() => {
      // Only save if something actually changed from the last known state in the dossier
      const currentFeedback = dossier.consultantFeedbacks?.[consultant.id];
      const hasChanged = JSON.stringify(formData) !== JSON.stringify(currentFeedback);
      
      if (hasChanged && !loading) {
        handleAutoSave();
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [formData, isReadOnly]);

  const handleAutoSave = async () => {
    setLoading(true);
    try {
      const feedback: ConsultantFeedback = {
        ...formData as ConsultantFeedback,
        consultantId: consultant.id,
        consultantName: consultant.displayName,
        // Automatically consider validated if they are filling it in
        validated: true,
        updatedAt: new Date().toISOString()
      };

      const updatedFeedbacks = {
        ...(dossier.consultantFeedbacks || {}),
        [consultant.id]: feedback
      };

      const updates: any = {
        consultantFeedbacks: updatedFeedbacks,
        updatedAt: serverTimestamp()
      };

      // Check if all consultants have validated
      const allValidated = dossier.assignedConsultantIds.every(id => {
        if (id === consultant.id) return true;
        return dossier.consultantFeedbacks?.[id]?.validated === true;
      });

      if (allValidated) {
        updates.status = 'COMPLET';
      }

      await updateDoc(doc(db, 'dossiers', dossier.id), updates);
    } catch (error) {
      console.error("Auto-save error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-accent p-12 rounded-xl text-white shadow-2xl relative overflow-hidden group border border-accent/20">
      <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 rounded-full -mr-40 -mt-40 blur-3xl group-hover:bg-primary/15 transition-all" />
      
      <div className="flex items-center gap-5 mb-12 relative">
        <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center shadow-lg">
          <MessageSquare className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-white mb-1">Avis Évaluateur / Pair</h2>
          <p className="text-white/40 text-lg font-light">Partagez votre retour d'expérience et recommandation technique.</p>
        </div>
        {loading && (
          <div className="ml-auto flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-widest animate-pulse">
            <span className="w-2 h-2 bg-primary rounded-full" />
            Synchronisation...
          </div>
        )}
      </div>

      <div className="space-y-12 relative">
        <div>
          <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-6">Type de consultation</label>
          <div className="flex flex-wrap gap-3">
            {(['Commerciale', 'Encadrement', 'Météo Client', 'Coach', 'Logiclever', 'Collègue en mission', 'COP & Epic'] as ConsultationType[]).map(t => (
              <button
                key={t}
                disabled={isReadOnly}
                onClick={() => setFormData({...formData, type: t})}
                className={cn(
                  "px-6 py-3 rounded-xl text-xs font-bold uppercase transition-all border-2",
                  formData.type === t ? "bg-primary border-primary text-white shadow-lg" : "bg-white/5 border-white/10 hover:bg-white/10 text-white/60",
                  isReadOnly && "opacity-50 cursor-not-allowed"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-12">
            <div className="grid grid-cols-2 gap-8">
              <NumberInput dark label="TJM Min (€)" value={formData.targetTJMin || 0} onChange={v => setFormData({...formData, targetTJMin: v})} disabled={isReadOnly} />
              <NumberInput dark label="TJM Max (€)" value={formData.targetTJMax || 0} onChange={v => setFormData({...formData, targetTJMax: v})} disabled={isReadOnly} />
            </div>
            <div>
              <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-6">Niveau de Confiance</label>
              <input 
                type="range" min="1" max="10" 
                value={formData.confidenceIndex || 5} 
                disabled={isReadOnly}
                onChange={e => setFormData({...formData, confidenceIndex: parseInt(e.target.value)})}
                className="w-full accent-primary h-2 bg-white/10 rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" 
              />
              <div className="flex justify-between text-[11px] text-white/30 mt-4 font-black uppercase tracking-widest">
                <span>Passif</span>
                <span className="text-primary font-black">Score : {formData.confidenceIndex} / 10</span>
                <span>Expert</span>
              </div>
            </div>
          </div>
          <div className="space-y-10">
            <TextArea dark label="Argumentaire Technique" value={formData.justification || ''} onChange={v => setFormData({...formData, justification: v})} placeholder="Pourquoi préconisez-vous ce TJM ?" disabled={isReadOnly} />
            <TextArea dark label="Leviers de valorisation" value={formData.improvementAxes || ''} onChange={v => setFormData({...formData, improvementAxes: v})} placeholder="Formations, certifications, soft skills..." disabled={isReadOnly} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, dark, disabled }: { label: string, value: string, onChange: (v: string) => void, placeholder: string, dark?: boolean, disabled?: boolean }) {
  return (
    <div className="w-full">
      <label className={cn("block text-[10px] font-black uppercase tracking-[0.2em] mb-4 px-2", dark ? "text-white/30" : "text-accent/30")}>{label}</label>
      <textarea
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full p-6 rounded-xl min-h-[120px] text-lg font-light resize-none outline-none transition-all",
          dark ? "bg-white/5 border border-white/10 text-white focus:bg-white/10" : "bg-accent/5 border border-accent/10 text-accent focus:bg-white shadow-inner",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      />
    </div>
  );
}

function NumberInput({ label, value, onChange, dark, disabled }: { label: string, value: number, onChange: (v: number) => void, dark?: boolean, disabled?: boolean }) {
  return (
    <div className="w-full">
      <label className={cn("block text-[10px] font-black uppercase tracking-[0.2em] mb-4 px-2", dark ? "text-white/30" : "text-accent/30")}>{label}</label>
      <input
        type="number"
        value={value || ''}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className={cn(
          "w-full p-6 rounded-xl text-xl font-bold tracking-tight outline-none transition-all",
          dark ? "bg-white/5 border border-white/10 text-white focus:bg-white/10" : "bg-accent/5 border border-accent/10 text-accent focus:bg-white shadow-inner",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      />
    </div>
  );
}

