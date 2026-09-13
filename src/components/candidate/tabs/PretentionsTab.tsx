import React from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { Section, FormField, NumberInput } from '../CandidateUI';
import { AnnualReport, Grade, UserProfile } from '../../../types';
import { cn, formatCurrency } from '../../../lib/utils';

interface PretentionsTabProps {
  profile: UserProfile;
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
  effectiveCurrentGrade: Grade | 'Junior';
  availableWishedGrades: Grade[];
  effectiveTargetTJM: number;
  corridorMinSalary: number;
  corridorMaxSalary: number;
  corridorGrade: Grade | 'Junior';
  addObjectiveFuture: () => void;
}

export function PretentionsTab({
  profile,
  reportData,
  setReportData,
  effectiveCurrentGrade,
  availableWishedGrades,
  effectiveTargetTJM,
  corridorMinSalary,
  corridorMaxSalary,
  corridorGrade,
  addObjectiveFuture
}: PretentionsTabProps) {
  return (
    <motion.div key="pre" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <Section title="Futur & Prétentions" subtitle="Projections de carrière et attentes salariales.">
        <div className="space-y-12">
          <FormField 
            label="Objectifs moyen-terme (Vision / Carrière)" 
            value={reportData.careerGoals} 
            onChange={v => setReportData(prev => ({ ...prev, careerGoals: v }))} 
            placeholder="Se former sur ..., prendre des responsabilités..." 
            tooltip="Indiquez vos ambitions à 1-3 ans." 
            required 
          />
          
          <div className="pt-8 border-t border-accent/10">
            <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-10 flex items-center gap-1">
              Objectifs court-terme (SMART) <span className="text-red-500 font-bold">*</span>
            </h4>
            <div className="p-6 bg-accent/5 rounded-xl border border-accent/10 mb-8 text-sm text-accent/60 italic leading-relaxed">
              Un objectif définit un résultat à atteindre dans un contexte donné. Il est important qu'il soit 
              <span className="font-bold text-primary"> SMART</span> : Spécifique, Mesurable, Ambitieux, Réaliste et Temporel.
            </div>
            <div className="space-y-6">
              {reportData.nextObjectives.map((obj, idx) => (
                <div key={idx} className="p-8 bg-primary/5 rounded-xl border border-primary/10 relative">
                  <button 
                    type="button"
                    onClick={() => setReportData(prev => ({ ...prev, nextObjectives: prev.nextObjectives.filter((_, i) => i !== idx) }))} 
                    className="absolute top-4 right-4 text-primary/30 hover:text-red-500"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <FormField 
                      label="Objectif (S)" 
                      value={obj.objective} 
                      onChange={v => setReportData(prev => {
                        const o = [...prev.nextObjectives];
                        o[idx] = { ...o[idx], objective: v };
                        return { ...prev, nextObjectives: o };
                      })} 
                      placeholder="Faire ..." 
                    />
                    <FormField 
                      label="Bénéfice(s) / Afin de" 
                      value={obj.benefit} 
                      onChange={v => setReportData(prev => {
                        const o = [...prev.nextObjectives];
                        o[idx] = { ...o[idx], benefit: v };
                        return { ...prev, nextObjectives: o };
                      })} 
                      placeholder="Pourquoi ?" 
                    />
                    <FormField 
                      label="Moyens (A/R)" 
                      value={obj.means} 
                      onChange={v => setReportData(prev => {
                        const o = [...prev.nextObjectives];
                        o[idx] = { ...o[idx], means: v };
                        return { ...prev, nextObjectives: o };
                      })} 
                      placeholder="Comment ?" 
                    />
                    <FormField 
                      label="Mesures (M/T)" 
                      value={obj.measures} 
                      onChange={v => setReportData(prev => {
                        const o = [...prev.nextObjectives];
                        o[idx] = { ...o[idx], measures: v };
                        return { ...prev, nextObjectives: o };
                      })} 
                      placeholder="Indicateurs..." 
                    />
                  </div>
                </div>
              ))}
              <button 
                type="button"
                onClick={addObjectiveFuture} 
                className="w-full py-4 border-2 border-dashed border-primary/20 rounded-xl text-primary/40 font-bold hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-3"
              >
                <Plus className="w-5 h-5" /> Ajouter un objectif futur
              </button>
            </div>
          </div>

          <div className="pt-12 border-t-2 border-accent border-dashed mt-12">
             <h4 className="text-[10px] font-black text-accent/30 uppercase tracking-widest mb-10">Projections Financières</h4>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                <div className="space-y-8">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">Grade souhaité</label>
                      <span className="text-[10px] text-accent/40 italic">Grade actuel : {effectiveCurrentGrade}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {(['Confirmé', 'Senior', 'Expert'] as Grade[]).map(g => {
                        const isAllowed = availableWishedGrades.includes(g);
                        return (
                          <button 
                            key={g} 
                            type="button"
                            disabled={!isAllowed}
                            onClick={() => isAllowed && setReportData(prev => ({ ...prev, wishedGrade: g }))} 
                            className={cn(
                              "py-4 rounded-xl text-sm font-bold transition-all border-2", 
                              reportData.wishedGrade === g 
                                ? "bg-primary text-white border-primary shadow-lg" 
                                : isAllowed 
                                  ? "bg-white text-accent/60 border-accent/10 hover:border-primary/40 cursor-pointer"
                                  : "bg-accent/5 text-accent/20 border-accent/5 cursor-not-allowed opacity-50"
                            )}
                            title={!isAllowed ? `Vous ne pouvez pas demander un grade inférieur à votre grade actuel (${effectiveCurrentGrade})` : undefined}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                    {availableWishedGrades.length === 1 && (
                      <p className="text-[10px] text-accent/40 mt-2 italic">
                        Note : En tant qu'Expert, vous êtes au grade maximal de la filière.
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <NumberInput 
                      label="Rémunération souhaitée (€/an)" 
                      value={reportData.wishedSalary} 
                      onChange={v => setReportData(prev => ({ ...prev, wishedSalary: v }))} 
                      min={profile.currentSalary || 20000}
                      max={300000}
                      step={500}
                      required 
                      tooltip={`Minimum : ${formatCurrency(profile.currentSalary || 0)}`}
                    />

                    {/* Dynamic TJM-Based Logiclever corridor guide */}
                    <div className="p-4 bg-primary/5 rounded-xl border border-primary/15 space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-primary">
                        <span>Fourchette théorique Logiclever</span>
                        <span>TJM cible {effectiveTargetTJM}€</span>
                      </div>
                      <div className="text-sm font-bold text-accent">
                        {formatCurrency(corridorMinSalary)} <span className="text-xs font-normal text-accent/40">à</span> {formatCurrency(corridorMaxSalary)}
                      </div>
                      <p className="text-[10px] text-accent/50 leading-relaxed">
                        Déterminée automatiquement selon la formule pour le grade <strong>{corridorGrade}</strong> (base standard à 100% investissement).
                      </p>

                      {/* Live alert if requested salary is out of range */}
                      {reportData.wishedSalary > 0 && reportData.wishedSalary < (profile.currentSalary || 0) && (
                        <div className="text-[10px] font-bold text-red-500 flex items-center gap-1.5 pt-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>La rémunération souhaitée ne peut pas être inférieure à votre salaire actuel ({formatCurrency(profile.currentSalary || 0)}).</span>
                        </div>
                      )}
                      {reportData.wishedSalary > corridorMaxSalary && (
                        <div className="text-[10px] font-medium text-amber-600 flex items-center gap-1.5 pt-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Votre souhait dépasse le plafond mathématique ({formatCurrency(corridorMaxSalary)}) pour un TJM de {effectiveTargetTJM}€. Préparez vos arguments pour le Jury.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <NumberInput 
                    label="TJM cible attendu (€)" 
                    value={reportData.targetTJM} 
                    onChange={v => setReportData(prev => ({ ...prev, targetTJM: v }))} 
                    min={profile.currentTJM || 200}
                    max={2500}
                    step={1}
                    required 
                    tooltip={`Actuel : ${profile.currentTJM || 0}€`}
                  />
                  <FormField 
                    label="Commentaire pour le Jury" 
                    value={reportData.salaryExpectations} 
                    onChange={v => setReportData(prev => ({ ...prev, salaryExpectations: v }))} 
                    placeholder="Justifiez votre demande salariale (valeur apportée, missions à forte valeur ajoutée, investissement interne)..." 
                    maxLength={1500}
                  />
                </div>
             </div>
          </div>
        </div>
      </Section>
    </motion.div>
  );
}
