# Documentation Fonctionnelle et Technique
## Plateforme de Pilotage de la Campagne de Revalorisation Annuelle — Logiclever

Bienvenue dans la documentation officielle de l'application **Jury des Salaires / Campagne Annuelle 2025** de Logiclever. 

Cette plateforme web full-stack moderne a été conçue pour digitaliser, standardiser et objectiver le processus d'évaluation annuelle et de revalorisation salariale des consultants au sein de Logiclever.

---

## 1. Vision et Objectifs de l'Application

Le processus traditionnel d'évaluation annuelle est souvent complexe, sujet aux biais et difficile à piloter à l'échelle. L'application répond à ces défis en centralisant toutes les données d'une campagne annuelle au sein d'une interface unique.

### Objectifs Clés :
* **Transparence et Objectivité** : Permettre aux consultants (Candidats) de s'auto-évaluer rigoureusement sur un référentiel partagé de compétences, d'investissements et de satisfaction.
* **Collaboration fluide** : Fédérer l'ensemble des acteurs (Candidats, Consultants évaluateurs, Jury de revalorisation et Administrateurs) sur un outil collaboratif en temps réel.
* **Aide à la Décision Algorithmique** : Intégrer un simulateur dynamique de salaire (la "Calculette de Salaire") basé sur le business model de Logiclever (intégrant le TJM, le taux de mission, le grade professionnel et l'investissement interne).
* **Pilotage Stratégique** : Fournir un tableau de bord analytique macro au Jury pour piloter l'enveloppe globale de revalorisation et assurer l'équité des packages salariaux.

---

## 2. Architecture Technique et Stack de l'Application

L'application est construite sur une architecture cloud sécurisée et réactive :

* **Frontend** : **React 18** couplé à **Vite** pour un temps de chargement ultra-rapide et une expérience fluide. Le typage et la sécurité du code sont assurés par **TypeScript**.
* **Design & UI** : **Tailwind CSS** pour une esthétique moderne, épurée et hautement contrastée. Les transitions d'onglets et les animations de composants s'appuient sur **motion** (`motion/react`) pour une sensation organique et qualitative.
* **Icônes** : Librairie unifiée **Lucide-React** garantissant l'homogénéité visuelle.
* **Données et Persistance** : **Firebase (Firestore)** pour une synchronisation en temps réel et une résilience totale aux déconnexions.
* **Authentification** : **Firebase Auth (Google OAuth/Sign-In)** sécurisant les accès et rattachant automatiquement les utilisateurs à leurs profils d'entreprise.

---

## 3. Matrice des Rôles et Autorisations

L'application distingue quatre profils utilisateurs distincts, chacun ayant un spectre d'action cloisonné et sécurisé :

| Rôle / Espace | Description & Droits d'Accès |
| :--- | :--- |
| **CANDIDAT (Candidate)** | * Accède uniquement à son propre dossier.<br>* Renseigne son bilan annuel (Bilan de synthèse, objectifs passés, compétences, vie interne, etc.).<br>* Déclare ses météos clients et télécharge ses justificatifs.<br>* Soumet son dossier final (le figeant en statut `COMPLET`).<br>* Utilise la Calculette de Salaire interactive. |
| **CONSULTANT (Reviewer)** | * Accède à l'Espace Consultant.<br>* Visualise les dossiers des candidats qui lui ont été explicitement assignés par l'administration.<br>* Rédige des retours techniques d'évaluation, propose une fourchette de TJM cible et émet un indice de confiance pour chacun d'eux. |
| **JURY (Decision Maker)** | * Accède à l'Espace de Pilotage Global (Dashboard macro de campagne).<br>* Visualise et compare l'intégralité des dossiers de l'entreprise.<br>* Accède au **Tableau des Salaires analytique** (`SalaryTable`).<br>* Renseigne et valide les décisions finales de revalorisation (Verdicts, montants d'ajustements, primes, appréciations finales pour le candidat). |
| **ADMINISTRATEUR (System)** | * Accède à l'interface d'Administration Système.<br>* Gère l'annuaire des utilisateurs et attribue les rôles applicatifs (`CANDIDATE`, `CONSULTANT`, `JURY`).<br>* Complète les fiches profils (Grade, salaire de base actuel, TJM actuel, matricule).<br>* Affecte les consultants référents/évaluateurs aux candidats. |

---

## 4. Description Détaillée des Écrans et Fonctionnalités

