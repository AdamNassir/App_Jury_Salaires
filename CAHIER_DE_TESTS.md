# Cahier de Recette Applicative — Tests d'Acceptation (QA)
## Plateforme de Pilotage de la Campagne de Revalorisation Annuelle — Logiclever

Ce document fait office de **cahier de tests de recette (QA Test Book)** pour valider le bon fonctionnement de l'application Logiclever. Il contient des scénarios pas-à-pas couvrant l'ensemble du périmètre fonctionnel.

---

## Guide Général pour le QA Analyst

* **Environnement** : L'exécution des tests s'effectue directement sur le navigateur.
* **Persistance en Temps Réel** : Tous les tests d'écriture dans la base de données Firestore doivent être constatés de manière réactive sur les autres écrans ouverts en parallèle.
* **Jeux de données de test recommandés** : Utiliser des adresses e-mails distinctes pour simuler les différents rôles.

---

## Index des Scénarios de Test (TC)

* **TC-01** : Authentification et Initialisation du Profil
* **TC-02** : Navigation et Sélecteur de Rôle (Workspace Switcher)
* **TC-03** : Espace Candidat — Mécanisme de Sauvegarde Automatique (Autosave) et Draft Save
* **TC-04** : Espace Candidat — Règles de Contrôle et Soumission de Dossier
* **TC-05** : Espace Candidat — Dépôt de Pièces Jointes
* **TC-06** : Espace Candidat — Calculs et Simulation de Salaire (Moteur de Calculette)
* **TC-07** : Espace Consultant — Évaluation Technique des Dossiers Assignés
* **TC-08** : Espace Jury — Tableau de Bord (Dashboard KPIs) et Synchronisation
* **TC-09** : Espace Jury — Pilotage Analytique et Décision de Revalorisation (`SalaryTable`)
* **TC-10** : Administration Système — Gestion des Droits, Profils et Appairages

---

### TC-01 : Authentification et Initialisation du Profil

* **Objectif** : Vérifier que la connexion via Google Auth fonctionne et qu'un nouveau profil est correctement initialisé dans la base de données Firestore avec les rôles appropriés.
* **Prérequis** : Être déconnecté de l'application. Disposer d'un compte de test.

