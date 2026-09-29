import { useState, useEffect } from 'react';

export interface AppLinkItem {
  id: string;
  libelle: string; // Libelle_Lien
  url: string;     // Url_Lien
  category?: 'CANDIDAT' | 'REFERENT' | 'JURY' | 'BDD_SHEETS' | 'DRIVE' | 'AUTRE';
  description?: string;
  appLocation: string; // Emplacement exact dans l'application
  inAppAccessType: 'CLICKABLE' | 'BACKGROUND_API' | 'CONFIG'; // Statut d'accessibilité dans l'app
  inAppDetails?: string; // Précision sur l'affichage ou le composant
  targetView?: 'CANDIDATE' | 'EVALUATIONS' | 'JURY' | 'CAMPAIGNS' | 'ADMIN';
  targetTab?: string; // Sous-onglet précis (ex: REFERENT_LOGICLEVER, BILAN_INTRO...)
}

export const INITIAL_APP_LINKS: AppLinkItem[] = [
  // 1. Module Référent (Tables et données synchronisées de l'Espace Candidat)
  {
    id: 'link_ref_meteo',
    libelle: 'Espace Candidat (Référent) - Vues_LL_NEW_DRIVE - Vue_Meteo',
    url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=0#gid=0',
    category: 'REFERENT',
    description: 'Synchroniser automatiquement le tableau des météos.',
    appLocation: 'Espace Candidat > Référent LogicLever',
    inAppAccessType: 'BACKGROUND_API',
    inAppDetails: 'Panneau de synchronisation et tableau Suivre les missions',
    targetView: 'CANDIDATE',
    targetTab: 'REFERENT_LOGICLEVER'
  },
  {
    id: 'link_ref_actions',
    libelle: 'Espace Candidat (Référent) - Vues_LL_NEW_DRIVE - Vue_Action',
    url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1114972765#gid=1114972765',
    category: 'REFERENT',
    description: 'Synchroniser automatiquement le tableau des actions.',
    appLocation: 'Espace Candidat > Référent LogicLever',
    inAppAccessType: 'BACKGROUND_API',
    inAppDetails: 'Tableau Actions réalisées par le candidat',
    targetView: 'CANDIDATE',
    targetTab: 'REFERENT_LOGICLEVER'
  },
  {
    id: 'link_ref_missions',
    libelle: 'Espace Candidat (Référent) - Vues_LL_NEW_DRIVE - Vue_Mission',
    url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=28372804#gid=28372804',
    category: 'REFERENT',
    description: 'Synchroniser automatiquement le tableau des missions.',
    appLocation: 'Espace Candidat > Référent LogicLever',
    inAppAccessType: 'BACKGROUND_API',
    inAppDetails: 'Tableau Missions créées / proposées',
    targetView: 'CANDIDATE',
    targetTab: 'REFERENT_LOGICLEVER'
  },
  {
    id: 'link_ref_accompagnement',
    libelle: 'Espace Candidat (Référent) - Vues_LL_NEW_DRIVE - Vue_Accompagnement',
    url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1762118320#gid=1762118320',
    category: 'REFERENT',
    description: 'Synchroniser automatiquement le tableau des accompagnements.',
    appLocation: 'Espace Candidat > Référent LogicLever',
    inAppAccessType: 'BACKGROUND_API',
    inAppDetails: 'Tableaux Coaching, Encadrement mission et Parrainage',
    targetView: 'CANDIDATE',
    targetTab: 'REFERENT_LOGICLEVER'
  },
  {
    id: 'link_ref_client',
    libelle: 'Espace Candidat (Référent) - Vues_LL_NEW_DRIVE - Vue_Client',
    url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=1815147854#gid=1815147854',
    category: 'REFERENT',
    description: 'Synchroniser automatiquement le tableau des comptes clients.',
    appLocation: 'Espace Candidat > Référent LogicLever',
    inAppAccessType: 'BACKGROUND_API',
    inAppDetails: 'Tableau Responsabilité d’un compte',
    targetView: 'CANDIDATE',
    targetTab: 'REFERENT_LOGICLEVER'
  },
  {
    id: 'link_ref_pieces_jointes',
    libelle: 'Espace Candidat (Référent) - Vues_LL_NEW_DRIVE - Pièces Jointes',
    url: 'https://docs.google.com/spreadsheets/d/1Wi5TuI92CDl87Ma4APfXeyVLFi9_2FZJA3lBK3rRYek/edit?gid=581811371#gid=581811371',
    category: 'REFERENT',
    description: 'Ouvrir les pièces jointes et justificatifs.',
    appLocation: 'Espace Candidat > Référent LogicLever',
    inAppAccessType: 'BACKGROUND_API',
    inAppDetails: 'Boutons "Document (Voir)" dans les tableaux d’actions et missions',
    targetView: 'CANDIDATE',
    targetTab: 'REFERENT_LOGICLEVER'
  },

  // 2. Espace Candidat - Bilan Annuel
  {
    id: 'link_posture_attendue',
    libelle: 'Espace Candidat (Objectifs) - Référentiel grades TJ cible – Grade - TJ - Salaire',
    url: 'https://docs.google.com/spreadsheets/d/1LatJvU7ZI5m6-is2oyVihfBSDqzJsdbvxL3pCMQhpJQ/edit?gid=1753043028#gid=1753043028',
    category: 'CANDIDAT',
    description: 'Consulter le référentiel grades TJ Cible',
    appLocation: 'Espace Candidat > Objectifs Bilan Annuel',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien externe cliquable au-dessus du champ "Posture attendue"',
    targetView: 'CANDIDATE',
    targetTab: 'BILAN_INTRO'
  },
  {
    id: 'link_meteo_client_intro',
    libelle: 'Espace Candidat (Objectifs) - KPI_Meteo',
    url: 'https://docs.google.com/spreadsheets/d/1YZ2XBW2DSbP79vT0IwKJoK_80jDJR7ZJZi4_LeF53tw/edit?gid=2004870848#gid=2004870848',
    category: 'CANDIDAT',
    description: 'Consulter le tableau de météo client.',
    appLocation: 'Espace Candidat > Objectifs Bilan Annuel',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien externe cliquable au-dessus du champ "Météo client"',
    targetView: 'CANDIDATE',
    targetTab: 'BILAN_INTRO'
  },
  {
    id: 'link_eval_pairs_intro',
    libelle: 'Espace Candidat (Objectifs) - Analyse_Jury_Salaire – TJ Cible',
    url: 'https://docs.google.com/spreadsheets/d/1DgkpCkCzj2_LGdH_BjnRScxatIidzVBj0ASwzJhD0zU/edit?gid=448715688#gid=448715688',
    category: 'CANDIDAT',
    description: 'Consulter l\'analyse jury salaire où se trouvent l\'évaluation par les pairs',
    appLocation: 'Espace Candidat > Objectifs Bilan Annuel',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien externe cliquable au-dessus du champ "Évaluation par ses pairs"',
    targetView: 'CANDIDATE',
    targetTab: 'BILAN_INTRO'
  },
  {
    id: 'link_exemple_bilan_1',
    libelle: 'Espace Candidat (Objectifs) - Exemple Bilan Annuel 1',
    url: '',
    category: 'CANDIDAT',
    description: 'Consulter l\'exemple de bilan annuel n°1 pour aider à renseigner l\'autoévaluation.',
    appLocation: 'Espace Candidat > Objectifs Bilan Annuel',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien d\'exemple de Bilan Annuel 1 (au bas de l\'onglet Objectifs Bilan Annuel)',
    targetView: 'CANDIDATE',
    targetTab: 'BILAN_INTRO'
  },
  {
    id: 'link_exemple_bilan_2',
    libelle: 'Espace Candidat (Objectifs) - Exemple Bilan Annuel 2',
    url: '',
    category: 'CANDIDAT',
    description: 'Consulter l\'exemple de bilan annuel n°2 pour aider à renseigner l\'autoévaluation.',
    appLocation: 'Espace Candidat > Objectifs Bilan Annuel',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien d\'exemple de Bilan Annuel 2 (au bas de l\'onglet Objectifs Bilan Annuel)',
    targetView: 'CANDIDATE',
    targetTab: 'BILAN_INTRO'
  },
  {
    id: 'link_exemple_bilan_3',
    libelle: 'Espace Candidat (Objectifs) - Exemple Bilan Annuel 3',
    url: '',
    category: 'CANDIDAT',
    description: 'Consulter l\'exemple de bilan annuel n°3 pour aider à renseigner l\'autoévaluation.',
    appLocation: 'Espace Candidat > Objectifs Bilan Annuel',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien d\'exemple de Bilan Annuel 3 (au bas de l\'onglet Objectifs Bilan Annuel)',
    targetView: 'CANDIDATE',
    targetTab: 'BILAN_INTRO'
  },
  {
    id: 'link_business_model',
    libelle: 'Espace Candidat (Vie LogicLever) - P03-A_Equilibre-Financier',
    url: 'https://docs.google.com/presentation/d/1xSJVxDGK5nmIUUa37jsfGXfXSaYETjqgsHD7o7e2S84/edit?slide=id.p3#slide=id.p3',
    category: 'CANDIDAT',
    description: 'Consulter la présentation du business model.',
    appLocation: 'Espace Candidat > Vie LogicLever',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien d’accès au support Google Slides du modèle économique',
    targetView: 'CANDIDATE',
    targetTab: 'VIE_LOGICLEVER'
  },
  {
    id: 'link_guide_expert',
    libelle: 'Espace Candidat (Référent) - P05-C-Guide du nouvel expert',
    url: 'https://docs.google.com/presentation/d/1RRSv-9qBXuKXCpMabm0wavZx9wHZ4rW9fn2oUnAdIqM/edit?slide=id.g8d0a82e1e4_0_94#slide=id.g8d0a82e1e4_0_94',
    category: 'REFERENT',
    description: 'Consulter le guide du nouvel expert',
    appLocation: 'Espace Candidat > Référent LogicLever',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien d’accès au guide Google Slides de l’expert & référent',
    targetView: 'CANDIDATE',
    targetTab: 'REFERENT_LOGICLEVER'
  },
  {
    id: 'link_template_cv_ll',
    libelle: 'Espace Candidat (Savoir-faire) - CV 2025_Template_Logiclever',
    url: 'https://docs.google.com/presentation/d/1hkoD3yAMaqFRhoLe0VrIp5ljT_0onNI8qZsbNH2cH3k/edit?slide=id.g34bcd725496_0_385#slide=id.g34bcd725496_0_385',
    category: 'CANDIDAT',
    description: 'Consulter le modèle de CV.',
    appLocation: 'Espace Candidat > Savoir-faire',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien externe cliquable "Modèle CV Google Slides"',
    targetView: 'CANDIDATE',
    targetTab: 'EXPERTISES'
  },
  {
    id: 'link_rep_depot_cv',
    libelle: 'Espace Candidat (Savoir-faire) - Dépôt des CVs',
    url: 'https://drive.google.com/drive/u/0/folders/157QwJI_599602Iqb5fXpveFELz79Qy57',
    category: 'DRIVE',
    description: 'Accéder au dossier de dépôt des CVs.',
    appLocation: 'Espace Candidat > Savoir-faire',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Bouton d’accès au dossier Google Drive de dépôt de CV',
    targetView: 'CANDIDATE',
    targetTab: 'EXPERTISES'
  },
  {
    id: 'link_dossier_competences',
    libelle: 'Espace Candidat (Savoir-faire) - Dossier des compétences',
    url: 'https://docs.google.com/spreadsheets/d/1x-_DOsA2PsG9YK7Wbl5jBoXJE8abDHWn4EtQnrfBDXA/edit?gid=2103496025#gid=2103496025',
    category: 'CANDIDAT',
    description: 'Consulter le dossier des compétences.',
    appLocation: 'Espace Candidat > Savoir-faire',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien direct vers la grille de compétences Google Sheets',
    targetView: 'CANDIDATE',
    targetTab: 'EXPERTISES'
  },
  {
    id: 'link_tj_cible_calc',
    libelle: 'Espace Candidat (Prétentions) - Référentiel grades TJ cible – Justificatif TJ Cible',
    url: 'https://docs.google.com/spreadsheets/d/1LatJvU7ZI5m6-is2oyVihfBSDqzJsdbvxL3pCMQhpJQ/edit?gid=872847313#gid=872847313',
    category: 'CANDIDAT',
    description: 'Consulter le barème du TJ cible.',
    appLocation: 'Espace Candidat > Prétentions de carrière et salariales',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien externe cliquable "TJ Cible" dans les grilles de barèmes',
    targetView: 'CANDIDATE',
    targetTab: 'CALCULATRICE'
  },
  {
    id: 'link_fichier_rh_synthese',
    libelle: 'Espace Candidat (Synthèse) - Rapport_SUIVI_RH',
    url: 'https://docs.google.com/spreadsheets/d/1tgpQHKPHliYASkxm34cYFnO8ggzlzzQAwARihz3Eq5s/edit?gid=80099745#gid=80099745',
    category: 'CANDIDAT',
    description: 'Consulter le fichier RH des grades et salaires.',
    appLocation: 'Espace Candidat > Synthèse',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien vers le fichier RH de référence',
    targetView: 'CANDIDATE',
    targetTab: 'SYNTHESE'
  },
  {
    id: 'link_synthese_jours',
    libelle: 'Espace Candidat (Synthèse) - Suivi_Jours_Consultant',
    url: 'https://docs.google.com/spreadsheets/d/1FLIUieYtqZtnYpABpNXRRDNYbZZXEFHA0J9NI2Cq450/edit?gid=291701908#gid=291701908',
    category: 'CANDIDAT',
    description: 'Consulter le suivi des jours consultants',
    appLocation: 'Espace Candidat > Synthèse',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien vers la feuille de décompte des jours',
    targetView: 'CANDIDATE',
    targetTab: 'SYNTHESE'
  },
  {
    id: 'link_primes_synthese',
    libelle: 'Espace Candidat (Synthèse) - Drive Calculs Primes',
    url: 'https://drive.google.com/drive/u/1/folders/1_mrGq_Ym-i6LuzHHmtBFUkDyvJ0oLAZh',
    category: 'DRIVE',
    description: 'Accéder au dossier des primes commerciales.',
    appLocation: 'Espace Candidat > Synthèse',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien direct vers le dossier Google Drive des primes',
    targetView: 'CANDIDATE',
    targetTab: 'SYNTHESE'
  },
  {
    id: 'link_formations_synthese',
    libelle: 'Espace Candidat (Synthèse) - Evaluation_Formation_Logiclever',
    url: 'https://docs.google.com/spreadsheets/d/1YLUZqCKNfGEGiHHY0qsrq6I8gBsnvlIJRQmYu_di-Y8/edit?gid=0#gid=0',
    category: 'CANDIDAT',
    description: 'Consulter le tableau des formations suivies chez Logiclever',
    appLocation: 'Espace Candidat > Synthèse',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Lien vers le fichier Google Sheets des formations',
    targetView: 'CANDIDATE',
    targetTab: 'SYNTHESE'
  },

  // 3. Espace Jury & Dossiers Google Drive
  {
    id: 'link_export_drive_jury',
    libelle: 'Espace Jury (Délibérations) - Délibérations_Jury',
    url: 'https://drive.google.com/drive/folders/1BHFi8Z_0K1tTUalK6BKC-B4eXh6PLOx5',
    category: 'DRIVE',
    description: 'Accéder au dossier d\'export des délibérations.',
    appLocation: 'Espace Jury > Délibérations',
    inAppAccessType: 'CLICKABLE',
    inAppDetails: 'Bouton "Ouvrir le dossier Drive" affiché lors de l’export',
    targetView: 'JURY'
  },
  {
    id: 'link_drive_evaluation_n1',
    libelle: 'Espace Candidat (Documents) - Drive – 1-Evaluation',
    url: 'https://drive.google.com/drive/folders/1A2DLQku7fGLkV3XthSIi34pJ9TC-_2Bv',
    category: 'DRIVE',
    description: 'Dossier du Drive où se trouve les bilans annuels de chaque année',
    appLocation: 'Espace Candidat > Pièces Jointes & Import',
    inAppAccessType: 'BACKGROUND_API',
    inAppDetails: 'Interrogation automatique de l’API Drive pour lier le bilan N-1',
    targetView: 'CANDIDATE',
    targetTab: 'DOCUMENTS'
  }
];

