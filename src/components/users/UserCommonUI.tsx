import React from 'react';
import { UserRole } from '../../types';
import { Shield } from 'lucide-react';
import { cn } from '../../lib/utils';

export function RoleBadge({ role }: { role: UserRole }) {
  const styles: Record<UserRole, string> = {
    CANDIDATE: "bg-secondary/10 text-secondary border-secondary/20",
    EVALUATOR: "bg-amber-100 text-amber-900 border-amber-300",
    JURY: "bg-accent text-white border-accent",
    ADMIN: "bg-purple-700 text-white border-purple-800"
  };
  const labels: Record<UserRole, string> = {
    CANDIDATE: "Candidat",
    EVALUATOR: "Évaluateur",
    JURY: "Membre Jury",
    ADMIN: "Administrateur"
  };
  return (
    <span className={cn("px-4 py-1.5 rounded-base text-[10px] font-black uppercase tracking-[0.2em] inline-flex items-center gap-2 border shadow-sm", styles[role] || "bg-accent text-white border-accent")}>
      <Shield className="w-3.5 h-3.5" />
      {labels[role] || role}
    </span>
  );
}

export function PersonneTypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  const styles: Record<string, string> = {
    COLLABORATEUR: "bg-blue-50 text-blue-700 border-blue-200",
    ASSOCIE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    FREELANCE: "bg-amber-50 text-amber-700 border-amber-200",
    EXTERNE: "bg-slate-100 text-slate-700 border-slate-200"
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border", styles[type] || "bg-gray-100 text-gray-700 border-gray-200")}>
      {type}
    </span>
  );
}

export function ProfileField({ 
  label, 
  value, 
  onSave, 
  type = "text" 
}: { 
  label: string; 
  value: string | number; 
  onSave: (v: string) => void; 
  type?: string; 
}) {
  const [val, setVal] = React.useState(value);

  React.useEffect(() => {
    setVal(value);
  }, [value]);

  const handleBlur = () => {
    if (type === "number") {
      const num = parseFloat(val.toString());
      const clamped = isNaN(num) ? 0 : Math.max(0, num);
      setVal(clamped);
      onSave(clamped.toString());
    } else {
      onSave(val.toString());
    }
  };

  return (
    <div className="w-full">
      <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4 px-2">{label}</label>
      <input 
        type={type}
        min={type === "number" ? 0 : undefined}
        value={val}
        onChange={e => {
          if (type === "number") {
            const num = parseFloat(e.target.value);
            setVal(isNaN(num) ? '' : Math.max(0, num));
          } else {
            setVal(e.target.value);
          }
        }}
        onBlur={handleBlur}
        className="w-full bg-accent/5 border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all outline-none shadow-inner"
      />
    </div>
  );
}