### 4.1. Connexion et Sélecteur de Rôle (Workspace Switcher)
À l'entrée, un écran hautement sécurisé invite l'utilisateur à se connecter via son compte Google.
* Si l'utilisateur possède **plusieurs rôles** (ex. un collaborateur qui est à la fois Candidat pour sa propre évaluation, Consultant pour ses pairs assignés, et membre du Jury), un **Sélecteur de Rôle (Workspace Launcher)** élégant s'affiche.
* Ce sélecteur permet de basculer en un clic d'un espace de travail à un autre en toute transparence.

---

### 4.2. Espace Candidat (Espace d'Auto-Évaluation)
Cet espace s'articule autour d'un panneau latéral de navigation verticale structuré en 10 onglets clés. Les champs obligatoires à la soumission sont marqués d'un astérisque rouge (`*`).

1. **Introduction & Synthèse `*`**
   * Saisie du bilan général de l'année écoulée (période du 1er juillet au 30 juin).
   * Rédaction d'une fiche de synthèse globale (recul sur le travail, réalisations marquantes).
2. **Objectifs Année Passée**
   * Grille récapitulative des objectifs de la campagne précédente.
   * Statut de réussite (OUI, NON, PARTIEL) et zone de commentaires pour justifier les résultats.
3. **Missions & Expertises `*`**
   * Déclaration détaillée des compétences métiers développées.
   * Technologies, logiciels et outils maîtrisés au cours des missions.
   * Activités de formation reçues ou dispensées, certifications obtenues et livrables produits.
4. **Engagement & Autonomie `*`**
   * Auto-positionnement de son niveau d'autonomie (Junior, Confirmé, Senior, Expert) étayé d'une justification textuelle détaillée.
   * Déclaration des contributions commerciales (participation à des avant-ventes, réponses à appels d'offres, présentations de l'offre Logiclever aux clients).
5. **Météos Client `*`**
   * Grille dynamique permettant d'ajouter une ou plusieurs fiches d'évaluation client (Météos).
   * Pour chaque météo : nom du client, descriptif de mission, points forts de satisfaction, axes d'amélioration, perspectives, note sur 10 client et note sur 10 consultant.
6. **Intercontrat (Conditionnel)**
   * Visible uniquement si le candidat coche avoir eu une période d'intercontrat durant l'année.
   * Permet de consigner le nombre de jours et les activités réalisées (auto-formation, contribution interne).
7. **Référents / Experts (Conditionnel)**
   * Onglet visible uniquement si le grade actuel du consultant est *Senior* ou *Expert*, ou s'il s'est déclaré référent/expert.
   * Permet de suivre le nombre de consultants coachés, d'entretiens de recrutement menés, le suivi des météos client et les actions dans l'animation du réseau interne.
8. **Futur & Prétentions `*`**
   * Définition des objectifs de carrière à moyen terme (1 à 3 ans).
   * Saisie d'objectifs court terme formalisés en mode **SMART** (Spécifique, Mesurable, Ambitieux, Réaliste, Temporel).
   * Expression des souhaits pour l'année à venir : Grade souhaité, Salaire annuel visé (€), TJM cible escompté (€) et zone de commentaire libre adressée au Jury.
9. **Pièces Jointes**
   * Zone de dépôt intuitive en drag-and-drop permettant de joindre un CV à jour, des justificatifs de certifications ou d'évaluation client.
10. **Calculette de Salaire (Simulateur)**
    * Outil d'exploration permettant au consultant de tester la viabilité financière de ses prétentions.
    * En faisant varier le *TJ Vendu*, le *TJ Cible*, le *Grade Cible*, le *% de Mission* et le *% d'Investissement Interne*, le candidat obtient instantanément sa projection de rémunération théorique selon la formule contractuelle Logiclever.

---

### 4.3. Espace Consultant (Évaluation Technique)
Conçu pour les évaluateurs assignés, cet écran liste les fiches candidats sous leur responsabilité.
* **Lecture intégrale** : Le consultant accède à l'ensemble du dossier renseigné par le candidat en mode lecture seule pour préparer son évaluation.
* **Formulaire d'évaluation** :
  * Évaluation du TJM cible estimé (Min et Max).
  * Rédaction d'une justification détaillée et identification des axes d'amélioration.
  * Saisie d'un **Indice de Confiance** (note de 1 à 5).
  * Bouton d'enregistrement et de validation de l'avis technique.

---

### 4.4. Espace de Pilotage & Jury
Réservé aux décideurs, cet espace se scinde en deux sections majeures :

