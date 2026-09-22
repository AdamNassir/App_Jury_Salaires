import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, Maximize2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Dossier } from '../../types';

export function AccordionSection({ 
  label, 
  isOpen, 
  onToggle, 
  count, 
  highlight, 
  tabMode,
  children 
}: { 
  label: string; 
  isOpen: boolean; 
  onToggle: () => void; 
  count?: number; 
  highlight?: boolean; 
  tabMode?: boolean;
  children: React.ReactNode; 
}) {
  if (tabMode && !isOpen) return null;

  return (
    <div className={cn(
      "border border-accent/10 rounded-xl overflow-hidden shadow-sm transition-all",
      isOpen ? "bg-white ring-1 ring-primary/15" : "bg-accent/[0.02]"
    )}>
      {!tabMode && <button
        onClick={onToggle}
        className={cn(
          "w-full px-8 py-5 flex items-center justify-between transition-all text-left",
          highlight 
            ? "bg-accent text-white" 
            : "hover:bg-accent/[0.04] bg-white"
        )}
      >
        <div className="flex items-center gap-4">
          <span className={cn(
            "text-xs font-black uppercase tracking-[0.2em]",
            highlight ? "text-white" : "text-accent/80"
          )}>
            {label}
          </span>
          {count !== undefined && count > 0 && (
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[9px] font-black",
              highlight ? "bg-white/20 text-white" : "bg-primary/10 text-primary border border-primary/10"
            )}>
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ChevronRight className={cn(
            "w-5 h-5 transition-transform duration-300",
            isOpen ? "rotate-90" : "rotate-0",
            highlight ? "text-white/60" : "text-accent/30"
          )} />
        </div>
      </button>}

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className={tabMode ? "" : "border-t border-accent/5"}
          >
            <div className="p-8">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ReportSection({ 
  title, 
  content, 
  noBg, 
  onZoom 
}: { 
  title: string; 
  content?: string; 
  noBg?: boolean; 
  onZoom?: (data: { title: string; content: string }) => void; 
}) {
  return (
    <div className="space-y-3 group/report flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <h5 className="text-[10px] font-black text-accent/30 uppercase tracking-widest">{title}</h5>
        {content && onZoom && (
          <button
            type="button"
            onClick={() => onZoom({ title, content })}
            className="opacity-0 group-hover/report:opacity-100 focus:opacity-100 flex items-center gap-1.5 text-[9px] font-black text-secondary uppercase tracking-widest hover:text-secondary-dark transition-all px-2.5 py-1 bg-secondary/5 hover:bg-secondary/15 rounded-md cursor-pointer"
            title="Agrandir ce bloc"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Agrandir</span>
          </button>
        )}
      </div>
      <div className={cn(
        "p-6 rounded-xl text-base text-accent/70 leading-relaxed font-light min-h-[60px] flex-1",
        noBg ? "" : "bg-white border border-accent/10 shadow-sm"
      )}>
        {content || <span className="text-accent/20 italic">Non renseigné</span>}
      </div>
    </div>
  );
}

export function SatisfactionDisplay({ label, value }: { label: string; value: string }) {
  const emojis: Record<string, string> = { 'TR': '😡', 'M': '😐', 'C': '😊', 'S': '😁' };
  const labels: Record<string, string> = { 'TR': 'Très Insatisfait', 'M': 'Moyen', 'C': 'Satisfait', 'S': 'Très Satisfait' };
  
  return (
    <div className="p-4 bg-white border border-accent/10 rounded-xl shadow-sm text-center">
      <div className="text-[8px] font-black text-accent/30 uppercase mb-2">{label}</div>
      <div className="text-2xl mb-1">{emojis[value] || '❓'}</div>
      <div className="text-[8px] font-bold text-accent/40">{labels[value] || 'N/A'}</div>
    </div>
  );
}

export function SummaryCard({ 
  label, 
  content, 
  highlight, 
  icon, 
  subtext 
}: { 
  label: string; 
  content?: string; 
  highlight?: boolean; 
  icon?: React.ReactNode; 
  subtext?: string; 
}) {
  return (
    <div className={cn("p-6 rounded-xl border transition-all shadow-xl flex flex-col justify-between", highlight ? "bg-accent border-accent text-white shadow-accent/20" : "bg-white border-accent/10")}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <label className={cn("text-[9px] font-black uppercase tracking-[0.2em] block", highlight ? "text-white/40" : "text-accent/30")}>
            {label}
          </label>
          {icon && <div className={cn("opacity-20", highlight ? "text-white" : "text-primary")}>{icon}</div>}
        </div>
        <div className={cn("text-2xl font-bold tracking-tight truncate", highlight ? "text-white" : "text-accent")}>
          {content || 'N/A'}
        </div>
      </div>
      {subtext && (
        <div className={cn("mt-4 text-[10px] font-medium border-t pt-3 truncate", highlight ? "text-white/40 border-white/10" : "text-accent/30 border-accent/5")}>
          {subtext}
        </div>
      )}
    </div>
  );
}

export function StatusPill({ status }: { status: Dossier['status'] }) {
  const styles = {
    OUVERT: "text-secondary bg-secondary/5 border-secondary/10",
    COMPLET: "text-primary bg-primary/5 border-primary/10",
    VALIDE: "text-green-600 bg-green-50 border-green-100"
  };
  return (
    <span className={cn("px-6 py-2 rounded-base text-[10px] font-black uppercase tracking-[0.2em] border shadow-sm", styles[status])}>
      {status === 'OUVERT' ? 'Ouvert' : status === 'COMPLET' ? 'Complet' : 'Clôturé'}
    </span>
  );
}

export function FilterSelect({ 
  value, 
  onChange, 
  options 
}: { 
  value: string; 
  onChange: (v: string) => void; 
  options: { label: string; value: string }[]; 
}) {
  return (
    <select 
      value={value} 
      onChange={e => onChange(e.target.value)}
      className="bg-white border border-accent/10 rounded-base px-6 py-3 text-[11px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer shadow-sm"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function JuryZoomModal({
  zoomData,
  onClose
}: {
  zoomData: { title: string; content: string } | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {zoomData && (
        <div 
          className="fixed inset-0 bg-accent/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100] cursor-pointer" 
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl border border-accent/10 shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden cursor-default"
          >
            {/* Header */}
            <div className="p-8 border-b border-accent/10 bg-accent/5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xl font-bold text-accent tracking-tight">{zoomData.title}</h3>
                <p className="text-[10px] text-accent/40 uppercase tracking-[0.2em] font-black mt-1">Lecture plein écran</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-3 hover:bg-accent/5 rounded-xl transition-colors text-accent/40 hover:text-accent cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-8 flex-1 overflow-y-auto bg-white custom-scrollbar">
              <div className="text-lg text-accent/80 leading-relaxed font-light whitespace-pre-wrap font-sans">
                {zoomData.content}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