| Étape | Action attendue | Résultat attendu (OK / KO) |
| :--- | :--- | :--- |
| **1** | Naviguer sur l'application. | L'écran de connexion s'affiche avec le titre "Jury des Salaires", l'illustration moderne et le bouton "Se connecter avec Google". |
| **2** | Cliquer sur "Se connecter avec Google" et s'authentifier. | La connexion réussit. Si le compte de test est l'administrateur système (`guillaumebestece@gmail.com`), il est connecté avec le rôle `JURY` par défaut. Pour tout autre nouvel utilisateur, il est créé avec le rôle `CANDIDATE` par défaut. |
| **3** | Rafraîchir la page (F5) après connexion. | L'utilisateur reste connecté de manière fluide sans repasser par l'écran de connexion (gestion du state d'authentification). |

---

### TC-02 : Navigation et Sélecteur de Rôle (Workspace Switcher)

* **Objectif** : Valider que les utilisateurs disposant de plusieurs rôles applicatifs peuvent changer d'espace de travail facilement et que les droits d'affichage sont respectés.
* **Prérequis** : Être connecté avec un compte doté de plusieurs rôles (ex: `CANDIDATE`, `CONSULTANT` et `JURY`).

| Étape | Action attendue | Résultat attendu (OK / KO) |
| :--- | :--- | :--- |
| **1** | Cliquer sur l'icône Home ou ouvrir le sélecteur d'espace de travail. | L'écran de sélection de rôle s'affiche, listant les interfaces éligibles ("Interface Candidat", "Interface Consultant", "Conseil du Jury", "Administration Système") munies du badge "Inclus". |
| **2** | Sélectionner "Interface Candidat". | L'espace candidat se charge avec l'en-tête "CAMPAGNE ANNUELLE 2025" et le sous-titre "Espace Candidat". Le panneau latéral d'évaluation est disponible. |
| **3** | Cliquer sur le logo de l'en-tête pour retourner à l'accueil puis sélectionner "Conseil du Jury". | Le Dashboard statistique et le tableau analytique de revalorisation s'affichent correctement. |
| **4** | Cliquer sur "Se déconnecter" dans l'en-tête ou le menu de profil. | La session est détruite et l'utilisateur est redirigé instantanément vers la mire d'authentification d'accueil. |

---

### TC-03 : Espace Candidat — Sauvegarde Automatique (Autosave) et Brouillon

* **Objectif** : Valider le mécanisme de sauvegarde automatique de 2 secondes (Autosave) ainsi que la persistance des saisies d'évaluation.
* **Prérequis** : Connecté en tant que `CANDIDATE`. Le dossier doit être au statut `OUVERT` (brouillon).

| Étape | Action attendue | Résultat attendu (OK / KO) |
| :--- | :--- | :--- |
| **1** | Se rendre dans l'onglet **Introduction & Synthèse**. Taper du texte dans le champ "Bilan Général de l'année". | Un indicateur discret indique que la saisie est en cours. Aucun rechargement intempestif ne bloque la frappe au clavier. |
| **2** | Arrêter d'écrire pendant **2 secondes** entières. | Le temporisateur s'épuise. Un indicateur visuel éphémère (icône ou texte de statut) confirme l'enregistrement automatique silencieux en base de données Firestore. |
| **3** | Cliquer sur le bouton manuel "Enregistrer le brouillon". | L'enregistrement est forcé manuellement avec succès. L'indicateur passe au vert. |
| **4** | Rafraîchir entièrement la page de son navigateur (F5) et retourner sur l'onglet **Introduction & Synthèse**. | Les modifications textuelles saisies à l'étape 1 sont parfaitement conservées et affichées à l'écran. |

---

### TC-04 : Espace Candidat — Règles de Contrôle et Soumission de Dossier

* **Objectif** : S'assurer qu'un dossier incomplet ne peut pas être soumis, que l'explication (tooltip) s'affiche au survol, et que la soumission fige les données.
* **Prérequis** : Connecté en tant que `CANDIDATE`. Le dossier doit être au statut `OUVERT`.

| Étape | Action attendue | Résultat attendu (OK / KO) |
| :--- | :--- | :--- |
| **1** | Laisser certains champs requis vides (ex: Fiche de synthèse, Autonomie ou la section Météos Client) et naviguer jusqu'au bouton "Soumettre le dossier". | Le bouton "Soumettre le dossier" est désactivé (couleur grisée, curseur d'interdiction). |
| **2** | Survoler le bouton de soumission désactivé avec le curseur de souris. | Un **Tooltip** explicatif s'affiche au-dessus du bouton avec la mention claire : *"Pour soumettre le dossier merci de renseigner tous les champs obligatoires"*. |
| **3** | Renseigner l'ensemble des champs requis (onglets marqués d'une astérisque rouge `*`) et ajouter au moins une Météo Client avec tous ses détails. | Le bouton "Soumettre le dossier" s'active instantanément (devient cliquable avec la couleur primaire de la marque). Le tooltip n'apparaît plus au survol. |
| **4** | Cliquer sur "Soumettre le dossier". | Le dossier est sauvegardé et son statut passe à `COMPLET`. Tous les champs de saisie, boutons d'ajout et l'autosave sont verrouillés en lecture seule pour le candidat. |

---

### TC-05 : Espace Candidat — Dépôt de Pièces Jointes

* **Objectif** : Tester l'upload et la gestion des fichiers annexes dans le dossier d'évaluation.
* **Prérequis** : Connecté en tant que `CANDIDATE`. Dossier au statut `OUVERT`.

| Étape | Action attendue | Résultat attendu (OK / KO) |
| :--- | :--- | :--- |
| **1** | Se rendre dans l'onglet **Pièces Jointes**. Glisser-déposer un fichier PDF de test dans la zone en pointillé (ou cliquer pour sélectionner un fichier). | Le fichier est pris en compte. L'interface affiche une barre de chargement d'importation. |
| **2** | Vérifier la liste des documents associés au dossier. | Le document apparaît dans la liste avec son nom, sa taille et sa date d'importation. |
| **3** | Cliquer sur l'icône de suppression d'un document importé. | Le fichier est supprimé de la liste et retiré du stockage associé de manière transparente. |

---

### TC-06 : Espace Candidat — Calculs et Simulation de Salaire (Moteur de Calculette)

* **Objectif** : Valider la conformité mathématique de la Calculette de Rémunération par rapport aux règles de gestion Logiclever définies dans le code.
* **Prérequis** : Se rendre sur l'onglet **Calculette du salaire**.

#### Formule de référence pour le test unitaire manuel :
$$\text{Salaire Brut Annuel Cible} = \frac{(\text{Taux de Redistribution} \times 193 \text{ jours} \times \text{TJ}) - 6000 - \text{Prime Ancienneté} - 1188}{1,45 \times 1,01}$$

