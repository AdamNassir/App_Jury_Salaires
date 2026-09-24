import { jsPDF } from 'jspdf';
import { AnnualReport, ClientFeedback, Dossier, UserProfile } from '../types';

type PdfField = { label: string; value: unknown };
const hasValue = (value: unknown) => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');

export function generateDossierPDF(
  profile: UserProfile,
  dossier: Partial<Dossier> | null | undefined,
  reportData: AnnualReport,
  feedbacks: ClientFeedback[]
): string {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - 14) return;
    doc.addPage();
    y = 18;
  };
  const title = (text: string) => {
    ensureSpace(13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(27, 42, 74);
    doc.text(text, margin, y);
    y += 4;
    doc.setDrawColor(210, 220, 235);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  };
  const field = (label: string, value: unknown) => {
    if (!hasValue(value)) return;
    const labelLines = doc.splitTextToSize(label, contentWidth);
    const valueLines = doc.splitTextToSize(String(value).trim(), contentWidth);
    ensureSpace((labelLines.length + valueLines.length) * 4 + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(13, 102, 194);
    doc.text(labelLines, margin, y);
    y += labelLines.length * 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(45, 50, 60);
    doc.text(valueLines, margin, y);
    y += valueLines.length * 4 + 4;
  };
  const section = (name: string, fields: PdfField[]) => {
    const populated = fields.filter(item => hasValue(item.value));
    if (!populated.length) return;
    title(name);
    populated.forEach(item => field(item.label, item.value));
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(27, 42, 74);
  doc.text('Bilan Annuel', margin, y);
  y += 8;
  field('Candidat', profile.displayName || profile.email);

  section('Synthèse', [
    { label: 'Synthèse de l’année (01/07 au 30/06)', value: reportData.yearSummary },
  ]);

  const previousObjectives = reportData.previousObjectives || [];
  if (previousObjectives.some(item => hasValue(item.objective) || hasValue(item.comments))) {
    title("Objectifs de l'année précédente");
    previousObjectives.forEach((item, index) => {
      if (!hasValue(item.objective) && !hasValue(item.comments)) return;
      field(`Objectif ${index + 1}`, item.objective);
      field('Commentaires', item.comments);
      field('Atteint', item.reached);
    });
  }

  const skillFields: PdfField[] = [
    { label: 'CV', value: reportData.cv?.name },
    { label: 'Type de profil', value: reportData.skillsProfileType },
    { label: 'XP', value: reportData.skillsExperience },
    { label: 'Principaux livrables réalisés', value: reportData.skillsDeliverables },
    { label: "Etape d'un projet", value: reportData.skillsProjectStage },
  ];
  Object.entries(reportData.skillsDetails || {}).forEach(([category, details]) => {
    if (!details || !Object.values(details).some(hasValue)) return;
    skillFields.push(
      { label: 'Compétence / Connaissance', value: category },
      { label: 'Exp', value: details.exp },
      { label: 'Niveau', value: details.level },
      { label: 'Résumé', value: details.summary },
      { label: 'Rôle', value: details.role },
    );
  });
  skillFields.push(
    { label: 'Sur quelles compétences métier / applicatifs ?', value: reportData.progressionDetails },
    { label: 'Sur quels logiciels / technologies ?', value: reportData.techDetails },
    { label: 'Avez-vous de nouvelles certifications ?', value: reportData.certificationsDetail },
    { label: 'Préparation / Animation de réunion ?', value: reportData.meetingPrep },
    { label: 'Quels livrables avez-vous faits ?', value: reportData.deliverables },
  );
  section('Savoir-faire', skillFields);

  const missions = reportData.missionClients || [];
  if (missions.some(row => Object.values(row).some(hasValue))) {
    title('Autonomie en mission');
    missions.forEach((row, index) => {
      if (!Object.values(row).some(hasValue)) return;
      field(`Client ${index + 1}`, row.client);
      field('Actions dans le cadre de la mission (en qq mots)', row.actions);
      field('Grade', row.grade);
      field('Commentaire', row.comment);
    });
  }

  section('Vente/commercial', [
    { label: 'Avez-vous pu présenter Logiclever (Qui on est ?, nos offres ?, Nos valeurs ?)', value: reportData.commercialPresentation },
    { label: 'Quels conseils avez-vous donnés à vos clients ?', value: reportData.commercialAdvice },
    { label: 'Avez-vous été force de proposition ? Exemple de valeur ajoutée que vous avez apporté à vos clients', value: reportData.commercialProposition },
    { label: 'Quelles propositions commerciales avez-vous faites ?', value: reportData.commercialOffers },
  ]);
  section('Vie LogicLever', [
    { label: 'Capitalisation de connaissance et Amélioration continue (Drive)', value: reportData.lifeKnowledgeSharing },
    { label: 'Partage d’information (SLACK)', value: reportData.lifeSlack },
    { label: 'Créer du lien entre consultants / Esprit d’équipe (Pot, journée Logiclever, parrainage…)', value: reportData.lifeTeamSpirit },
    { label: 'Est-ce que je maîtrise le business model de Logiclever (Taux de facturation, marge sur mission…)', value: reportData.lifeBusinessModel },
    { label: 'Autres', value: reportData.lifeLogiclever },
  ]);
  section('Recrutement', [
    { label: 'Promouvoir Logiclever : Avec qui ?, Comment ?', value: reportData.recruitmentPromotion },
    { label: 'Recrutement : Avez vous interviewé des candidats ?', value: reportData.recruitmentInterviews },
    { label: 'Réseaux sociaux : Avez vous ajouté des collègues sur LinkedIn ?, etc', value: reportData.recruitmentSocial },
  ]);
  section('Encadrement', [
    { label: 'Ai-je sollicité mon coach pour m’aider à grandir et avoir des conseils pour aider au développement de Logiclever ?', value: reportData.encadrementCoach },
    { label: 'Ai-je sollicité mon encadrant en mission à chaque fois que nécessaire ? (ex : alerte sur la qualité de mes livrables, j’ai du temps et je pourrai être utile…)', value: reportData.encadrementManager },
  ]);

  const squads = reportData.squadEntries || [];
  if (squads.some(item => hasValue(item.squad) || hasValue(item.contributions))) {
    title('Amélioration Continue');
    squads.forEach((item, index) => {
      if (!hasValue(item.squad) && !hasValue(item.contributions)) return;
      field(`SQUAD ${index + 1}`, item.squad);
      field('Rôle tenu et apports principaux que vous avez apportés à la SQUAD', item.contributions);
    });
  }

  if (reportData.isReferentOrAspiring) {
    const referentFields: PdfField[] = [
      { label: 'Je suis Référent ou souhaite le devenir', value: 'Oui' },
      { label: 'Ai-je animé le On-boarding Logiclever ?', value: reportData.referentOnboardingAnimation },
    ];
    (reportData.referentMissionFollowUps || []).forEach(item => referentFields.push(
      { label: 'Clients', value: item.client },
      { label: 'Quelles météos avez-vous menées ?', value: item.meteosMenees },
      { label: 'Quels sont les principaux points remontés lors des météos ?', value: item.pointsRemontes },
    ));
    (reportData.referentNetworkEntries || []).forEach(item => referentFields.push(
      { label: 'Clients / Prospects', value: item.clientProspect },
      { label: "Principales actions effectuées pour créer/entretenir les liens avec les donneurs d’ordre", value: item.actions },
    ));
    (reportData.referentMissionEncadrements || []).forEach(item => referentFields.push(
      { label: 'Client', value: item.client },
      { label: 'Personne encadrée', value: item.personneEncadree },
      { label: 'Commentaire/Contexte', value: item.commentaire },
    ));
    (reportData.referentCoachingEntries || []).forEach(item => referentFields.push(
      { label: 'Personne coachée', value: item.personneCoachee },
      { label: 'Commentaire/Contexte', value: item.commentaire },
    ));
    (reportData.referentAccountEntries || []).forEach(item => referentFields.push(
      { label: 'Compte', value: item.compte },
      { label: 'Principales actions effectuées', value: item.actions },
    ));
    (reportData.referentOffersEntries || []).forEach(item => referentFields.push(
      { label: 'Offres', value: item.offre },
      { label: 'Quelles offres avez vous développées pour Logiclever', value: item.details },
    ));
    section('Référent LogicLever', referentFields);
  }

  const meteoLinks = Array.isArray(dossier?.meteoLinks) ? dossier.meteoLinks : [];
  if (meteoLinks.length || feedbacks.length) {
    title('Météos Client');
    meteoLinks.forEach((link, index) => field(`Météo ${index + 1}`, link));
    feedbacks.forEach((item, index) => {
      field(`Client ${index + 1}`, item.client);
      field('Mission', item.mission);
      field('Satisfaction', item.satisfactionItems);
      field("Axes d'amélioration", item.improvementAxes);
      field('Perspectives', item.perspectives);
      field('Recommandation', item.recommendation);
    });
  }

  const mediumTerm = reportData.careerGoalsList?.filter(hasValue)
    || (hasValue(reportData.careerGoals) ? [reportData.careerGoals] : []);
  const nextObjectives = reportData.nextObjectives || [];
  if (mediumTerm.length || nextObjectives.some(item => Object.values(item).some(hasValue))) {
    title('Objectifs');
    if (mediumTerm.length) {
      title('Objectifs moyen-terme (Vision / Carrière)');
      mediumTerm.forEach((goal, index) => field(`Objectif ${index + 1}`, goal));
    }
    if (nextObjectives.some(item => Object.values(item).some(hasValue))) {
      title('Les objectifs pour l’année prochaine');
      nextObjectives.forEach((item, index) => {
        if (!Object.values(item).some(hasValue)) return;
        field(`Objectif #${index + 1}`, item.objective);
        field('Bénéfice(s)', item.benefit);
        field('Moyens à mettre en oeuvre', item.means);
        field('Mesures', item.measures);
      });
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140, 150, 165);
    doc.text(`${page} / ${pageCount}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
  }
  return doc.output('datauristring');
}
