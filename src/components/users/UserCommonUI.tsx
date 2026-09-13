import React from 'react';
import { UserRole } from '../../types';
import { Shield } from 'lucide-react';
import { cn } from '../../lib/utils';

export function RoleBadge({ role }: { role: UserRole }) {
  const styles: Record<UserRole, string> = {
    EVALUATOR: 'Évaluateur',
    CANDIDATE: "bg-secondary/10 text-secondary border-secondary/20",
    JURY: "bg-accent text-white border-accent",
    ADMIN: "bg-purple-700 text-white border-purple-800"
  };
  const labels: Record<UserRole, string> = {
    EVALUATOR: 'bg-blue-100 text-blue-700',
    CANDIDATE: "Candidat & Évaluateur",
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
    onSave(val.toString());
  };

  return (
    <div className="w-full">
      <label className="block text-[10px] font-black text-accent/30 uppercase tracking-[0.2em] mb-4 px-2">{label}</label>
      <input 
        type={type}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={handleBlur}
        className="w-full bg-accent/5 border border-accent/10 rounded-base px-5 py-4 text-sm font-bold text-accent focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all outline-none shadow-inner"
      />
    </div>
  );
}