#### Cas de Test Mathématiques (À vérifier pas-à-pas) :

##### Cas de Test A : Profil Consultant "Confirmé"
* **Grade Actuel / Cible** : `Confirmé` (Taux de redistribution = **0,729**)
* **TJ Vendu / Cible** : **600 €**
* **Ancienneté** : **1 an** (Prime d'Ancienneté = **0 €**)
* **Calcul intermédiaire attendu** :
  $$\text{Raw} = (0,729 \times 193 \times 600) - 6000 - 0 - 1188 = 84418,2 - 7188 = 77230,2$$
  $$\text{Salaire cible attendu} = \frac{77230,2}{1,4645} \approx \mathbf{52\,735\ \text{€/an}}$$

##### Cas de Test B : Profil Consultant "Senior"
* **Grade Actuel / Cible** : `Senior` (Taux de redistribution = **0,752**)
* **TJ Vendu / Cible** : **700 €**
* **Ancienneté** : **4 ans** (Prime d'Ancienneté = **500 €**)
* **Calcul intermédiaire attendu** :
  $$\text{Raw} = (0,752 \times 193 \times 700) - 6000 - 500 - 1188 = 101597,6 - 7688 = 93909,6$$
  $$\text{Salaire cible attendu} = \frac{93909,6}{1,4645} \approx \mathbf{64\,124\ \text{€/an}}$$

##### Cas de Test C : Profil Consultant "Expert" (Ancienneté Expert importante)
* **Grade Actuel / Cible** : `Expert` avec **4 ans de grade Expert** (Taux de redistribution = $0,765 + 0,01 \times \lfloor4/2\rfloor = \mathbf{0,785}$)
* **TJ Vendu / Cible** : **850 €**
* **Ancienneté Logiclever** : **6 ans** (Prime d'Ancienneté = **1000 €**)
* **Calcul intermédiaire attendu** :
  $$\text{Raw} = (0,785 \times 193 \times 850) - 6000 - 1000 - 1188 = 128782,25 - 8188 = 120594,25$$
  $$\text{Salaire cible attendu} = \frac{120594,25}{1,4645} \approx \mathbf{82\,345\ \text{€/an}}$$

| Étape | Action attendue | Résultat attendu (OK / KO) |
| :--- | :--- | :--- |
| **1** | Saisir les paramètres du **Cas de Test A** dans les entrées de la calculette. | Le salaire cible théorique affiché est exactement égal à **52 735 €**. |
| **2** | Saisir les paramètres du **Cas de Test B** dans les entrées de la calculette. | Le salaire cible théorique affiché est exactement égal à **64 124 €**. |
| **3** | Saisir les paramètres du **Cas de Test C** dans les entrées de la calculette. | Le salaire cible théorique affiché est exactement égal à **82 345 €**. |

---

### TC-07 : Espace Consultant — Évaluation Technique

* **Objectif** : S'assurer que le consultant référent peut lire le dossier complet du candidat assigné et consigner son avis de manière isolée et sécurisée.
* **Prérequis** : Connecté en tant que `CONSULTANT`. Au moins un candidat au statut `COMPLET` doit lui être assigné par l'administration.

| Étape | Action attendue | Résultat attendu (OK / KO) |
| :--- | :--- | :--- |
| **1** | Se connecter et accéder à l'**Espace Consultant**. Consulter la liste des candidats assignés. | Les candidats assignés s'affichent avec leur statut de dossier actuel (ex: `COMPLET`). |
| **2** | Cliquer sur "Évaluer" à côté du nom d'un candidat. | Le dossier complet s'affiche sous les yeux du consultant en mode lecture seule structurée. |
| **3** | Saisir les recommandations : TJM Min cible, TJM Max cible, la justification qualitative, les axes d'amélioration et sélectionner un Indice de Confiance technique de 1 à 5. | Les saisies sont réactives et fluides. Les contrôles d'erreurs empêchent les valeurs absurdes (ex: TJM négatif). |
| **4** | Cliquer sur le bouton de validation "Enregistrer l'évaluation". | L'avis technique est lié au dossier du candidat de façon permanente dans Firestore. L'évaluation s'affiche comme "Validée" dans le volet du consultant. |

---

### TC-08 : Espace Jury — Tableau de Bord (Dashboard) et Synchronisation

* **Objectif** : Valider l'affichage consolidé des métriques clés de la campagne et s'assurer que les changements de statuts répercutent les KPIs en direct.
* **Prérequis** : Connecté en tant que `JURY`.

| Étape | Action attendue | Résultat attendu (OK / KO) |
| :--- | :--- | :--- |
| **1** | Accéder à l'**Espace de Pilotage** (Conseil du Jury). | Le panneau Dashboard s'affiche au sommet de l'écran, présentant les indicateurs clés sous forme de compteurs de synthèse visuels (Total Dossiers, Brouillons ouverts, Soumissions complètes, Décisions validées). |
| **2** | Ouvrir un second onglet de navigateur avec un compte `CANDIDATE`, remplir et soumettre un dossier pour le passer de `OUVERT` à `COMPLET`. | Sur l'écran Jury (premier onglet), les compteurs "Brouillons" (décrémenté de 1) et "Soumis / À évaluer" (incrémenté de 1) se mettent à jour automatiquement **sans rechargement manuel de la page (F5)** grâce à la liaison réactive Firestore. |
| **3** | Valider un dossier candidat au niveau du Jury pour le passer au statut `VALIDE`. | Le compteur "Revalorisés / Validés" s'incrémente en direct, et les enveloppes de revalorisation cumulées s'ajustent en conséquence. |

---

### TC-09 : Espace Jury — Pilotage Analytique et Décision de Revalorisation (`SalaryTable`)

* **Objectif** : Valider le fonctionnement du Tableau Analytique des Salaires de la séance plénière de Jury, la saisie des arbitrages et la clôture définitive.
* **Prérequis** : Connecté en tant que `JURY`. Disposer de dossiers au statut `COMPLET`.

| Étape | Action attendue | Résultat attendu (OK / KO) |
| :--- | :--- | :--- |
| **1** | Faire défiler le tableau financier des dossiers. Localiser un candidat au statut `COMPLET`. | Le tableau croise de multiples colonnes analytiques complexes : Salaire actuel vs demandé, TJM actuel vs cible, marges calculées correspondantes, et le salaire théorique recommandé par la formule. |
| **2** | Remplir le formulaire de Décision dans la ligne du candidat : Choisir un verdict (ex: *Ajustement accordé*), saisir un montant de revalorisation (€/an) et ajuster les primes exceptionnelles. | Le pourcentage d'augmentation (%) se calcule en temps réel à l'écran par rapport au salaire de base actuel. |
| **3** | Compléter les appréciations d'orientation de carrière : motifs de décision, conseils du jury, et axes d'efforts attendus. | Les champs de saisie sont persistés de façon sécurisée. |
| **4** | Cliquer sur "Sauvegarder la décision". | L'arbitrage de jury est enregistré à l'état de brouillon d'évaluation. |
| **5** | Cliquer sur le bouton "Valider définitivement la décision" pour ce candidat. | Le dossier passe au statut `VALIDE`. L'Espace de décision est verrouillé. Un e-mail ou une notification de mise à disposition de la revalorisation est déclenchée. Le candidat peut désormais découvrir l'avis et les chiffres depuis son propre espace de travail. |

---

### TC-10 : Administration Système — Gestion des Droits, Profils et Appairages

* **Objectif** : Valider l'écran d'administration pour la gestion des utilisateurs, l'allocation des rôles applicatifs et l'affectation des consultants évaluateurs.
* **Prérequis** : Connecté en tant que `JURY` et accéder à l'onglet **Administration Système**.

| Étape | Action attendue | Résultat attendu (OK / KO) |
| :--- | :--- | :--- |
| **1** | Saisir un nom ou un e-mail dans la barre de recherche des utilisateurs. | L'annuaire filtre de manière instantanée et n'affiche que les lignes d'utilisateurs correspondantes. |
| **2** | Cliquer sur "Modifier" à côté du profil d'un collaborateur. | Une modale ou un panneau d'édition s'ouvre, permettant d'altérer ses attributs (Grade actuel, Salaire brut de référence, TJM actuel de mission, matricule). |
| **3** | Cocher ou décocher des rôles (ex. ajouter le rôle `CONSULTANT` à un utilisateur qui n'était que `CANDIDATE`) et enregistrer. | Les rôles sont instantanément mis à jour dans Firestore. Lors de sa prochaine connexion, l'utilisateur aura accès à l'interface correspondante. |
| **4** | Se rendre dans la section d'affectation technique. Associer un ou plusieurs consultants de la liste au dossier d'un candidat spécifique. | L'association est enregistrée. Le candidat apparaît immédiatement dans l'Espace d'Évaluation de ces consultants référents. |
