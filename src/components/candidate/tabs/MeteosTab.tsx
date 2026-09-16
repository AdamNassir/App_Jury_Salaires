import React from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { FormField } from '../CandidateUI';
import { ClientFeedback } from '../../../types';
import { cn } from '../../../lib/utils';

interface MeteosTabProps {
  feedbacks: ClientFeedback[];
  setFeedbacks: React.Dispatch<React.SetStateAction<ClientFeedback[]>>;
  meteoSubTab: 'LIST' | 'CHART';
  setMeteoSubTab: (tab: 'LIST' | 'CHART') => void;
  selectedMeteoIndex: number | null;
  setSelectedMeteoIndex: (index: number | null) => void;
}

export function MeteosTab({
  feedbacks,
  setFeedbacks,
  meteoSubTab,
  setMeteoSubTab,
  selectedMeteoIndex,
  setSelectedMeteoIndex
}: MeteosTabProps) {
  const sortedMeteos = [...feedbacks]
    .filter(f => f.client)
    .sort((a, b) => (a.realizationDate || '').localeCompare(b.realizationDate || ''));

  return (
    <motion.div key="meteos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      <div className="bg-white p-12 rounded-xl border border-accent/10 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-secondary flex items-center gap-2">Météos Client <span className="text-red-500 font-bold">*</span></h2>
          <button 
            type="button"
            onClick={() => setFeedbacks(prev => [...prev, { id: uuidv4(), client: '', mission: '', satisfactionItems: '', improvementAxes: '', perspectives: '', recommendation: '' }])}
            className="flex items-center gap-3 bg-secondary text-white px-6 py-3 rounded-base text-base font-bold hover:brightness-110 transition-all shadow-md"
          >
            <Plus className="w-5 h-5" /> Ajouter
          </button>
        </div>
        <p className="text-xl text-accent/40 mb-8 pb-4 border-b border-accent/10 font-light italic">
          Recueillez les retours de vos clients pour appuyer votre dossier.
        </p>

        {/* Sub Tab Navigation inside METEOS */}
        {feedbacks.length > 1 && (
          <div className="flex gap-4 mb-10 border-b border-accent/5 pb-4">
            <button
              type="button"
              onClick={() => setMeteoSubTab('LIST')}
              className={cn(
                "px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                meteoSubTab === 'LIST' 
                  ? "bg-secondary text-white shadow-sm" 
                  : "text-accent/60 hover:bg-accent/5 hover:text-accent"
              )}
            >
              Saisie des Météos
            </button>
            <button
              type="button"
              onClick={() => setMeteoSubTab('CHART')}
              className={cn(
                "px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                meteoSubTab === 'CHART' 
                  ? "bg-secondary text-white shadow-sm" 
                  : "text-accent/60 hover:bg-accent/5 hover:text-accent"
              )}
            >
              Suivi Visuel ({sortedMeteos.length})
            </button>
          </div>
        )}

        {meteoSubTab === 'CHART' && feedbacks.length > 1 ? (
          sortedMeteos.length < 2 ? (
            <div className="flex flex-col items-center justify-center p-16 text-center bg-accent/5 rounded-2xl border border-dashed border-accent/20">
              <AlertCircle className="w-16 h-16 text-primary mb-4 opacity-70 animate-bounce" />
              <h3 className="text-2xl font-bold text-accent mb-2">Pas assez de données</h3>
              <p className="text-sm text-accent/60 max-w-md">
                Veuillez saisir au moins deux météos avec un nom de client et une date de réalisation pour afficher le suivi visuel.
              </p>
            </div>
          ) : (() => {
            const width = 800;
            const height = 450;
            const chartMargin = { top: 70, right: 60, bottom: 90, left: 60 };
            const chartWidth = width - chartMargin.left - chartMargin.right;
            const chartHeight = height - chartMargin.top - chartMargin.bottom;

            const chartPoints = sortedMeteos.map((f, i) => {
              const x = chartMargin.left + (i / (sortedMeteos.length - 1 || 1)) * chartWidth;
              const rClient = f.clientRating !== undefined && f.clientRating !== null ? f.clientRating : 0;
              const rConsultant = f.consultantRating !== undefined && f.consultantRating !== null ? f.consultantRating : 0;
              const yClient = chartMargin.top + chartHeight - (rClient / 10) * chartHeight;
              const yConsultant = chartMargin.top + chartHeight - (rConsultant / 10) * chartHeight;

              return {
                x,
                yClient,
                yConsultant,
                clientRating: rClient,
                consultantRating: rConsultant,
                client: f.client,
                date: f.realizationDate,
                feedback: f,
                index: i
              };
            });

            const chartSeparators: { x: number; prevClient: string; nextClient: string }[] = [];
            for (let i = 1; i < chartPoints.length; i++) {
              const prev = chartPoints[i - 1];
              const curr = chartPoints[i];
              if (prev.client.toLowerCase().trim() !== curr.client.toLowerCase().trim()) {
                const xSep = (prev.x + curr.x) / 2;
                chartSeparators.push({
                  x: xSep,
                  prevClient: prev.client,
                  nextClient: curr.client
                });
              }
            }

            return (
              <div className="space-y-8">
                {/* Legend */}
                <div className="flex justify-center gap-8 mb-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-1 bg-[#0D66C2] rounded" />
                    <span className="text-xs font-bold text-accent">Note Client</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-1 bg-[#FF5D25] rounded" />
                    <span className="text-xs font-bold text-accent">Note Consultant</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-1 border-t-2 border-dashed border-[#FF5D25] opacity-60" />
                    <span className="text-xs font-bold text-accent">Séparateur changement de Client</span>
                  </div>
                </div>

                {/* Chart Container */}
                <div className="w-full overflow-x-auto bg-accent/5 p-6 rounded-2xl border border-accent/10 shadow-inner">
                  <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[700px]">
                    {/* Horizontal Grid lines */}
                    {[0, 2, 4, 6, 8, 10].map((val) => {
                      const y = chartMargin.top + chartHeight - (val / 10) * chartHeight;
                      return (
                        <g key={val}>
                          <line 
                            x1={chartMargin.left} 
                            y1={y} 
                            x2={width - chartMargin.right} 
                            y2={y} 
                            stroke="#E2E8F0" 
                            strokeWidth={1} 
                          />
                          <text 
                            x={chartMargin.left - 15} 
                            y={y + 4} 
                            textAnchor="end" 
                            fontSize={10} 
                            fontWeight="black" 
                            fill="#718096"
                          >
                            {val}
                          </text>
                        </g>
                      );
                    })}

                    {/* Separation lines for client change */}
                    {chartSeparators.map((sep, idx) => (
                      <g key={idx}>
                        <line 
                          x1={sep.x} 
                          y1={chartMargin.top - 15} 
                          x2={sep.x} 
                          y2={chartMargin.top + chartHeight} 
                          stroke="#FF5D25" 
                          strokeWidth={1.5} 
                          strokeDasharray="4 4" 
                          opacity={0.7}
                        />
                        <circle 
                          cx={sep.x} 
                          cy={chartMargin.top - 15} 
                          r={10} 
                          fill="#FF5D25" 
                        />
                        <text
                          x={sep.x}
                          y={chartMargin.top - 12}
                          textAnchor="middle"
                          fontSize={8}
                          fontWeight="black"
                          fill="white"
                        >
                          ⇄
                        </text>
                        <text
                          x={sep.x}
                          y={chartMargin.top - 36}
                          textAnchor="middle"
                          fontSize={8}
                          fontWeight="bold"
                          fill="#FF5D25"
                          className="uppercase tracking-widest font-sans"
                        >
                          Nouveau Client
                        </text>
                        <text
                          x={sep.x}
                          y={chartMargin.top - 26}
                          textAnchor="middle"
                          fontSize={7}
                          fontWeight="semibold"
                          fill="#4A5568"
                        >
                          {sep.prevClient} ➔ {sep.nextClient}
                        </text>
                      </g>
                    ))}

                    {/* Connections curves */}
                    {chartPoints.length > 1 && (
                      <>
                        <path 
                          d={`M ${chartPoints.map(p => `${p.x} ${p.yClient}`).join(' L ')}`}
                          fill="none"
                          stroke="#0D66C2"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path 
                          d={`M ${chartPoints.map(p => `${p.x} ${p.yConsultant}`).join(' L ')}`}
                          fill="none"
                          stroke="#FF5D25"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </>
                    )}

                    {/* interactive nodes */}
                    {chartPoints.map((p, idx) => {
                      const isSelected = selectedMeteoIndex === null ? idx === chartPoints.length - 1 : selectedMeteoIndex === idx;
                      return (
                        <g key={idx} className="cursor-pointer" onClick={() => setSelectedMeteoIndex(idx)}>
                          <circle cx={p.x} cy={p.yClient} r={16} fill="transparent" />
                          <circle cx={p.x} cy={p.yConsultant} r={16} fill="transparent" />

                          <circle 
                            cx={p.x} 
                            cy={p.yClient} 
                            r={isSelected ? 7 : 4.5} 
                            fill="white" 
                            stroke="#0D66C2" 
                            strokeWidth={isSelected ? 4.5 : 3} 
                          />

                          <circle 
                            cx={p.x} 
                            cy={p.yConsultant} 
                            r={isSelected ? 7 : 4.5} 
                            fill="white" 
                            stroke="#FF5D25" 
                            strokeWidth={isSelected ? 4.5 : 3} 
                          />

                          <text x={p.x} y={p.yClient - 11} textAnchor="middle" fontSize={9} fontWeight="black" fill="#0D66C2">{p.clientRating}</text>
                          <text x={p.x} y={p.yConsultant + 17} textAnchor="middle" fontSize={9} fontWeight="black" fill="#FF5D25">{p.consultantRating}</text>

                          <text 
                            x={p.x} 
                            y={chartMargin.top + chartHeight + 25} 
                            textAnchor="middle" 
                            fontSize={9} 
                            fontWeight="bold" 
                            fill="#2D3748"
                          >
                            {p.date ? new Date(p.date).toLocaleDateString('fr-FR') : '-'}
                          </text>
                          <text 
                            x={p.x} 
                            y={chartMargin.top + chartHeight + 38} 
                            textAnchor="middle" 
                            fontSize={8} 
                            fontWeight="medium" 
                            fill="#718096"
                          >
                            {p.client}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Selected Point Details Panel */}
                {(() => {
                  const activeIdx = selectedMeteoIndex === null || selectedMeteoIndex >= chartPoints.length 
                    ? chartPoints.length - 1 
                    : selectedMeteoIndex;
                  const activePoint = chartPoints[activeIdx];
                  if (!activePoint) return null;

                  return (
                    <div className="p-8 bg-accent/5 rounded-2xl border border-accent/10 space-y-6">
                      <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-accent/10">
                        <div>
                          <h4 className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Détails de la Météo Sélectionnée</h4>
                          <div className="text-2xl font-bold text-accent">{activePoint.client}</div>
                          {activePoint.feedback.mission && (
                            <p className="text-sm text-accent/60 mt-1 font-light italic">Mission : {activePoint.feedback.mission}</p>
                          )}
                        </div>
                        <div className="flex gap-4">
                          <div className="bg-white px-4 py-2 rounded-xl border border-accent/10 shadow-sm text-center">
                            <span className="block text-[8px] font-black text-accent/40 uppercase tracking-widest">Note Client</span>
                            <span className="text-xl font-black text-secondary">{activePoint.clientRating} <span className="text-xs text-accent/40">/10</span></span>
                          </div>
                          <div className="bg-white px-4 py-2 rounded-xl border border-accent/10 shadow-sm text-center">
                            <span className="block text-[8px] font-black text-accent/40 uppercase tracking-widest">Note Consultant</span>
                            <span className="text-xl font-black text-primary">{activePoint.consultantRating} <span className="text-xs text-accent/40">/10</span></span>
                          </div>
                          {activePoint.date && (
                            <div className="bg-white px-4 py-2 rounded-xl border border-accent/10 shadow-sm text-center flex flex-col justify-center">
                              <span className="block text-[8px] font-black text-accent/40 uppercase tracking-widest">Date</span>
                              <span className="text-xs font-bold text-accent mt-0.5">{new Date(activePoint.date).toLocaleDateString('fr-FR')}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                        {activePoint.feedback.satisfactionItems && (
                          <div className="space-y-1">
                            <span className="text-[9px] font-black text-accent/40 uppercase tracking-wider">Points de satisfaction</span>
                            <p className="bg-white p-4 rounded-xl border border-accent/5 font-light text-accent/80 whitespace-pre-line">{activePoint.feedback.satisfactionItems}</p>
                          </div>
                        )}
                        {activePoint.feedback.improvementAxes && (
                          <div className="space-y-1">
                            <span className="text-[9px] font-black text-accent/40 uppercase tracking-wider">Axes d'amélioration</span>
                            <p className="bg-white p-4 rounded-xl border border-accent/5 font-light text-accent/80 whitespace-pre-line">{activePoint.feedback.improvementAxes}</p>
                          </div>
                        )}
                        {activePoint.feedback.recommendation && (
                          <div className="space-y-1 md:col-span-2">
                            <span className="text-[9px] font-black text-accent/40 uppercase tracking-wider">Recommandation / Commentaire</span>
                            <p className="bg-white p-4 rounded-xl border border-accent/5 font-light text-accent/80 whitespace-pre-line">{activePoint.feedback.recommendation}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()
        ) : (
          <div className="space-y-16">
            {feedbacks.map((f, idx) => (
              <div key={f.id} className="relative p-10 rounded-xl border border-accent/10 bg-accent/5 space-y-10">
                <div className="flex flex-col gap-6 pb-10 border-b border-accent/10">
                  <div className="flex items-center justify-between gap-6 w-full">
                    <div className="flex items-center gap-6 flex-1 w-full">
                      <span className="w-12 h-12 bg-primary text-white rounded-base flex items-center justify-center text-xl font-bold shrink-0">{idx + 1}</span>
                      <div className="flex-1">
                        <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-1">Nom du Client</label>
                        <input 
                          value={f.client} 
                          onChange={e => setFeedbacks(prev => prev.map(item => item.id === f.id ? { ...item, client: e.target.value } : item))} 
                          placeholder="Nom du Client"
                          className="text-3xl font-bold bg-transparent border-none focus:ring-0 p-0 text-accent placeholder:text-accent/10 w-full"
                        />
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setFeedbacks(prev => prev.filter(item => item.id !== f.id))} 
                      className="text-accent/20 hover:text-red-500 transition-colors p-2 shrink-0"
                      title="Supprimer cette météo"
                    >
                      <Trash2 className="w-7 h-7" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-8 bg-white/50 backdrop-blur-sm px-6 py-4 rounded-2xl border border-accent/10 shadow-sm w-max self-start">
                      <div className="space-y-2 text-center border-accent/10">
                        <label className="block text-[9px] font-black text-accent/30 uppercase tracking-[0.2em]">Note Client</label>
                        <input 
                          type="number" min="0" max="10"
                          value={f.clientRating || ''} 
                          onChange={e => setFeedbacks(prev => prev.map(item => item.id === f.id ? { ...item, clientRating: parseInt(e.target.value) || 0 } : item))} 
                          className="w-12 bg-accent/5 text-center text-xl font-black text-secondary border-none p-0 focus:ring-0"
                          placeholder="-"
                        />
                      </div>
                      <div className="w-px h-10 bg-accent/10" />
                      <div className="space-y-2 text-center">
                        <label className="block text-[9px] font-black text-accent/30 uppercase tracking-[0.2em]">Note Consultant</label>
                        <input 
                          type="number" min="0" max="10"
                          value={f.consultantRating || ''} 
                          onChange={e => setFeedbacks(prev => prev.map(item => item.id === f.id ? { ...item, consultantRating: parseInt(e.target.value) || 0 } : item))} 
                          className="w-12 bg-accent/5 text-center text-xl font-black text-secondary border-none p-0 focus:ring-0"
                          placeholder="-"
                        />
                      </div>
                    </div>

                    <div className="bg-white/50 backdrop-blur-sm px-6 py-4 rounded-2xl border border-accent/10 shadow-sm flex flex-col justify-center min-w-[200px] h-[78px] self-start">
                      <label className="block text-[9px] font-black text-accent/30 uppercase tracking-[0.2em] mb-1">Date de réalisation</label>
                      <input 
                        type="date"
                        value={f.realizationDate || ''} 
                        onChange={e => setFeedbacks(prev => prev.map(item => item.id === f.id ? { ...item, realizationDate: e.target.value } : item))} 
                        className="bg-accent/5 text-sm font-semibold text-accent border-none p-1.5 focus:ring-0 rounded-lg outline-none w-full font-sans cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <FormField label="Mission" value={f.mission} onChange={v => setFeedbacks(prev => prev.map(item => item.id === f.id ? { ...item, mission: v } : item))} placeholder="Titre de la mission..." />
                  <FormField label="Satisfactions" value={f.satisfactionItems} onChange={v => setFeedbacks(prev => prev.map(item => item.id === f.id ? { ...item, satisfactionItems: v } : item))} placeholder="Ce qui a plu au client..." />
                  <FormField label="Axes de progrès" value={f.improvementAxes} onChange={v => setFeedbacks(prev => prev.map(item => item.id === f.id ? { ...item, improvementAxes: v } : item))} placeholder="Points à améliorer..." />
                  <FormField label="Recommendation" value={f.recommendation} onChange={v => setFeedbacks(prev => prev.map(item => item.id === f.id ? { ...item, recommendation: v } : item))} placeholder="Commentaires finaux..." />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
