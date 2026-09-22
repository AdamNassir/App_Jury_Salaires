import { jsPDF } from 'jspdf';
import { UserProfile, Dossier, AnnualReport, ClientFeedback } from '../types';

export function generateDossierPDF(
  profile: UserProfile,
  dossier: Partial<Dossier> | null | undefined,
  reportData: AnnualReport,
  feedbacks: ClientFeedback[]
): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = 20;
    }
  };

  // Header Banner
  doc.setFillColor(13, 102, 194); // Primary Blue (#0D66C2)
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('LOGICLEVER - DOSSIER DE PROMOTION 2025', margin, 12);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Candidat : ${profile.displayName || profile.email || 'Anonyme'}`, margin, 20);
  doc.text(`Généré le : ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, pageWidth - margin, 20, { align: 'right' });

  y = 36;

  // Title Section
  doc.setTextColor(27, 42, 74); // Accent navy
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('1. Informations Générales & Synthèse', margin, y);
  y += 6;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Key Stats Grid
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y, contentWidth, 24, 3, 3, 'F');

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('GRADE ACTUEL', margin + 5, y + 6);
  doc.text('GRADE SOUHAITÉ', margin + 45, y + 6);
  doc.text('SALAIRE ACTUEL', margin + 95, y + 6);
  doc.text('SALAIRE SOUHAITÉ', margin + 140, y + 6);

  doc.setFontSize(11);
  doc.setTextColor(27, 42, 74);
  doc.setFont('helvetica', 'bold');
  doc.text(profile.currentGrade || reportData.currentGrade || 'Non renseigné', margin + 5, y + 14);
  doc.text(reportData.wishedGrade || 'Non renseigné', margin + 45, y + 14);
  doc.text(`${profile.currentSalary || reportData.currentSalary || 0} €`, margin + 95, y + 14);
  doc.text(`${reportData.wishedSalary || 0} €`, margin + 140, y + 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`TJ Vendu : ${profile.currentTJM || reportData.currentTJM || 0} €`, margin + 5, y + 20);
  doc.text(`TJM Cible : ${reportData.targetTJM || 0} €`, margin + 45, y + 20);

  y += 30;

  // Function to add a section with heading and multi-line body text
  const addTextSection = (title: string, text: string) => {
    checkPageBreak(18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(13, 102, 194);
    doc.text(title, margin, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);

    const lines = doc.splitTextToSize(text || 'Non renseigné', contentWidth);
    checkPageBreak(lines.length * 4.5 + 4);
    doc.text(lines, margin, y);
    y += lines.length * 4.5 + 6;
  };

  addTextSection('Synthèse de l\'année', reportData.yearSummary);
  addTextSection('Fiche de synthèse globale', reportData.synthesis);

  // Objectives Section
  if (reportData.previousObjectives && reportData.previousObjectives.length > 0) {
    checkPageBreak(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(27, 42, 74);
    doc.text('2. Bilan des Objectifs de l\'Année Écoulée', margin, y);
    y += 6;

    reportData.previousObjectives.forEach((obj, idx) => {
      checkPageBreak(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const statusText = obj.reached === 'OUI' ? '[ATTEINT]' : obj.reached === 'NON' ? '[NON ATTEINT]' : '[PARTIEL]';
      doc.setTextColor(obj.reached === 'OUI' ? 34 : 180, obj.reached === 'OUI' ? 139 : 40, obj.reached === 'OUI' ? 34 : 40);
      doc.text(`Objectif ${idx + 1} ${statusText} : ${obj.objective || '-'}`, margin, y);
      y += 5;

      if (obj.comments) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        const lines = doc.splitTextToSize(`Commentaires : ${obj.comments}`, contentWidth - 5);
        checkPageBreak(lines.length * 4 + 2);
        doc.text(lines, margin + 5, y);
        y += lines.length * 4 + 4;
      }
    });
    y += 4;
  }

  // Expertises & Missions
  checkPageBreak(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(27, 42, 74);
  doc.text('3. Expertises & Activités', margin, y);
  y += 6;

  addTextSection('Savoir-faire identifiés & Développés', reportData.knowHow);
  addTextSection('Formations suivies & Souhaitées', reportData.training);
  addTextSection('Progression Métier', reportData.progressionDetails);
  addTextSection('Logiciels & Technologies maîtrisés', reportData.techDetails);
  addTextSection('Certifications obtenues / visées', reportData.certificationsDetail);
  addTextSection('Livrables marquants de l\'année', reportData.deliverables);

  // Engagement & Vie Logiclever
  checkPageBreak(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(27, 42, 74);
  doc.text('4. Engagement & Autonomie', margin, y);
  y += 6;

  addTextSection(`Niveau d'autonomie (Niveau ${reportData.autonomyLevel || '-'})`, reportData.autonomyJustification);
  addTextSection('Propositions & Conseils apportés au Client', reportData.commercialAdvice);
  addTextSection(`Investissement Interne (${reportData.internalInvestment || 0}%) & Vie Logiclever`, reportData.lifeLogiclever);

  // Client Feedbacks / Météos
  if (feedbacks && feedbacks.length > 0) {
    checkPageBreak(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(27, 42, 74);
    doc.text('5. Météos & Retours Clients', margin, y);
    y += 6;

    feedbacks.forEach((fb, idx) => {
      checkPageBreak(22);
      doc.setFillColor(245, 247, 250);
      doc.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(13, 102, 194);
      doc.text(`Client ${idx + 1} : ${fb.client || 'Client anonyme'}`, margin + 4, y + 6.5);
      doc.text(`Note Client : ${fb.clientRating || '-'}/10  |  Note Consultant : ${fb.consultantRating || '-'}/10`, pageWidth - margin - 4, y + 6.5, { align: 'right' });
      y += 13;

      if (fb.mission) {
        addTextSection('Mission', fb.mission);
      }
      if (fb.satisfactionItems) {
        addTextSection('Points de satisfaction', fb.satisfactionItems);
      }
      if (fb.improvementAxes) {
        addTextSection('Axes d\'amélioration', fb.improvementAxes);
      }
    });
  }

  // Future Objectives & Salary Expectations
  checkPageBreak(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(27, 42, 74);
  doc.text('6. Objectifs Futurs & Prétentions Financières', margin, y);
  y += 6;

  addTextSection('Projections de Carrière (Moyen terme)', reportData.careerGoals);

  if (reportData.nextObjectives && reportData.nextObjectives.length > 0) {
    checkPageBreak(15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(13, 102, 194);
    doc.text('Objectifs Court-Terme (SMART) :', margin, y);
    y += 5;

    reportData.nextObjectives.forEach((obj, idx) => {
      const objText = `• Objectif ${idx + 1} : ${obj.objective || '-'}
  Afin de : ${obj.benefit || '-'}
  Moyens : ${obj.means || '-'}
  Mesures : ${obj.measures || '-'}`;
      addTextSection('', objText);
    });
  }

  addTextSection('Commentaires sur les prétentions financières', reportData.salaryExpectations);

  // Footer on each page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Document généré automatiquement - Logiclever Promotion 2025 - Page ${i} sur ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }

  return doc.output('datauristring');
}
