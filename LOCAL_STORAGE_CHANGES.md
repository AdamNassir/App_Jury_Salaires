# Local database migration — 2026-09-16

Campaign confirmation now persists the campaign, people, participants, dossiers, candidate accounts, evaluator accounts, assignments, and campaign file metadata/content as JSON in the browser's LocalStorage. The app no longer initializes Firestore or reads/writes Firestore documents. Google sign-in still uses Firebase Authentication.

## Persistence behavior

- The authoritative database is one JSON object under `app_local_database_v2`, containing `campaigns`, `dossiers`, `users`, `personnes`, and `campaign_participants` arrays.
- On first access, the app loads the bundled `src/data/campaigns.json`, `dossiers.json`, and `users.json` seeds, then replaces each collection with its existing legacy LocalStorage snapshot when present. Empty snapshots remain empty. Legacy keys are retained, but are not read again once the new database exists.
- Campaign launch uses one LocalStorage write for all related records and reports success only after that write succeeds. A failed write does not persist a partial campaign. The initial seed migration is a separate write if this browser has no database yet.
- Repeated initialization preserves existing dossier content, feedback, attachments, decisions, and campaign closure status. Candidate/evaluator registration preserves existing account IDs and roles.
- All database reads and updates share the same storage layer. Subscriptions refresh views in the current tab and react to LocalStorage changes in other tabs on the same origin. Deleted records are not reintroduced from seeds on reload.
- These are browser-local records, not updates to the repository's `.json` files. Different browsers/devices/origins have separate databases. Clearing site storage removes the active database; the next load imports the seeds and any retained legacy keys again. Simultaneous writes from multiple tabs are not a coordinated multi-user database.
- Campaign attachments remain encoded in the stored JSON and count toward browser storage limits. A full or disabled LocalStorage produces a save error. Existing JSON download functions remain available; they export their respective collections, not a complete database backup.
- No existing Firestore data is automatically downloaded. Only bundled seeds and data already stored in this browser are migrated.

## Modified files

| File | Change |
| --- | --- |
| `src/lib/firebase.ts` | Removed Firestore import, initialization, and database export; retained Google authentication. |
| `src/services/localDatabaseService.ts` | Replaced independent in-memory maps and separate storage writes with the shared local store; retained campaign/dossier/participant/person APIs and JSON downloads. |
| `src/services/userDirectoryService.ts` | Reads and writes the shared local store; retains profile normalization and JSON export; merges registrations without duplicating existing account IDs; preserves additional profile fields. |
| `src/services/campaignInitializationService.ts` | Preview reads local records; launch saves all campaign entities in one batch, validates the preview, includes every campaign attachment category, and preserves existing dossier content on relaunch. |
| `src/services/campaignCatchupService.ts` | Historical campaign import now reads and writes the local database. |
| `src/services/dataReconciliationService.ts` | Account/person/dossier reconciliation now uses local records. |
| `src/services/dataCleansing.ts` | Explicit cleanup operations now act on the local database. |
| `src/services/mockSeeder.ts` | Explicit demo-data creation and cleanup now act on the local database. |
| `src/App.tsx` | Removed background Firestore subscriptions; profiles and dossiers use local subscriptions; candidate dossier lookup supports canonical profile IDs as well as authentication IDs. |
| `src/components/CampaignManagement.tsx` | Campaign list and closure use local data, including empty lists; removed the second campaign creation write after launch. |
| `src/components/campaigns/CreateCampaignModal.tsx` | Launch waits for the complete local save; removed obsolete parent creation callback and Firestore wording; includes other attachments without mutating React state; handles file-read failure/abort. |
| `src/components/UserManagement.tsx` | User list, creation, imports, role/assignment edits, and deletion use local data; removed duplicate synchronization and writes; initializes new reports with shared defaults. |
| `src/components/users/UserRowDrawer.tsx` | Inline profile edits save to the local database. |
| `src/components/CandidateView.tsx` | Report edits, submissions, document-related writes, and evaluator lookup use local data; removed duplicate writes; reuses shared report defaults. |
| `src/components/candidate/tabs/DocumentsTab.tsx` | Document removal writes to the local database. |
| `src/components/ConsultantView.tsx` | Campaign/candidate lookup and evaluator feedback use local data; removed duplicate subscriptions and writes; candidate list replacement reflects removals. |
| `src/components/JuryView.tsx` | Candidate profiles use the local directory only; list refreshes reflect edits and removals. |
| `src/components/jury/JuryDecisionForm.tsx` | Decision autosave and validation use the local service only; removed duplicate writes. |
| `src/components/SalaryTable.tsx` | Salary decision edits save to the local database. |
| `src/components/Dashboard.tsx` | Candidate queries and subscriptions use the local database. |

