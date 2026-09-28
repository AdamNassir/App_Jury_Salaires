import React from 'react';

export function GradeCriteriaTable() {
  const grades = [
    {
      grade: 'Junior',
      experience: '0 - 2 ans',
      savoirFaire: '<= 530',
      autonomie: '+',
      venteCommercial: '+',
      vieLogiclever: '++',
      recrutement: '++',
      encadrement: ''
    },
    {
      grade: 'Confirmé',
      experience: '2 - 5 ans',
      savoirFaire: '535 - 565',
      autonomie: '++',
      venteCommercial: '++',
      vieLogiclever: '+++',
      recrutement: '++',
      encadrement: ''
    },
    {
      grade: 'Sénior',
      experience: '5 - 8 ans',
      savoirFaire: '570 - 645',
      autonomie: '+++',
      venteCommercial: '+++',
      vieLogiclever: '++',
      recrutement: '++',
      encadrement: '+'
    },
    {
      grade: 'Expert',
      experience: '> 8 ans',
      savoirFaire: '>= 650',
      autonomie: '++++',
      venteCommercial: '+++',
      vieLogiclever: '++',
      recrutement: '+++',
      encadrement: '+++'
    }
  ];

  return (
    <div className="space-y-3 mb-6">
      <div className="p-3.5 bg-amber-500/10 border-l-4 border-amber-500 rounded-r-lg">
        <p className="text-sm font-bold text-accent tracking-wide leading-snug">
          Indiquer de manière factuelle (avec exemple précis) les actions réalisées dans l’année qui permettent de mieux vous valoriser en mission
        </p>
      </div>
      <div className="w-full bg-white rounded-xl border border-accent/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px] text-xs">
            <thead>
              <tr className="bg-accent/5 border-b border-accent/10 text-accent font-black tracking-wider uppercase text-[10px]">
                <th className="py-3 px-3">Grade</th>
                <th className="py-3 px-3">Expérience</th>
                <th className="py-3 px-3">Savoir-faire<br /><span className="text-[8px] font-normal normal-case text-accent/60">(Capacité à être vendu dans la fourchette)</span></th>
                <th className="py-3 px-2 text-center">Autonome en mission</th>
                <th className="py-3 px-2 text-center">Vente / Commercial</th>
                <th className="py-3 px-2 text-center">Vie Logiclever</th>
                <th className="py-3 px-2 text-center">Recrutement</th>
                <th className="py-3 px-2 text-center">Accompagnement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/5 text-accent font-medium">
              {grades.map((row) => (
                <tr key={row.grade} className="hover:bg-accent/[0.02] transition-colors">
                  <td className="py-2.5 px-3 font-bold text-secondary">{row.grade}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-accent/80">{row.experience}</td>
                  <td className="py-2.5 px-3 font-bold text-accent tabular-nums">{row.savoirFaire}</td>
                  <td className="py-2.5 px-2 text-center font-bold text-primary">{row.autonomie || '-'}</td>
                  <td className="py-2.5 px-2 text-center font-bold text-primary">{row.venteCommercial || '-'}</td>
                  <td className="py-2.5 px-2 text-center font-bold text-primary">{row.vieLogiclever || '-'}</td>
                  <td className="py-2.5 px-2 text-center font-bold text-primary">{row.recrutement || '-'}</td>
                  <td className="py-2.5 px-2 text-center font-bold text-primary">{row.encadrement || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
