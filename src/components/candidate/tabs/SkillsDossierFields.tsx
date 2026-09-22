import React, { useState } from 'react';
import { AnnualReport } from '../../../types';
import { FormField } from '../CandidateUI';

const categories = [
  'Agile', 'CRM', 'ERP', 'Recette/Tests', 'Transformation Digitale',
  'BigData Migration de données', 'Migration données', 'Data Analytics / BI',
  'UX design', 'EAM', 'Langage Code', 'Logiciels', 'Autre',
];

interface SkillsDossierFieldsProps {
  reportData: AnnualReport;
  setReportData: React.Dispatch<React.SetStateAction<AnnualReport>>;
  disabled: boolean;
}

export function SkillsDossierFields({ reportData, setReportData, disabled }: SkillsDossierFieldsProps) {
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const category = reportData.skillsCategory || '';
  const details = reportData.skillsDetails?.[category] || {};

  const uploadCV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled) return;
    setUploadError('');
    if (!/\.(pdf|doc|docx)$/i.test(file.name)) {
      setUploadError('Choisissez un CV au format PDF ou Word.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setUploadError('La taille maximale du CV est de 2 Mo.');
      return;
    }
    setUploading(true);
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Lecture impossible'));
        reader.onabort = () => reject(new Error('Lecture annulée'));
        reader.readAsDataURL(file);
      });
      setReportData(prev => ({ ...prev, cv: { name: file.name, url } }));
    } catch {
      setUploadError('Impossible de lire le CV. Veuillez réessayer.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-10 mb-10 pb-10 border-b border-accent/10">
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-accent">CV</h3>
        <p className="text-accent/60">Lien vers le CV qui doit être à jour et mettre en lumière vos points forts.</p>
        <label htmlFor="skills-cv-upload" className="block text-sm font-semibold text-accent">Rep dépôt CV (PDF ou Word, 2 Mo maximum)</label>
        <input id="skills-cv-upload" type="file" accept=".pdf,.doc,.docx" onChange={uploadCV} disabled={disabled || uploading} className="block w-full text-sm text-accent file:mr-4 file:rounded-md file:border-0 file:bg-accent file:px-4 file:py-2 file:text-white disabled:opacity-50" />
        {uploading && <p role="status">Chargement du CV…</p>}
        {uploadError && <p role="alert" className="text-sm text-red-600">{uploadError}</p>}
        {reportData.cv && <a href={reportData.cv.url} download={reportData.cv.name} className="inline-block text-secondary underline">Télécharger le CV : {reportData.cv.name}</a>}
      </div>

      <div className="space-y-8">
        <h4 className="text-sm font-bold text-accent">General</h4>
        {([
          ['skillsProfileType', 'Type de profil'],
          ['skillsExperience', 'XP'],
          ['skillsDeliverables', 'Principaux livrables réalisés'],
        ] as const).map(([key, label]) => (
          <div key={key}><FormField label={label} value={reportData[key] || ''} onChange={value => setReportData(prev => ({ ...prev, [key]: value }))} disabled={disabled} /></div>
        ))}

        <h4 className="text-sm font-bold text-accent">Compétences/Connaissance</h4>
        <FormField label="Etape d'un projet" value={reportData.skillsProjectStage || ''} onChange={value => setReportData(prev => ({ ...prev, skillsProjectStage: value }))} disabled={disabled} />
        <div>
          <label htmlFor="skills-category" className="block mb-3 text-sm font-semibold text-accent">Compétence / Connaissance</label>
          <select id="skills-category" value={category} onChange={event => {
            const value = event.target.value;
            setReportData(prev => ({ ...prev, skillsCategory: value }));
          }} disabled={disabled} className="w-full rounded-xl border border-accent/10 bg-accent/5 p-4 text-accent disabled:opacity-50">
            <option value="">Sélectionnez une option</option>
            {categories.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>
        {category && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {([['exp', 'Exp'], ['level', 'Niveau'], ['summary', 'Résumé'], ['role', 'Rôle']] as const).map(([key, label]) => (
              <div key={`${category}-${key}`}><FormField label={label} value={details[key] || ''} disabled={disabled} onChange={value => setReportData(prev => ({
                ...prev,
                skillsDetails: {
                  ...prev.skillsDetails,
                  [category]: { ...prev.skillsDetails?.[category], [key]: value },
                },
              }))} /></div>
            ))}
          </div>
        )}
        <h4 className="text-sm font-bold text-accent">Progression</h4>
        {([
          ['progressionDetails', 'Sur quelles compétences métier / applicatifs ?'],
          ['techDetails', 'Sur quels logiciels / technologies ?'],
          ['certificationsDetail', 'Avez-vous de nouvelles certifications ?'],
          ['meetingPrep', 'Préparation / Animation de réunion ?'],
          ['deliverables', 'Quels livrables avez-vous faits ?'],
        ] as const).map(([key, label]) => (
          <div key={key}>
            <FormField
              label={label}
              value={reportData[key] || ''}
              onChange={value => setReportData(prev => ({ ...prev, [key]: value }))}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
