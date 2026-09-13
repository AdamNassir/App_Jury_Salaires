# Cahier des Charges Fonctionnel et Technique - Plateforme Dossier Promotion (Logiclever)

Ce document fournit une description technique et fonctionnelle exhaustive de l'application. Elle est conçue pour être consommée par un développeur ou une IA pour reconstruire l'application à l'identique.

---

## 1. Vision du Produit
Une application interne de gestion des promotions annuelles ("Campagne de Promotion"). L'objectif est de centraliser :
1.  Le **bilan d'activité** rempli par le candidat (consultant en promotion).
2.  Le recueil de **"Météos Clients"** (feedbacks qualitatifs et quantitatifs).
3.  L'**avis d'un ou plusieurs experts** techniques (consultants référents).
4.  La **délibération finale** et scellée du jury.

---

## 2. Stack Technique & Environnement
- **Frontend**: React 18 avec TypeScript.
- **Build Tool**: Vite.
- **Styling**: Tailwind CSS 4.0 (@import "tailwindcss").
- **Backend-as-a-Service**: Firebase (Firestore, Authentication).
- **Animations**: `motion/react` (Framer Motion).
- **Icônes**: `lucide-react`.
- **Runtime**: Node.js (Port 3000 obligatoire).

---

## 3. Modèle de Données (Firestore)

### Collection `users`
- `id` (UID Firebase)
- `roles`: `('CANDIDATE' | 'CONSULTANT' | 'JURY')[]`
- `currentGrade`: `'Confirmé' | 'Senior' | 'Expert'`
- `currentSalary` / `currentTJM`: numbers
- `assignedCandidateIds`: `string[]` (pour les experts)

### Collection `dossiers`
Le document est identifié par : `{userId}_{campaignYear}` (ex: `abc123_2025`).
- **Informations de base**: `candidateId`, `candidateName`, `status` (`'OUVERT'`, `'COMPLET'`, `'VALIDE'`).
- **Bilan (annualReport)**:
    - Objectifs précédents, synthèse, activités commerciales, formations.
    - Savoir-faire tech (logiciels, certifications, livrables).
    - Autonomie (niveau revendiqué, justification).
    - Prétentions : Grade souhaité, Salaire souhaité, TJM cible attendu.
- **Météos Client (clientFeedbacks)** : Array d'objets.
    - Champs : Client, Mission, Satisfaction, Axes de progrès, Recommandation.
    - Notes : `clientRating` (/10) et `consultantRating` (/10).
- **Avis Experts (consultantFeedbacks)** : Map (Key = expertId).
    - `justification`: texte riche.
    - `validated`: boolean (trigger par la saisie).
- **Décision (juryDecision)** : Verdict, montant, pourcentage, conclusion technique.

---

## 4. Interfaces & Expérience Utilisateur (UX)

### Design System
- **Thème**: Sombre "Premium".
- **Couleurs**:
    - Primaire (Boutons/Accents) : Violet/Indigo brillant (`#6366f1`).
    - Fond : Noir profond/Gris anthracite (`#0a0a0a`).
    - Cartes : Gris avec bordure transparente blanche (`bg-white/5 border-white/10`).
- **Typographie**: Inter (sans-serif) avec des espacements larges pour les titres en majuscules (tracking-widest).

### Layout Global
- **Sidebar**: Fixe à gauche sur desktop, adaptative sur mobile. Liens : Tableau de bord, Utilisateurs (Admin), Déconnexion.
- **Transitions**: Entrée des éléments en fondu montant (Y: 10 -> 0, opacity: 0 -> 1) via Framer Motion.

---

## 5. Logique Métier Détaillée

### A. Flux de Validation du Dossier
1.  **OUVERT**: Le candidat remplit son dossier.
2.  **COMPLET**: Automatiquement activé si :
    - Le candidat clique sur "Soumettre" (après vérification que tous les champs requis sont remplis).
    - OU tous les experts assignés ont auto-sauvegardé un avis.
3.  **VALIDE**: Le Jury valide la décision finale. Le dossier devient immuable.

### B. Calcul de Complétion (Logic)
La complétion est vérifiée avant soumission :
- `yearSummary`, `synthesis`, `knowHow`, `deliverables`, `autonomyJustification`, `careerGoals` doivent être non vides.
- `wishedSalary` and `targetTJM` doivent être > 0.
- Au moins une "Météo Client" doit exister.

### C. Système d'Auto-Save (Experts)
Dans l'Espace Consultant :
- Un `useEffect` avec un `setTimeout` (1000ms) surveille les changements de `formData`.
- Si `hasChanged`, déclenchement de `handleAutoSave` vers Firestore.
- Affichage d'un badge pulse "Synchronisation..." en haut à droite de la carte de saisie.

### D. Gestion des Accès (Security)
- Les candidats ne voient **que** leur propre dossier.
- Les consultants voient les dossiers **qui leur sont assignés** via leur `id` présent dans `assignedConsultantIds` du dossier.
- Les Jury/Admin voient **tous** les dossiers.

---

## 6. Composants Clés (React)
1.  **`App.tsx`**: Contient le listener Firebase global (`onSnapshot`) qui hydrate l'état `dossiers`.
2.  **`Sidebar.tsx`**: Navigation intelligente filtrant les onglets selon les rôles de l'utilisateur connecté.
3.  **`CandidateView.tsx`**: Formulaire multi-onglets (Bilan, Météos, Documents).
4.  **`ConsultantView.tsx`**: Interface de consultation "Light" du candidat + zone de saisie d'avis expert.
5.  **`JuryView.tsx`**: Tableau de bord analytique listant les dossiers avec filtres de statut (`TO_TREAT`, `VALIDE`).
6.  **`StatusBadge.tsx`**: Petit composant affichant le statut avec une couleur spécifique (Vert=VALIDE, Bleu=OUVERT, Orange=COMPLET).

---

## 7. Instructions pour la Reproduction Technique
- **Initialisation**: Utiliser `vite` avec template TS.
- **Firebase**: Configurer Firestore avec des règles sécurisées (ExpertIds array-contains).
- **Responsive**: Utiliser systématiquement les préfixes `md:` et `lg:` de Tailwind pour l'affichage des grilles (1 col sur mobile, 2 ou 3 sur desktop).
- **Inputs**: Utiliser des inputs stylés sans bordure visible par défaut, qui s'illuminent au focus.
