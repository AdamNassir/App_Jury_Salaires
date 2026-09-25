import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Maximize2, X, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Satisfaction } from '../../types';

export function DataBox({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="space-y-2">
      <div className="text-[9px] font-black uppercase tracking-widest text-accent/30">{label}</div>
      <div className="text-xl font-bold text-secondary tracking-tighter">{value || '-'}</div>
    </div>
  );
}

export function Section({ 
  title, 
  subtitle,
  children, 
  action 
}: { 
  title: string; 
  subtitle?: React.ReactNode;
  children: React.ReactNode; 
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white p-12 rounded-xl border border-accent/10 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl" />
      <div className="relative mb-8 border-b border-accent/10 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-secondary">{title}</h2>
            {subtitle && (
              <p className="text-xs sm:text-sm text-accent/60 font-medium mt-1.5 leading-relaxed max-w-3xl">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

export function TabButton({
  active,
  onClick,
  label,
  count,
  required,
  badge
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  required?: boolean;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-6 py-4 rounded-xl text-xs font-bold transition-all flex items-center justify-between group uppercase tracking-widest",
        active ? "bg-primary text-white shadow-xl shadow-primary/20 scale-105" : "hover:bg-accent/5 text-accent/60"
      )}
    >
      <span className="flex items-center gap-1.5 flex-wrap">
        <span>{label}</span>
        {badge && (
          <span className={cn(
            "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider",
            active ? "bg-white text-primary" : "bg-primary/10 text-primary"
          )}>
            {badge}
          </span>
        )}
        {required && <span className="text-red-500 font-bold ml-0.5">*</span>}
      </span>
      {count !== undefined && (
        <span className={cn("px-2 py-0.5 rounded-full text-[9px]", active ? "bg-white/20" : "bg-accent/5")}>
          {count}
        </span>
      )}
      <ChevronRight className={cn("w-4 h-4 opacity-40 transition-transform", active && "rotate-90 opacity-100")} />
    </button>
  );
}

export function SatisfactionPicker({
  label,
  value,
  onChange
}: {
  label: string;
  value: Satisfaction['tasks'];
  onChange: (v: Satisfaction['tasks']) => void;
}) {
  const options = [
    { v: 'TR' as const, e: '😡' },
    { v: 'M' as const, e: '😐' },
    { v: 'C' as const, e: '😊' },
    { v: 'S' as const, e: '😁' }
  ];
  return (
    <div className="space-y-4">
      <label className="block text-[10px] font-black text-accent/30 uppercase tracking-widest">{label}</label>
      <div className="flex gap-4">
        {options.map(o => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all border-2",
              value === o.v ? "bg-white border-primary shadow-lg scale-110" : "bg-white border-accent/5 grayscale"
            )}
          >
            {o.e}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FormField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  tooltip,
  required,
  maxLength = 2000,
  labelHref
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  tooltip?: string;
  required?: boolean;
  maxLength?: number;
  labelHref?: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTextChange = (text: string) => {
    const sanitized = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').slice(0, maxLength);
    onChange(sanitized);
  };

  const charCount = (value || '').length;

  return (
    <div className="w-full relative group">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-2">
          {labelHref ? (
            <a
              href={labelHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[10px] font-black text-accent/50 hover:text-primary uppercase tracking-[0.2em] transition-colors group/link hover:underline"
              title="Ouvrir le document associé dans un nouvel onglet"
            >
              <span>{label}</span>
              <ExternalLink className="w-3 h-3 text-primary/70 group-hover/link:text-primary transition-transform group-hover/link:translate-x-0.5 shrink-0" />
              {required && <span className="text-red-500 font-bold ml-1">*</span>}
            </a>
          ) : (
            <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">
              {label} {required && <span className="text-red-500 font-bold ml-1">*</span>}
            </label>
          )}
          {tooltip && (
            <div className="relative">
              <button
                type="button"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="text-accent/20 hover:text-primary transition-colors"
              >
                <AlertCircle className="w-3.5 h-3.5" />
              </button>
              <AnimatePresence>
                {showTooltip && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-accent text-white text-[10px] rounded-base shadow-xl z-50 pointer-events-none"
                  >
                    {tooltip}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-accent" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span
            className={cn(
              "text-[9px] font-semibold",
              charCount > maxLength * 0.9 ? "text-amber-500" : "text-accent/30"
            )}
          >
            {charCount}/{maxLength}
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center gap-1.5 text-[9px] font-black text-secondary uppercase tracking-widest hover:text-secondary-dark transition-all px-2.5 py-1 bg-secondary/5 hover:bg-secondary/15 rounded-md"
            title="Agrandir ce bloc"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Agrandir</span>
          </button>
        </div>
      </div>

      <textarea
        value={value || ''}
        maxLength={maxLength}
        onChange={e => handleTextChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full p-6 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 min-h-[120px] text-lg font-light resize-none transition-all disabled:opacity-50 placeholder:text-accent/10"
      />

      <AnimatePresence>
        {isExpanded && (
          <div
            className="fixed inset-0 bg-accent/60 backdrop-blur-sm flex items-center justify-center p-6 z-[100]"
            onClick={() => setIsExpanded(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl border border-accent/10 shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden"
            >
              <div className="p-8 border-b border-accent/10 bg-accent/5 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xl font-bold text-accent tracking-tight">{label}</h3>
                  <p className="text-[10px] text-accent/40 uppercase tracking-[0.2em] font-black mt-1">
                    Lecture et édition plein écran
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-accent/40 font-mono">
                    {charCount}/{maxLength}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsExpanded(false)}
                    className="p-2 hover:bg-accent/5 rounded-full text-accent/40 hover:text-accent transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-8 flex flex-col min-h-0">
                <textarea
                  value={value || ''}
                  maxLength={maxLength}
                  onChange={e => handleTextChange(e.target.value)}
                  placeholder={placeholder}
                  disabled={disabled}
                  className="w-full h-full flex-1 p-8 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-light resize-none transition-all outline-none placeholder:text-accent/10 custom-scrollbar leading-relaxed"
                  autoFocus
                />
              </div>

              <div className="p-6 bg-accent/5 border-t border-accent/10 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="px-8 py-4 bg-secondary hover:bg-secondary/90 text-white rounded-base text-[10px] font-black uppercase tracking-widest transition-all shadow-md"
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  required,
  min = 0,
  max = 999999,
  step = 1,
  tooltip
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
}) {
  const [localStr, setLocalStr] = useState<string>(value ? String(value) : '');
  const [isFocused, setIsFocused] = useState<boolean>(false);

  useEffect(() => {
    if (!isFocused) {
      setLocalStr(value ? String(value) : '');
    }
  }, [value, isFocused]);

  const effectiveMin = Math.max(0, min);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalStr(raw);
    if (raw === '') {
      return;
    }
    const num = Number(raw);
    if (!isNaN(num)) {
      onChange(Math.max(effectiveMin, Math.min(max, num)));
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (localStr === '' || isNaN(Number(localStr))) {
      setLocalStr(String(effectiveMin));
      onChange(effectiveMin);
      return;
    }
    const num = Number(localStr);
    const clamped = Math.max(effectiveMin, Math.min(max, num));
    setLocalStr(String(clamped));
    onChange(clamped);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 px-2">
        <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em]">
          {label} {required && <span className="text-red-500 font-bold ml-1">*</span>}
        </label>
        {tooltip && (
          <span className="text-[10px] text-accent/40 font-medium italic">{tooltip}</span>
        )}
      </div>
      <input
        type="number"
        min={effectiveMin}
        max={max}
        step={step}
        value={isFocused ? localStr : (value ? String(value) : '')}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        onChange={handleChange}
        className="w-full p-6 bg-accent/5 rounded-xl border border-accent/10 focus:border-secondary focus:ring-0 text-xl font-bold tracking-tight transition-all"
      />
    </div>
  );
}
