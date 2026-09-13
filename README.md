# Jury des salaires Logiclever

Application React / TypeScript servie par Express et Vite. Firebase Authentication identifie les comptes Google ; Firestore conserve les profils APP_LL et les dossiers par campagne. Les imports et les droits sont contrôlés par le serveur Firebase Admin. Gemini intervient uniquement dans l’analyse facultative des documents.

## Démarrage

Node.js 22 ou supérieur. Installer avec `npm ci`, copier `.env.example` vers `.env.local`, puis exécuter `npm run dev` (http://localhost:3000).

Configurer le même projet Firebase dans `firebase-applet-config.json` et `FIREBASE_PROJECT_ID`. Activer Google dans Firebase Authentication et autoriser le domaine de l’application. Le serveur doit disposer d’une identité Firebase Admin : Application Default Credentials avec les droits Firestore/Auth appropriés, ou `FIREBASE_SERVICE_ACCOUNT_JSON` dans les secrets serveur. Ne jamais préfixer ces secrets par `VITE_`.

Définir `ADMIN_EMAILS` (adresses séparées par des virgules) avant la première connexion. Les autres accès sont rattachés au registre APP_LL ; les comptes sans correspondance apparaissent comme demandes dans « Profils & accès ». Un administrateur peut rattacher un compte et attribuer Évaluateur, Jury ou Administrateur. Un associé ou freelance peut évaluer sans être participant à la campagne.

`npm run build` construit le navigateur et `dist/server.cjs`. Démarrer en production avec `NODE_ENV=production npm start` (PowerShell : `$env:NODE_ENV='production'`, puis `npm start`). Conserver les fichiers JSON de configuration à la racine du déploiement. Copier uniquement le frontend dans AI Studio ne suffit pas : conserver aussi Express, `server/`, les dépendances et les secrets serveur. Une identité Google Sheets existante ne donne pas automatiquement des droits Firebase Admin.

Publier les règles et index de `firebase.json` sur le projet cible lors du déploiement, avec `npx firebase deploy --only firestore:rules,firestore:indexes --project <projet>`. Cette commande modifie le projet cible ; elle n’a pas été exécutée pendant le développement. Attendre la création des index avant utilisation.

Gemini nécessite `GEMINI_API_KEY`. La lecture/export Sheets facultative utilise `GOOGLE_SERVICE_ACCOUNT_EMAIL` et `GOOGLE_PRIVATE_KEY`, avec partage des classeurs concernés à ce compte. L’import local XLSX/CSV ne nécessite ni Gemini ni accès Sheets.

## Nouvelle campagne

1. Ouvrir « Campagnes & imports », choisir Nouvelle campagne et l’année.
2. Ajouter les trois classeurs XLSX : `BDD_LL_NEW_DRIVE_test` (Profil), `BDD_API_BOOND_NEW_DRIVE_test` (Boond_Ressources et Boond_Liste_Valeur), `Analyse_Jury_Salaire_2026_test` ou son équivalent annuel (Analyse_Jury). Des CSV séparés sont également acceptés en sélectionnant leur type.
3. Vérifier l’aperçu, corriger les erreurs bloquantes et examiner les avertissements, puis appliquer.

`google-sheets-config.json`, section `campaignImports`, définit les onglets reconnus. Les autres onglets du classeur ne sont pas importés automatiquement. Le registre Profil fournit l’identité stable `Id_Profil`. RH est rapproché par cet ID, sinon par matricule unique, sinon par prénom et nom uniques. Une ambiguïté bloque l’import. Un nom différent avec matricule identique produit un avertissement et conserve l’identité du registre.

Les participants sont ceux du fichier RH. Importer un annuaire entier ne crée pas un dossier pour chaque profil. Un absent de la nouvelle campagne conserve ses archives ; rien n’est supprimé. Les nouveaux profils rejoignent le registre. Les valeurs RH sont figées dans chaque dossier annuel et ne proviennent pas du salaire d’une autre campagne.

L’expérience Boond est résolue par `Id_Annees_Experience_A_Embauche` vers `ID_Boond` dans la famille `Nom_Valeur = Annees_Experience_A_Embauche`, puis `Libelle_Valeur`. Le champ `Id_Valeur` est vide dans les fichiers fournis. L’ancienneté provient des colonnes explicites `Ancienneté chez LL` / `Ancienneté LL` ; aucune date du jour n’est utilisée. Sans durée source, les calculs correspondants restent indisponibles. L’expérience totale vaut expérience à l’embauche + ancienneté si les deux existent, sinon l’expérience totale renseignée dans RH. Les dates d’entrée et de passage expert sont conservées sans inventer de date de référence.

Les champs RH et de délibération incomplets sont acceptés. Une cellule vide ne remplace pas une valeur déjà enregistrée. Les montants français, les zéros et les pourcentages Excel sont conservés. Le libellé daté « Salaire au 30/06/2021 (TJ salaire) » est reconnu comme colonne source, sans renommer artificiellement son année.

Aucun fichier d’initialisation des pairs n’est requis. Dans « Évaluer », chaque évaluateur choisit le candidat, le client, le projet et la relation : Auto_Evaluation, Commerciale, Encadrement, Meteo_Client, Coach Logiclever, Collègue_Mission. Chaque contexte est indépendant et propre à une campagne. Une auto-évaluation ne peut viser que son auteur.

## Rattrapage et mises à jour

Choisir Reprise / mise à jour et l’année historique. Fournir le registre et les sources RH disponibles (le registre déjà importé peut être réutilisé). Ajouter facultativement :

- **Délibérations** : onglet `Deliberation` ou CSV de type RH, avec Id_Profil, Nouveau Grade, TJ vendu (01/07), TJ Cible, Salaire au 30/06, Salaire souhaité au 01/07/AAAA, % Investissement, % Mission, Salaire proposé au 01/07, Salaire MAX proposé si TJ vendu augmente, Pourquoi ce salaire proposé, Ce qu’il faut faire pour avoir plus, Référent Jury de salaire, Ressenti consultant, Retour Second tour.
- **Évaluations** : onglet `Evaluation campagne AAAA` ou CSV de type Évaluations, avec Id_Profil, Id_Profil_Evaluateur (la variante Eveluateur est acceptée), Type_Evaluation, Client, Projet, TJ_Vendu (01/07), Grade, TJ Cible Min, TJ Cible Max, Justification TJ Cible, Axes pour augmenter le TJ, Indice de confiance (0–10). Les anciennes matrices larges doivent être transformées en ce format : elles ne sont pas interprétées comme des relations implicites.
- **Auto-évaluations Drive** : onglet `Autoevaluations` ou CSV Documents, avec Id_Profil et Url_Drive_Evaluation. Le lien Drive est conservé ; le document n’est pas copié ni automatiquement analysé.
- **Météos** : cocher l’import facultatif, fixer explicitement la période et utiliser l’onglet Meteo d’APP_LL ou le bouton de lecture Sheets. Rapprochement par Id_Consultant_Evalue_App_LL, dédoublonnage par Id_Suivi_Meteo. Les textes client/consultant sont conservés ; aucune note n’est inventée.

Une réimportation identique n’ajoute pas de doublons. Les champs non vides peuvent mettre à jour l’année sélectionnée ; l’aperçu décrit ces changements. Une campagne clôturée reste clôturée après reprise. Importer une délibération ou une évaluation ne valide pas automatiquement le dossier. Le jury enregistre explicitement sa décision et sa validation.

Les anciens dossiers basés sur un UID Firebase sont rattachés uniquement si leur ancien compte correspond sans ambiguïté à un email ou matricule APP_LL. Leur identifiant de document et leur contenu historique sont conservés. Les archives sans correspondance restent présentes et sont signalées pour traitement administratif.

## Interruption d’import

Un verrou global empêche deux imports simultanés. Les campagnes concernées passent en préparation pendant les écritures par lots. Chaque lot conserve les versions précédentes sous `importRuns/{runId}/before` ; `importRuns` journalise le résultat. En cas d’échec, corriger la cause puis refaire l’aperçu et appliquer les mêmes fichiers en mode Reprise. Après une interruption du serveur, la récupération administrative devient disponible après 15 minutes sans activité.

Il ne s’agit pas d’une transaction atomique pour tout le classeur : des lots peuvent avoir été enregistrés avant une panne. La reprise est idempotente. Il n’existe pas de bouton de restauration automatique des sauvegardes : une restauration exceptionnelle doit être examinée par un administrateur technique, campagne verrouillée, pour éviter d’écraser des changements ultérieurs.

## Architecture et points d’entrée

- `index.html` → `src/main.tsx` → `src/App.tsx` : session, rôles, campagne sélectionnée, abonnements Firestore et navigation.
- `CampaignWorkspace`, `EvaluationsWorkspace`, `AccessWorkspace` : imports, retours contextualisés et gestion des accès.
- `CandidateView`, `JuryView`, `Dashboard`, `SalaryTable` : dossier, décision explicite et consultation/export de la campagne.
- `src/services/sourceFiles.ts` / `importModel.ts` : lecture ExcelJS/CSV et rapprochement déterministe, sans écriture cloud.
- `server.ts` / `server/campaignApi.ts` : serveur, contrôle des jetons Firebase, aperçu/application/reprise, sessions, évaluations et droits.
- Collections : `users` lie UID d’authentification et profileId ; `profiles` porte l’identité ; `campaigns` porte l’état annuel ; `dossiers` porte les données RH et résultats annuels ; `participants` expose un annuaire de campagne sans salaire ; `evaluations` porte les relations contextualisées ; `importRuns` et `_system/importLock` portent les journaux/verrous.
- Règles : les candidats lisent leur dossier, les évaluateurs leurs évaluations, Jury/Administrateur les dossiers de campagne. Les profils RH et rôles ne sont pas modifiables directement par le navigateur. Les campagnes clôturées bloquent les écritures métier.

API : POST `/api/session`, `/api/import/preview`, `/api/import/apply`, `/api/import/recover`, `/api/campaign/status`, `/api/evaluations/save`, `/api/users/access`; services facultatifs `/api/parse-document`, `/api/sheets/import`, `/api/sheets/export`. Les routes métier exigent un jeton Firebase Bearer et les droits correspondants ; `/api/health` est public.

Dépendances principales : React, Vite, Express, Firebase client/Admin, ExcelJS, Google GenAI, google-auth-library, jsPDF, Mammoth et Tailwind. `package-lock.json` est la référence pour npm.

## Vérification

- `npm run lint` : vérification TypeScript.
- `npm test` : tests du modèle d’import, CSV, rapprochements, historique et fichiers XLSX réels.
- `npm run test:emulators` : nécessite Java 21 et les émulateurs Firebase ; teste les API, Firebase Auth et les règles sur `demo-jury-ll`, sans données de production. Ports Firestore 8185, Auth 9198.
- `npm run build` : construction navigateur et serveur.

Contrôle fonctionnel après configuration : administrateur importe une campagne, un candidat se connecte et retrouve son dossier, un évaluateur externe saisit deux relations différentes, le jury enregistre sa décision, puis clôture la campagne. Vérifier que le passage à une autre année ne change ni les données RH ni les relations de l’année précédente.

Les anciens fichiers SPECIFICATIONS, DOCUMENTATION, CAHIER_DE_TESTS et blueprint décrivent la version antérieure ; ce README décrit le parcours actuel.
