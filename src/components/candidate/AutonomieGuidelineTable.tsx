import React from 'react';

export function AutonomieGuidelineTable() {
  const levels = [
    {
      grade: 'Junior',
      description: [
        'Nécessite des connaissances simples sur des procédures basiques et répétitives',
        'Faculté à suivre les instructions',
        "Mets en application les compétences professionnelles nécessaires et les procédures d'entreprise afin de finaliser les tâches confiées",
        'Travail sur des directives plutôt routinières en règle générale mais à la capacité de pouvoir dévier de manière occasionnelle des pratiques métiers afin de mener à bien la mission.'
      ],
      supervision: [
        'Travail sous un faible degré de supervision',
        'Normalement, suit les procédures établies lors de travail routiniers',
        'Nécessite de la formation uniquement sur les nouvelles tâches.'
      ]
    },
    {
      grade: 'Confirmé',
      description: [
        'Nécessite des connaissances semi-qualifiées des procédures basiques et répétitives',
        'Faculté à suivre les instructions',
        'Compréhension substantielle des tâches et mise en application des compétences professionnelles nécessaires afin de finaliser une large liste de tâches variées',
        'Travail sur des directives peu difficiles en règle générale mais nécessitant du jugement afin de résoudre les problématiques ou effectuer des recommandations afin de mener à bien la mission.'
      ],
      supervision: [
        'Travail sous un degré de supervision limité',
        'Travail comme ressource et support informelle pour des collègues moins expérimentés',
        "Normalement, reçoit peu d'instructions sur le travail quotidien, reçoit des instructions génériques sur des procédures les nouvelles tâches."
      ]
    },
    {
      grade: 'Senior',
      description: [
        'Nécessite des connaissances très qualifiées des procédures techniques afin de résoudre des problématiques complexes et une large palette de problématiques techniques',
        'En tant que spécialiste métier, complètes des tâches en parfaite autonomie de manière efficace',
        "Travail sur des tâches nécessitant une très grande capacité de décision et d'initiative afin de résoudre les problématiques",
        'Comprend les implications requises dans les travaux et effectue les recommandations appropriées afin de mener à bien la mission.'
      ],
      supervision: [
        'Travail en autonomie sur les procédures et pratiques établies',
        'Détermine les méthodes et les procédures sur les nouvelles tâches',
        "Peut être un responsable d'équipe informel afin de coordonner le travail d'autres collègues."
      ]
    },
    {
      grade: 'Expert*',
      description: [
        "Nécessite des connaissances très qualifiées et un niveau d'expertise très élevé sur les procédures techniques avangardistes afin de résoudre des problématiques spécifiques",
        "En tant qu'expert métier, contribue au développement de concepts et de techniques dédiées",
        "Réalise des tâches complexes de manière créative et efficace",
        "Travail en permanence sur des tâches complexes nécessitant une parfaite autonomie et un très haut degré de prise d'initiatives afin de résoudre les problématiques",
        "Effectue les recommandations pour les nouvelles procédures."
      ],
      supervision: [
        "Travail en indépendance afin de déterminer les méthodes et procédures à mettre en place sur les nouvelles tâches",
        "Intervient souvent comme facilitateur et responsable d'équipe pour une seule ou plusieurs équipes",
        "Performant dans une multitude de tâches souvent complexes."
      ]
    }
  ];

  return (
    <div className="space-y-4 mb-6">
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl text-accent font-semibold text-sm leading-relaxed">
        À la lecture du tableau ci-dessous, diriez-vous que vous avez agi sur votre (vos) missions comme un “Junior”, “Confirmé”, “Sénior” ou “Expert” ? Expliciter.
      </div>
      <div className="w-full bg-white rounded-xl border border-accent/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px] text-xs">
            <thead>
              <tr className="bg-accent/5 border-b border-accent/10 text-accent font-black tracking-wider uppercase text-[10px]">
                <th className="py-3 px-4 w-32">Grade</th>
                <th className="py-3 px-4 w-1/2">Description expertise</th>
                <th className="py-3 px-4">Supervision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-accent/10 text-accent font-medium">
              {levels.map((lvl) => (
                <tr key={lvl.grade} className="hover:bg-accent/[0.02] transition-colors align-top">
                  <td className="py-3 px-4 font-bold text-secondary">{lvl.grade}</td>
                  <td className="py-3 px-4 text-accent/80 space-y-1.5 leading-relaxed">
                    {lvl.description.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        <span className="text-accent/40 font-bold">•</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </td>
                  <td className="py-3 px-4 text-accent/80 space-y-1.5 leading-relaxed">
                    {lvl.supervision.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        <span className="text-accent/40 font-bold">•</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