const STORAGE_KEY = 'app_hyperlinks_registry_v9';

export class AppLinksService {
  private static listeners: Array<() => void> = [];

  static getLinks(): AppLinkItem[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        let parsed = JSON.parse(stored) as AppLinkItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter out legacy or removed IDs
          const REMOVED_IDS = new Set([
            'link_sheet_comptes_delib',
            'link_sheet_suivi_rh',
            'link_sheet_primes_freelance_salaries',
            'link_sheet_analyse_jury'
          ]);
          parsed = parsed.filter(item => !REMOVED_IDS.has(item.id));
          const map = new Map<string, AppLinkItem>();
          parsed.forEach(item => map.set(item.id, item));
          INITIAL_APP_LINKS.forEach(def => {
            const existing = map.get(def.id);
            if (!existing) {
              map.set(def.id, def);
            } else {
              // Synchronize system appLocation, targetTab, targetView, description, category, libelle and inAppAccessType
              map.set(def.id, {
                ...existing,
                appLocation: def.appLocation,
                targetView: def.targetView,
                targetTab: def.targetTab,
                inAppDetails: def.inAppDetails,
                category: def.category,
                description: def.description,
                libelle: def.libelle,
                inAppAccessType: def.inAppAccessType
              });
            }
          });
          return Array.from(map.values());
        }
      }
    } catch (e) {
      console.warn('Failed to parse links from localStorage:', e);
    }
    return INITIAL_APP_LINKS;
  }

  static saveLinks(links: AppLinkItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
      this.notify();
    } catch (e) {
      console.error('Failed to save links to localStorage:', e);
    }
  }

  static updateLink(id: string, updates: Partial<AppLinkItem>): void {
    const list = this.getLinks();
    const idx = list.findIndex(l => l.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates };
      this.saveLinks(list);
    }
  }

  static addLink(newItem: Omit<AppLinkItem, 'id'>): AppLinkItem {
    const list = this.getLinks();
    const id = `link_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullItem: AppLinkItem = { ...newItem, id };
    list.push(fullItem);
    this.saveLinks(list);
    return fullItem;
  }

  static deleteLink(id: string): void {
    const list = this.getLinks().filter(l => l.id !== id);
    this.saveLinks(list);
  }

  static clearLinkUrl(id: string): void {
    this.updateLink(id, { url: '' });
  }

  static resetToDefaults(): void {
    this.saveLinks(INITIAL_APP_LINKS);
  }

  static getLinkUrl(id: string, defaultUrl: string = ''): string {
    const list = this.getLinks();
    const item = list.find(l => l.id === id);
    return item?.url || defaultUrl;
  }

  static getLink(id: string): AppLinkItem | undefined {
    return this.getLinks().find(l => l.id === id);
  }

  static subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private static notify(): void {
    this.listeners.forEach(fn => fn());
  }
}

/**
 * Hook React réactif pour s'abonner en direct à un hyperlien par son ID.
 * Si l'administrateur modifie le lien dans l'espace Admin, le composant est instantanément réactif.
 */
export function useAppLink(id: string, defaultUrl: string = ''): {
  url: string;
  libelle: string;
  description?: string;
  item?: AppLinkItem;
} {
  const [item, setItem] = useState<AppLinkItem | undefined>(() => {
    return AppLinksService.getLink(id);
  });

  useEffect(() => {
    const sync = () => {
      setItem(AppLinksService.getLink(id));
    };
    sync();
    return AppLinksService.subscribe(sync);
  }, [id]);

  return {
    url: item?.url || defaultUrl,
    libelle: item?.libelle || '',
    description: item?.description,
    item
  };
}

/**
 * Hook React réactif pour s'abonner à l'ensemble des liens
 */
export function useAppLinks(): AppLinkItem[] {
  const [links, setLinks] = useState<AppLinkItem[]>(() => AppLinksService.getLinks());

  useEffect(() => {
    const sync = () => {
      setLinks(AppLinksService.getLinks());
    };
    sync();
    return AppLinksService.subscribe(sync);
  }, []);

  return links;
}

