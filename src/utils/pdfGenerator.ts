import { jsPDF } from 'jspdf';
import { UserProfile, Dossier, AnnualReport, ClientFeedback, MeteoData } from '../types';

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
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // Déterminer l'année de campagne
  const campaignYear = dossier?.campaignYear || (dossier?.campaignId ? parseInt(dossier.campaignId.replace(/[^0-9]/g, '')) || 2025 : 2025);

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 8) {
      doc.addPage();
      y = 18;
    }
  };

  const drawSectionHeader = (title: string) => {
    checkPageBreak(14);
    doc.setTextColor(27, 42, 74); // Accent navy
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(title, margin, y);
    y += 4;
    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  };

  const drawFieldBox = (label: string, value: string | undefined | null, bg = false) => {
    const textVal = value && value.trim() ? value.trim() : 'Non renseigné';
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 102, 194);
    
    // Label text height
    const labelLines = doc.splitTextToSize(label, contentWidth - 4);
    const labelHeight = labelLines.length * 3.8;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 45, 55);
    const valueLines = doc.splitTextToSize(textVal, contentWidth - 4);
    const valueHeight = valueLines.length * 3.8;

    const totalHeight = labelHeight + valueHeight + 5;
    checkPageBreak(totalHeight + 2);

    if (bg) {
      doc.setFillColor(248, 250, 253);
      doc.setDrawColor(230, 235, 245);
      doc.roundedRect(margin, y, contentWidth, totalHeight, 1.5, 1.5, 'FD');
    }

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(13, 102, 194);
    doc.text(labelLines, margin + 2, y + 3.5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(45, 50, 60);
    doc.text(valueLines, margin + 2, y + 3.5 + labelHeight);

    y += totalHeight + 2.5;
  };

  // --- HEADER BANNER ---
  doc.setFillColor(13, 102, 194); // Primary Blue
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`LOGICLEVER - DOSSIER DE PROMOTION ${campaignYear}`, margin, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Candidat : ${profile.displayName || profile.email || 'Anonyme'}  |  Matricule : ${profile.matricule || 'N/A'}`, margin, 18);
  doc.text(`Généré le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, pageWidth - margin, 18, { align: 'right' });

  y = 33;

  // --- 1. INFORMATIONS GÉNÉRALES & SYNTHÈSE ---
  drawSectionHeader('1. Informations Générales & Synthèse');

  // Key stats box
  doc.setFillColor(245, 248, 253);
  doc.setDrawColor(215, 225, 240);
  doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 115, 135);
  doc.text('GRADE ACTUEL', margin + 4, y + 6);
  doc.text('GRADE SOUHAITÉ', margin + 40, y + 6);
  doc.text('EXPÉRIENCE', margin + 82, y + 6);
  doc.text('ANCIENNETÉ LOGICLEVER', margin + 120, y + 6);

  doc.setFontSize(10);
  doc.setTextColor(27, 42, 74);
  doc.text(profile.currentGrade || 'Junior', margin + 4, y + 13);
  doc.setTextColor(13, 102, 194);
  doc.text(reportData.wishedGrade || profile.currentGrade || 'Junior', margin + 40, y + 13);
  doc.setTextColor(27, 42, 74);
  doc.text(`${profile.experienceYears ?? '-'} an(s)`, margin + 82, y + 13);
  doc.text(`${profile.ancienneteLL ?? '-'} an(s)`, margin + 120, y + 13);

  y += 24;

  if (reportData.yearSummary) {
    drawFieldBox("Résumé synthétique de l'année (Période 1er Juillet - 30 Juin) :", reportData.yearSummary, true);
  }
  if (reportData.synthesis) {
    drawFieldBox("Synthèse globale & Verbatim collaborateur :", reportData.synthesis, true);
  }

  // --- 2. OBJECTIFS DE L'ANNÉE PASSÉE ---
  drawSectionHeader("2. Bilan des Objectifs de l'Année Passée");
  const pastObjs = reportData.previousObjectives || [];
  if (pastObjs.length === 0) {
    drawFieldBox("Objectifs année passée", "Aucun objectif de l'année passée renseigné.", false);
  } else {
    pastObjs.forEach((obj, idx) => {
      checkPageBreak(22);
      doc.setFillColor(248, 250, 254);
      doc.setDrawColor(220, 230, 245);
      
      const title = `Objectif ${idx + 1} : ${obj.title || 'Sans titre'}  [Statut : ${obj.status || 'En cours'}]`;
      const desc = `Description : ${obj.description || 'N/A'}\nRéalisation / Justification : ${obj.evaluation || 'N/A'}`;
      
      const descLines = doc.splitTextToSize(desc, contentWidth - 6);
      const boxHeight = 8 + descLines.length * 3.8;
      
      checkPageBreak(boxHeight + 2);
      doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(13, 102, 194);
      doc.text(title, margin + 3, y + 5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(45, 50, 60);
      doc.text(descLines, margin + 3, y + 9.5);

      y += boxHeight + 2.5;
    });
  }

  // --- 3. SAVOIR-FAIRE & COMPÉTENCES ---
  drawSectionHeader('3. Savoir-faire & Compétences Métier');
  
  // Vue d'ensemble profil métier
  const sfOverview = [
    `• Type de profil : ${reportData.skillsProfileType || 'Non spécifié'}`,
    `• Années d'expérience : ${reportData.skillsExperience || (profile.experienceYears ? `${profile.experienceYears} an(s)` : 'Non spécifié')}`,
    `• Étape d'un projet de prédilection : ${reportData.skillsProjectStage || 'Non spécifié'}`,
    `• CV déposé : ${reportData.cv?.name ? reportData.cv.name : 'Aucun CV joint'}`
  ].join('\n');
  drawFieldBox("Profil métier & Spécialité :", sfOverview, true);

  if (reportData.skillsDeliverables) {
    drawFieldBox("Principaux livrables réalisés :", reportData.skillsDeliverables, false);
  }

  // Tableau des compétences / domaines
  const skillsDetails = reportData.skillsDetails || {};
  const skillKeys = Object.keys(skillsDetails).filter(k => {
    const s = skillsDetails[k];
    return s && (s.exp || s.level || s.summary || s.role);
  });

  if (skillKeys.length > 0) {
    checkPageBreak(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(27, 42, 74);
    doc.text("Domaines et Outils de compétences clés :", margin, y);
    y += 4;

    skillKeys.forEach((key) => {
      const s = skillsDetails[key];
      const summaryText = `Expérience : ${s.exp || '-'}  |  Niveau : ${s.level || '-'}  |  Rôle : ${s.role || '-'}\n${s.summary ? `Détails : ${s.summary}` : ''}`;
      drawFieldBox(`Domaine : ${key}`, summaryText, false);
    });
  }

  if (reportData.knowHow) {
    drawFieldBox("Description générale du savoir-faire acquis :", reportData.knowHow, false);
  }
  if (reportData.progressionDetails) {
    drawFieldBox("Progression sur compétences métier / applicatifs :", reportData.progressionDetails, false);
  }
  if (reportData.techDetails) {
    drawFieldBox("Logiciels, Technologies & Outils maîtrisés :", reportData.techDetails, false);
  }
  if (reportData.certificationsDetail) {
    drawFieldBox("Certifications obtenues ou visées :", reportData.certificationsDetail, false);
  }
  if (reportData.deliverables) {
    drawFieldBox("Livrables phares produits cette année :", reportData.deliverables, false);
  }
  if (reportData.meetingPrep) {
    drawFieldBox("Préparation & Animation de réunions / ateliers :", reportData.meetingPrep, false);
  }

  // --- 4. ENGAGEMENT & POSTURE : AUTONOMIE EN MISSION ---
  drawSectionHeader('4. Engagement & Posture : Autonomie en Mission');
  
  if (reportData.autonomyLevel) {
    drawFieldBox(`Niveau d'autonomie revendiqué : ${reportData.autonomyLevel}`, reportData.autonomyJustification || "Aucun commentaire complémentaire.", true);
  }

  const clients = reportData.missionClients || [];
  if (clients.length > 0) {
    checkPageBreak(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(27, 42, 74);
    doc.text("Détail de l'autonomie par Client :", margin, y);
    y += 4;

    clients.forEach((c, idx) => {
      const clientContent = `• Actions / Missions : ${c.actions || '-'}\n• Grade d'autonomie : ${c.grade || '-'}\n• Commentaires : ${c.comment || '-'}`;
      drawFieldBox(`Client ${idx + 1} : ${c.client || 'Sans nom'}`, clientContent, false);
    });
  } else if (reportData.missionAutonomy) {
    drawFieldBox("Autonomie en mission :", reportData.missionAutonomy, false);
  }

  // --- 5. ENGAGEMENT & POSTURE : VENTE & COMMERCIAL ---
  drawSectionHeader('5. Engagement & Posture : Vente & Commercial');
  drawFieldBox("Présentation de l'offre Logiclever :", reportData.commercialPresentation || reportData.commercialActivities, false);
  drawFieldBox("Conseils apportés aux clients :", reportData.commercialAdvice, false);
  drawFieldBox("Force de proposition & Détection de besoins :", reportData.commercialProposition, false);
  drawFieldBox("Propositions commerciales élaborées :", reportData.commercialOffers, false);

  // --- 6. VIE LOGICLEVER, RECRUTEMENT & ENCADREMENT ---
  drawSectionHeader('6. Vie Interne, Recrutement & Encadrement');
  
  drawFieldBox("Capitalisation des savoirs (Drive) :", reportData.lifeKnowledgeSharing, false);
  drawFieldBox("Partage d'informations & Entraide (Slack) :", reportData.lifeSlack, false);
  drawFieldBox("Esprit d'équipe & Lien entre consultants :", reportData.lifeTeamSpirit, false);
  drawFieldBox("Maîtrise du modèle économique Logiclever :", reportData.lifeBusinessModel, false);
  if (reportData.lifeOther) {
    drawFieldBox("Autres contributions à la vie d'entreprise :", reportData.lifeOther, false);
  }
  if (reportData.internalInvestment !== undefined) {
    drawFieldBox("Estimation investissement interne :", `${reportData.internalInvestment} %`, false);
  }

  // Intercontrat
  if (reportData.hadIntercontrat) {
    drawFieldBox(
      `Période d'intercontrat (${reportData.intercontratDays || 0} jour(s)) :`,
      reportData.intercontratAchievements || "Aucune réalisation spécifiée.",
      true
    );
  }

  // Recrutement
  drawFieldBox("Promotion de Logiclever (recrutement) :", reportData.recruitmentPromotion, false);
  drawFieldBox("Interviews de candidats menées :", reportData.recruitmentInterviews, false);
  drawFieldBox("Activité sur les réseaux sociaux professionnels :", reportData.recruitmentSocial, false);

  // Encadrement
  drawFieldBox("Sollicitation du coach :", reportData.encadrementCoach, false);
  drawFieldBox("Sollicitation de l'encadrant en mission :", reportData.encadrementManager, false);

  // --- 7. AMÉLIORATION CONTINUE (SQUAD) ---
  drawSectionHeader('7. Amélioration Continue (SQUAD)');
  const squads = reportData.squadEntries || [];
  if (squads.length > 0) {
    squads.forEach((sq, i) => {
      drawFieldBox(`SQUAD ${i + 1} : ${sq.squad || 'Sans nom'}`, sq.contributions || 'Aucune contribution détaillée', false);
    });
  } else if (reportData.squadName || reportData.squadContributions) {
    drawFieldBox(`SQUAD : ${reportData.squadName || '-'} (Rôle : ${reportData.squadRole || '-'})`, reportData.squadContributions, false);
  } else {
    drawFieldBox("Amélioration Continue", "Aucune SQUAD renseignée.", false);
  }

  // --- 8. VOLET RÉFÉRENT LOGICLEVER (SI APPLICABLE) ---
  if (reportData.isReferentOrAspiring) {
    drawSectionHeader('8. Engagement Spécifique : Référent / Aspirant Référent');
    
    // Suivi de missions / météos
    const followUps = reportData.referentMissionFollowUps || [];
    if (followUps.length > 0) {
      followUps.forEach((fu, i) => {
        drawFieldBox(`Suivi Mission ${i + 1} (${fu.client || 'Client'}) :`, `Météos menées : ${fu.meteosMenees || '-'}\nPoints remontés : ${fu.pointsRemontes || '-'}`, false);
      });
    }

    // Réseau donneurs d'ordres
    const network = reportData.referentNetworkEntries || [];
    if (network.length > 0) {
      network.forEach((nw, i) => {
        drawFieldBox(`Réseau & Prospection ${i + 1} (${nw.clientProspect || '-'}) :`, nw.actions || '-', false);
      });
    }

    // Encadrement en mission
    const missionEncadrements = reportData.referentMissionEncadrements || [];
    if (missionEncadrements.length > 0) {
      missionEncadrements.forEach((me, i) => {
        drawFieldBox(`Encadrement mission : ${me.personneEncadree || '-'} chez ${me.client || '-'}`, me.commentaire || '-', false);
      });
    }

    // Coaching
    const coachings = reportData.referentCoachingEntries || [];
    if (coachings.length > 0) {
      coachings.forEach((c, i) => {
        drawFieldBox(`Coaching collaborateur : ${c.personneCoachee || '-'}`, c.commentaire || '-', false);
      });
    }

    // Comptes et Offres
    if (reportData.referentOnboardingAnimation) {
      drawFieldBox("Onboarding & Animation des nouveaux consultants :", reportData.referentOnboardingAnimation, false);
    }
    const offers = reportData.referentOffersEntries || [];
    if (offers.length > 0) {
      offers.forEach((o, i) => {
        drawFieldBox(`Offre développée ${i + 1} : ${o.offre || '-'}`, o.details || '-', false);
      });
    }
  }

  // --- 9. RETOURS CLIENTS & MÉTEOS ---
  drawSectionHeader('9. Retours Clients & Météos');
  const meteos = dossier?.meteos || [];
  if (meteos.length > 0) {
    meteos.forEach((m: MeteoData, idx: number) => {
      const summary = `Date : ${m.date || '-'}  |  Client : ${m.client || '-'}  |  Bien-être Mission : ${m.wellBeingMission || '-'}  |  Bien-être LL : ${m.wellBeingLogiclever || '-'}\n${m.comment ? `Commentaire : ${m.comment}` : ''}`;
      drawFieldBox(`Météo ${idx + 1}`, summary, false);
    });
  } else if (feedbacks.length > 0) {
    feedbacks.forEach((fb, idx) => {
      const fbText = `Mission : ${fb.mission || '-'}\nPoints forts : ${fb.satisfactionItems || '-'}\nAxes de progrès : ${fb.improvementAxes || '-'}`;
      drawFieldBox(`Feedback Client ${idx + 1} : ${fb.client || '-'}`, fbText, false);
    });
  } else {
    drawFieldBox("Retours Clients", "Aucun retour client ou météo enregistré.", false);
  }

  // --- 10. OBJECTIFS FUTURS (VISION MOYEN & COURT TERME) ---
  drawSectionHeader('10. Objectifs Futurs (Moyen & Court Terme)');
  
  // Moyen terme
  const careerGoals = reportData.careerGoalsList && reportData.careerGoalsList.length > 0
    ? reportData.careerGoalsList.map((g, i) => `${i + 1}. ${g}`).join('\n')
    : (reportData.careerGoals || 'Non spécifié');
  drawFieldBox("Vision Moyen-Terme (Objectifs de Carrière) :", careerGoals, true);

  // Court terme (SMART)
  const nextObjs = reportData.nextObjectives || [];
  if (nextObjs.length > 0) {
    nextObjs.forEach((obj, idx) => {
      const objBody = `• Bénéfice(s) : ${obj.benefit || '-'}\n• Moyens à mettre en œuvre : ${obj.means || '-'}\n• Mesure / Indicateur de succès : ${obj.measurement || '-'}`;
      drawFieldBox(`Objectif Court-Terme (SMART) ${idx + 1} : ${obj.goal || 'Sans titre'}`, objBody, false);
    });
  }

  // --- 11. PRÉTENTIONS FINANCIÈRES & COMMENTAIRE JURY ---
  drawSectionHeader('11. Prétentions Salariales & Éléments Financiers');
  
  const pretentionsSummary = [
    `• Grade actuel : ${profile.currentGrade || 'Junior'}`,
    `• Grade souhaité : ${reportData.wishedGrade || profile.currentGrade || 'Junior'}`,
    `• Salaire annuel brut actuel : ${reportData.currentSalary ? `${reportData.currentSalary.toLocaleString('fr-FR')} €` : (profile.currentSalary ? `${profile.currentSalary.toLocaleString('fr-FR')} €` : 'Non renseigné')}`,
    `• Salaire annuel brut souhaité : ${reportData.wishedSalary ? `${reportData.wishedSalary.toLocaleString('fr-FR')} €` : 'Non renseigné'}`
  ].join('\n');
  drawFieldBox("Synthèse des prétentions salariales :", pretentionsSummary, true);

  if (reportData.salaryExpectations) {
    drawFieldBox("Commentaires & Justifications pour le Jury :", reportData.salaryExpectations, false);
  }

  // Signatures / Footer page numbering
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 150, 165);
    doc.text(
      `LogicLever - Bilan Annuel & Dossier de Promotion ${campaignYear}  |  Candidat : ${profile.displayName || profile.email}  |  Page ${i} sur ${pageCount}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  return doc.output('datauristring');
}
