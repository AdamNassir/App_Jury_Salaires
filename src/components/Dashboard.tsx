import React, { useState, useEffect } from 'react';
import { FileText, CheckCircle2, Award, Banknote, PieChart, X, Search, User, Mail, Shield, ChevronRight } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Dossier, UserRole, UserProfile } from '../types';
import { formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardProps {
  dossiers: Dossier[];
  roles: UserRole[];
  candidates: Record<string, UserProfile>;
}

export function Dashboard({ dossiers, roles, candidates }: DashboardProps) {

  const [selectedStatus, setSelectedStatus] = useState<'OUVERT' | 'COMPLET' | 'VALIDE' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const totalAmount = dossiers.reduce((acc, d) => {
    const candidate = candidates[d.candidateId];
    const currentSalary = candidate?.currentSalary || d.annualReport?.currentSalary || 0;
    const proposedSalary = d.juryDecision?.amount || currentSalary;
    const increase = proposedSalary > currentSalary ? (proposedSalary - currentSalary) : 0;
    return acc + increase;
  }, 0);

  const validatedDossiers = dossiers.filter(d => d.status === 'VALIDE');
  const dossiersWithIncrease = validatedDossiers.filter(d => {
    const candidate = candidates[d.candidateId];
    const currentSalary = candidate?.currentSalary || d.annualReport?.currentSalary || 0;
    const proposedSalary = d.juryDecision?.amount || currentSalary;
    return proposedSalary > currentSalary;
  });

  const stats = {
    open: dossiers.filter(d => d.status === 'OUVERT').length,
    complete: dossiers.filter(d => d.status === 'COMPLET').length,
    validated: validatedDossiers.length,
    totalIncrements: `${dossiersWithIncrease.length} / ${validatedDossiers.length}`,
    totalAmount
  };

  // Only show financial stats if jury or admin roles are present
  const showFinancials = roles?.includes('JURY') || roles?.includes('ADMIN');

  const handleCloseModal = () => {
    setSelectedStatus(null);
    setSearchQuery('');
  };

  // Filter list of dossiers in modal
  const activeDossiers = selectedStatus
    ? dossiers.filter(d => {
        if (d.status !== selectedStatus) return false;
        if (!searchQuery) return true;
        const nameMatch = d.candidateName?.toLowerCase().includes(searchQuery.toLowerCase());
        const emailMatch = d.candidateEmail?.toLowerCase().includes(searchQuery.toLowerCase());
        const currentGrade = (candidates[d.candidateId]?.currentGrade || d.annualReport?.currentGrade || '').toLowerCase();
        const gradeMatch = currentGrade.includes(searchQuery.toLowerCase());
        return nameMatch || emailMatch || gradeMatch;
      })
    : [];

  const getStatusDetails = (status: 'OUVERT' | 'COMPLET' | 'VALIDE') => {
    switch (status) {
      case 'OUVERT':
        return {
          title: 'Dossiers Ouverts',
          colorClass: 'text-secondary bg-secondary/10 border-secondary/20',
          badgeColor: 'bg-secondary/10 text-secondary border border-secondary/20',
          desc: 'Ces dossiers sont actuellement en cours de rédaction par les candidats.',
          icon: <FileText className="w-5 h-5" />
        };
      case 'COMPLET':
        return {
          title: 'Dossiers Complets',
          colorClass: 'text-primary bg-orange-50 border-orange-200',
          badgeColor: 'bg-orange-50 text-primary border border-orange-100',
          desc: 'Ces dossiers ont été finalisés et soumis par les candidats, prêts pour évaluation.',
          icon: <PieChart className="w-5 h-5" />
        };
      case 'VALIDE':
        return {
          title: 'Dossiers Validés',
          colorClass: 'text-green-600 bg-green-50 border-green-200',
          badgeColor: 'bg-green-50 text-green-600 border border-green-100',
          desc: 'Les décisions finales pour ces dossiers ont été validées et verrouillées par le jury.',
          icon: <CheckCircle2 className="w-5 h-5" />
        };
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <StatCard 
          label="Dossiers Ouverts" 
          value={stats.open} 
          icon={<FileText className="w-7 h-7" />} 
          color="bg-secondary/10 text-secondary" 
          onClick={() => setSelectedStatus('OUVERT')}
        />
        <StatCard 
          label="Dossiers Complets" 
          value={stats.complete} 
          icon={<PieChart className="w-7 h-7" />} 
          color="bg-orange-50 text-primary" 
          onClick={() => setSelectedStatus('COMPLET')}
        />
        <StatCard 
          label="Dossiers Validés" 
          value={stats.validated} 
          icon={<CheckCircle2 className="w-7 h-7" />} 
          color="bg-green-50 text-green-600" 
          onClick={() => setSelectedStatus('VALIDE')}
        />
        {showFinancials && (
          <>
            <StatCard 
              label="Augmentations" 
              value={stats.totalIncrements} 
              icon={<Award className="w-7 h-7" />} 
              color="bg-indigo-50 text-indigo-600" 
            />
            <StatCard 
              label="Montant Total" 
              value={formatCurrency(stats.totalAmount)} 
              icon={<Banknote className="w-7 h-7" />} 
              color="bg-primary/10 text-primary" 
            />
          </>
        )}
      </div>

      {/* Modern Dialog Modal to show details of selected status */}
      <AnimatePresence>
        {selectedStatus && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseModal}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-accent/10 overflow-hidden flex flex-col max-h-[85vh] relative z-10"
            >
              {/* Header */}
              {(() => {
                const details = getStatusDetails(selectedStatus);
                return (
                  <>
                    <div className="p-6 border-b border-accent/5 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${details.colorClass}`}>
                          {details.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold text-accent tracking-tight">
                              {details.title}
                            </h3>
                            <span className={`px-2 py-0.5 text-xs font-black rounded-full ${details.badgeColor}`}>
                              {dossiers.filter(d => d.status === selectedStatus).length}
                            </span>
                          </div>
                          <p className="text-xs text-accent/50 mt-1 max-w-md">
                            {details.desc}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={handleCloseModal}
                        className="p-1.5 rounded-lg hover:bg-accent/5 text-accent/40 hover:text-accent transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Search bar inside Modal */}
                    <div className="px-6 py-3 border-b border-accent/5 bg-accent/[0.01] flex items-center gap-2">
                      <Search className="w-4 h-4 text-accent/30" />
                      <input 
                        type="text" 
                        placeholder="Rechercher par collaborateur, email ou grade..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-accent/30 text-accent"
                      />
                      {searchQuery && (
                        <button 
                          onClick={() => setSearchQuery('')}
                          className="text-xs text-accent/40 hover:text-accent font-medium"
                        >
                          Effacer
                        </button>
                      )}
                    </div>

                    {/* Scrollable Content */}
                    <div className="p-6 overflow-y-auto flex-1 space-y-3 max-h-[50vh]">
                      {activeDossiers.length === 0 ? (
                        <div className="py-12 text-center">
                          <User className="w-12 h-12 text-accent/15 mx-auto mb-3" />
                          <p className="text-sm font-semibold text-accent/60">Aucun candidat trouvé</p>
                          <p className="text-xs text-accent/40 mt-1">
                            {searchQuery ? 'Modifiez votre recherche pour trouver d\'autres profils.' : 'Aucun dossier ne correspond à ce statut pour le moment.'}
                          </p>
                        </div>
                      ) : (
                        activeDossiers.map(d => {
                          const candProfile = candidates[d.candidateId];
                          const curGrade = candProfile?.currentGrade || d.annualReport?.currentGrade || 'Junior';
                          const initials = d.candidateName ? d.candidateName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'C';
                          
                          return (
                            <div 
                              key={d.id} 
                              className="p-4 rounded-xl border border-accent/5 hover:border-accent/10 hover:bg-accent/[0.01] transition-all flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3">
                                {/* Profile Avatar circle */}
                                <div className={`w-10 h-10 rounded-full ${details.badgeColor} flex items-center justify-center font-bold text-sm shrink-0`}>
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-accent text-sm truncate flex items-center gap-2">
                                    {d.candidateName}
                                    <span className="text-xs px-2 py-0.5 rounded bg-accent/5 text-accent/60 font-medium">
                                      {curGrade}
                                    </span>
                                  </div>
                                  <div className="text-xs text-accent/40 flex items-center gap-1.5 mt-0.5 truncate">
                                    <Mail className="w-3.5 h-3.5 shrink-0" />
                                    {d.candidateEmail}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                {selectedStatus === 'OUVERT' && (
                                  <span className="text-xs text-secondary font-semibold bg-secondary/5 px-2.5 py-1 rounded-full border border-secondary/10">
                                    Brouillon
                                  </span>
                                )}
                                {selectedStatus === 'COMPLET' && (
                                  <div className="flex flex-col items-end">
                                    <span className="text-xs text-primary font-semibold bg-orange-50 px-2.5 py-1 rounded-full border border-orange-100">
                                      Soumis
                                    </span>
                                    {d.annualReport?.wishedGrade && d.annualReport.wishedGrade !== curGrade && (
                                      <span className="text-[10px] text-accent/50 mt-1">
                                        Vise {d.annualReport.wishedGrade}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {selectedStatus === 'VALIDE' && (
                                  <div className="flex flex-col items-end">
                                    <span className="text-xs text-green-600 font-semibold bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
                                      Validé
                                    </span>
                                    {d.juryDecision?.verdict && (
                                      <span className="text-[10px] text-accent/60 font-bold mt-1">
                                        {d.juryDecision.verdict}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-accent/[0.02] border-t border-accent/5 text-center">
                      <button
                        onClick={handleCloseModal}
                        className="px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-accent/50 hover:text-accent transition-colors"
                      >
                        Fermer la liste
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}

function StatCard({ label, value, icon, color, onClick }: StatCardProps) {
  const isClickable = !!onClick;
  return (
    <div 
      onClick={onClick}
      className={`bg-white p-8 rounded-xl border border-accent/10 flex flex-col justify-between hover:shadow-xl transition-all group ${
        isClickable ? 'cursor-pointer hover:-translate-y-1 hover:border-primary/30' : ''
      }`}
    >
      <div className={`w-14 h-14 ${color} rounded-base flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <div>
        <div className="text-3xl font-bold text-accent tracking-tighter flex items-center justify-between">
          <span>{value}</span>
          {isClickable && (
            <ChevronRight className="w-5 h-5 text-accent/20 group-hover:text-primary/60 group-hover:translate-x-1 transition-all" />
          )}
        </div>
        <div className="text-[10px] text-accent/40 uppercase tracking-[0.2em] font-black mt-2 flex items-center gap-1">
          {label}
          {isClickable && (
            <span className="lowercase text-[9px] font-normal text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-1">
              (cliquer pour voir)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