## Added files

| File | Purpose |
| --- | --- |
| `src/services/localStore.ts` | Shared JSON persistence, seed/legacy migration, atomic batched mutations, local subscriptions, cross-tab notifications, and storage error handling. |
| `src/lib/localDatabase.ts` | Local document/query/batch API for existing components and import services. Despite familiar operation names, it makes no Firebase database or network calls. |
| `src/data/defaultAnnualReport.ts` | Shared complete defaults extracted from the candidate form, also used when creating dossiers. |
| `tests/localDatabase.test.ts` | Regression coverage for migration, empty legacy collections, campaign launch, shared reads/edits, reload, deletion, relaunch preservation, failed saves, invalid previews, nested updates, cross-tab notifications, account identity, and absence of Firestore imports. |
| `LOCAL_STORAGE_CHANGES.md` | This behavior and file-change record. |

## Verification

Run from the project root:

```sh
npm run lint
node --import tsx --test tests/localDatabase.test.ts
npm run build
```

The tests execute the real persistence and campaign initialization code with an in-memory implementation of the browser Storage API. They do not constitute a manual authenticated browser walkthrough.

Final results: TypeScript check passed; all 12 regression tests passed; production build passed. Validation installed `node_modules/` and generated the compiled frontend/server in `dist/`; both directories are already ignored by the project.

The existing `package-lock.json` does not match the declared dependencies, so `npm ci` fails before installation. Dependencies for validation were installed with `npm install --no-package-lock --no-audit --no-fund`; package manifests and lockfiles were not changed. The production build emits a large-chunk advisory.

## Follow-up: visible Google sign-in errors — 2026-09-16

After transferring the app to a new AI Studio instance, the Google popup briefly appeared and closed without an explanation on the login screen. The exact provider failure in that instance is still unconfirmed. The following changes expose the real error and separate authentication failures from local profile-loading failures.

| File | Change |
| --- | --- |
| `src/App.tsx` | Catches sign-in errors and displays the original code/message below the button; shows a pending state and prevents repeated clicks; displays redirect failures; catches local profile-loading failures with retry and sign-out actions. |
| `src/lib/firebase.ts` | Retains redirect errors for the UI instead of only logging them; makes the optional Google token session cache tolerate denied browser storage, using its existing memory cache. Firebase Authentication and the existing Google/Sheets scopes remain in use. |
| `src/lib/authErrors.ts` (new) | Formats provider/storage error codes and messages without displaying credential/custom-data objects. |
| `src/components/AuthErrorNotice.tsx` (new) | Shared accessible error notice; displays diagnostic text safely as text. |
| `tests/authErrors.test.ts` (new) | Verifies original error details, readable fallbacks, and safe error rendering. |
| `tests/auth.browser.test.ts` (new) | Runs the actual App in isolated headless Chromium with a simulated Firebase provider; verifies pending state, popup and redirect errors, denied storage, profile retry, sign-out, and absence of unhandled promise rejections. |
| `LOCAL_STORAGE_CHANGES.md` | Records this follow-up and its verification. |

To transfer this fix, include **all four runtime files** listed above, including both new files. Updating only `App.tsx` or `firebase.ts` leaves missing imports. No Firebase project settings, authorized domains, authentication providers, or production data were changed.

Verification: all 18 tests passed, including the browser test; TypeScript and the production build passed. The build retains its large-chunk advisory. The browser test uses a simulated provider and does not confirm that real Google sign-in works in the user's AI Studio instance.

```powershell
# Set this to an installed Chromium/Chrome executable to include the browser test.
$env:AUTH_TEST_BROWSER = 'C:\path\to\chrome.exe'
node --import tsx --test tests/authErrors.test.ts tests/auth.browser.test.ts tests/localDatabase.test.ts
npm run lint
npm run build
```

Without `AUTH_TEST_BROWSER`, the browser test is skipped. It uses a temporary browser profile and does not access an existing Google session. After transferring the runtime changes, retry Google sign-in and use the newly visible error code/message to identify the environment-specific fix.