#### 1. Le Dashboard Macro (`Dashboard.tsx`)
Donne une vue d'ensemble chiffrée sur la santé de la campagne annuelle :
* **Statistiques globales** : Nombre total de dossiers, répartition en temps réel des statuts de dossiers (`OUVERT`, `COMPLET`, `VALIDE`).
* **KPIs Salaires** : Salaire moyen actuel vs demandé, montant total des augmentations déjà accordées, et enveloppe globale engagée.

#### 2. Le Tableau des Salaires Analytique (`SalaryTable.tsx`)
Il s'agit d'un tableau financier ultra-complet qui aligne pour chaque candidat :
* Ses données actuelles (Grade, Salaire, TJM de mission).
* Ses souhaits (Grade visé, Salaire souhaité, TJM cible).
* Les propositions de l'évaluation technique du consultant.
* **L'analyse algorithmique** :
  * Calcul de la marge brute générée au TJ vendu actuel et au TJ cible attendu.
  * Calcul automatique du salaire cible théorique 100% via la formule Logiclever.
  * Application automatique des coefficients de pondération basés sur le **Taux de Mission** du candidat (objectif cible à 98%) et son **Taux d'Investissement Interne** (objectif cible à 60%).
* **Formulaire de Décision Intégré** :
  * Enregistrement direct du verdict du Jury (*Ajustement accordé*, *Statu quo*, etc.).
  * Montant annuel de l'augmentation accordée (€) et pourcentage associé (calculé en temps réel).
  * Ajustement des primes exceptionnelles (avant / après).
  * Rédaction des appréciations officielles adressées au candidat (Explication de la décision, pistes d'amélioration, commentaires libres).
  * Signature du référent de Jury et témoin d'unanimité.
  * Actions pour sauvegarder le brouillon de décision, acter la décision (Statut `VALIDE`), ou rouvrir le dossier si nécessaire.

---

### 4.5. Administration Système (User Management)
Permet aux administrateurs de configurer le moteur de la campagne :
* **Annuaire central** : Liste nominative de l'ensemble des collaborateurs.
* **Gestion des Droits** : Attribution fine des rôles (`CANDIDATE`, `CONSULTANT`, `JURY`).
* **Initialisation des Profils** : Renseignement des données salariales actuelles, du grade, du matricule et du TJM facturé pour chaque consultant (essentiel pour alimenter les calculs de rentabilité et de revalorisation).
* **Tableau d'Appairage** : Module d'association permettant d'attribuer un ou plusieurs consultants évaluateurs à un candidat.

---

## 5. Cycle de Vie du Dossier Candidat et Processus Appliqués

Le dossier candidat évolue de façon séquentielle à travers trois statuts majeurs, dictant les autorisations d'écriture et de lecture sur la base de données Firestore :

```
[ Statut: OUVERT ] (Brouillon Candidat)
       │
       ▼ (Saisie complète + Soumission)
[ Statut: COMPLET ] (Figeage Candidat + Évaluation Consultant)
       │
       ▼ (Décision validée par le Jury)
[ Statut: VALIDE ] (Décision verrouillée + Visible au Candidat)
```

### 1. Statut : `OUVERT` (Brouillon modifiable par le Candidat)
* **Création automatique** : Un dossier annuel est automatiquement instancié pour le candidat s'il n'existe pas dès sa première connexion.
* **Enregistrement de brouillon (Draft Save)** : Le candidat peut enregistrer manuellement sa progression en cliquant sur "Enregistrer le brouillon".
* **Sauvegarde Automatique Réactive (Autosave)** : Pour éviter toute perte de saisie lors d'une déconnexion accidentelle ou d'un changement d'onglet, l'application intègre un mécanisme d'autosave réactif. À la moindre modification des données de rapport (`reportData`) ou des évaluations clients (`feedbacks`), un temporisateur de **2 secondes** se lance. À l'échéance, les données sont persistées de manière totalement transparente dans Firestore sans perturber la saisie de l'utilisateur. Un voyant discret en bas d'écran indique l'état d'enregistrement en temps réel.
* **Contrôles de validation à la soumission** : L'accès au bouton "Soumettre le dossier" est rigoureusement surveillé. Tant que tous les champs obligatoires (Synthèse de l'année, compétences acquises, détails d'autonomie, au moins une Météo Client, prétentions salariales et objectifs SMART) ne sont pas complétés, le bouton de soumission reste désactivé. Au survol du curseur, un **Tooltip d'explication** dynamique s'affiche pour guider le candidat : *"Pour soumettre le dossier merci de renseigner tous les champs obligatoires"*.

### 2. Statut : `COMPLET` (Ferme, en cours d'évaluation par le Consultant et le Jury)
* Une fois que le candidat clique sur "Soumettre le dossier", le statut passe à `COMPLET`.
* **Verrouillage des écritures** : L'Espace Candidat passe immédiatement en mode lecture seule. Toutes les entrées et l'autosave sont désactivés pour garantir l'intégrité des informations examinées.
* **Ouverture de l'évaluation** : Le dossier apparaît avec le badge "Soumis" dans la liste des consultants évaluateurs affectés et dans le tableau de bord du Jury.

### 3. Statut : `VALIDE` (Décision actée par le Jury)
* Après étude du dossier complet en séance plénière de Jury, les membres consignent la décision (augmentation, prime, grade, retour écrit).
* Lors de la validation définitive par le Jury, le dossier bascule au statut `VALIDE`.
* **Clôture du dossier** : Les données de décision sont enregistrées de façon immuable dans Firestore. Le candidat peut alors consulter la décision finale et les précieux retours d'orientation de carrière formulés par le Jury directement depuis son espace.

---

## 6. Moteur Algorithmique de Calcul Salarial

Le calcul du salaire cible et de la marge brute repose sur des règles de gestion rigoureuses, modélisées sous forme d'algorithmes précis dans le module `salaryUtils.ts`.

### 6.1. Taux de Redistribution par Grade (Taux de Facturation)
Chaque grade possède un taux de redistribution appliqué sur le volume de facturation annuel théorique (sur une base réglementaire de **193 jours travaillés par an**) :

$$\text{Taux de Redistribution} = \begin{cases} 
0.710 \quad (71,0\%) & \text{si Grade} = \text{Junior} \\ 
0.729 \quad (72,9\%) & \text{si Grade} = \text{Confirmé} \\ 
0.752 \quad (75,2\%) & \text{si Grade} = \text{Senior} \\ 
0.765 + 0.01 \times \lfloor\frac{\text{Ancienneté Expert}}{2}\rfloor & \text{si Grade} = \text{Expert (plafonné à 80,5\%)} 
\end{cases}$$

### 6.2. Prime d'Ancienneté Logiclever
Une prime annuelle forfaitaire s'ajoute selon le nombre d'années d'ancienneté au sein de Logiclever :
* Moins de 3 ans d'ancienneté : **0 €**
* De 3 ans à 5 ans d'ancienneté : **500 €**
* À partir de 6 ans d'ancienneté : **1000 €**

### 6.3. Coûts d'Infrastructure et Tickets Restaurants
* **Frais de structure fixes** : Retenue annuelle forfaitaire de **6 000 €** couvrant les frais généraux.
* **Tickets Restaurants** : Coût annuel employeur de **216 jours × 5,50 € = 1 188 €**.
* **Charges patronales et taxes** : Coefficient multiplicateur de charges directes fixé à **1,45** et coefficient de charges indirectes à **1,01**.

---

### 6.4. Formule de Salaire Annuel Cible Théorique (100% de performance)
Le salaire annuel théorique est le résultat de l'équation financière suivante :

$$\text{Salaire Brut Théorique} = \text{Round}\left( \frac{(\text{Taux de Redistribution} \times 193 \text{ jours} \times \text{TJ}) - 6000 - \text{Prime Ancienneté} - 1188}{1,45 \times 1,01} \right)$$

### 6.5. Pondération par la Performance Effective
Afin de refléter l'engagement du consultant et son positionnement en mission, la formule pondère ce salaire brut par deux ratios clés :
1. **Taux de Mission (Mission %)** : Évalue la proportion de jours facturés sur l'année (Objectif cible d'excellence fixé à **98%**).
2. **Taux d'Investissement Interne (Investment %)** : Évalue la contribution active à la vie d'entreprise, à l'animation de SQUAD, d'ateliers de capitalisation (Objectif cible d'excellence fixé à **60%**).

La formule finale appliquée pour déterminer le salaire de revalorisation cible théorique pondéré intègre ces pourcentages d'atteinte pour pondérer l'écart entre le salaire de base à TJ classique et le salaire théorique à TJ majoré (TJM + 30 €), garantissant un alignement juste entre mérite individuel et équilibre macro-économique.
