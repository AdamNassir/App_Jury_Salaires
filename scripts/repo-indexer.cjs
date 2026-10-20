#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const INDEX_FILE = path.resolve(__dirname, '../Indexation_repo.json');

// --- Helper: scan repository files ---
function scanRepoFiles(dir = path.resolve(__dirname, '..'), list = []) {
  const ignore = new Set(['node_modules', '.git', 'dist', '.cache', '.aistudio', 'scripts']);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignore.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanRepoFiles(full, list);
    } else {
      const rel = path.relative(path.resolve(__dirname, '..'), full);
      if (rel !== 'Indexation_repo.json') {
        list.push(rel);
      }
    }
  }
  return list;
}

// --- Helper: extract static imports ---
function extractDependencies(filePath, allFiles) {
  const ext = path.extname(filePath);
  if (!['.ts', '.tsx', '.js', '.cjs'].includes(ext)) {
    // Non-code dependencies known by convention
    if (filePath === 'firestore.rules') return ['firebase-blueprint.json'];
    return [];
  }
  const content = fs.readFileSync(path.resolve(__dirname, '..', filePath), 'utf8');
  const dir = path.dirname(filePath);
  const deps = [];
  const importRegex = /(?:import|export)\s+(?:(?:(?:\* as \w+|[\w\s{},]+)\s+from\s+)?["\x27]([\.\/][^"\x27]+)["\x27]|["\x27]([\.\/][^"\x27]+)["\x27])/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1] || match[2];
    if (!importPath || !importPath.startsWith('.')) continue;
    const base = path.normalize(path.join(dir, importPath));
    const candidates = [
      base,
      base + '.ts',
      base + '.tsx',
      base + '.js',
      base + '.json',
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx')
    ];
    for (const c of candidates) {
      if (allFiles.includes(c)) {
        if (!deps.includes(c)) deps.push(c);
        break;
      }
    }
  }
  return deps.sort();
}

// --- Helper: extract top exported symbols ---
function extractExports(filePath) {
  const ext = path.extname(filePath);
  if (!['.ts', '.tsx'].includes(ext)) return undefined;
  const content = fs.readFileSync(path.resolve(__dirname, '..', filePath), 'utf8');
  const matches = content.match(/export\s+(?:const|function|class|type|interface|enum)\s+(\w+)/g);
  if (!matches) return undefined;
  const list = matches.map(m => m.replace(/export\s+(?:const|function|class|type|interface|enum)\s+/, '')).slice(0, 4);
  return list.length > 0 ? list : undefined;
}

// --- Category definitions & keyword routing ---
const ROUTING_METADATA = {
  auth_security: {
    name: "Authentication & Core Security",
    desc: "User session management, Firebase Auth bindings, Firestore security rules, and auth error handling.",
    keywords: ["auth", "login", "session", "user", "firestore rules", "credentials", "security", "token", "firebase"],
    patterns: ["src/lib/firebase*", "src/lib/auth*", "firestore.rules", "firebase-*.json", "tests/auth*"]
  },
  salary_deliberation: {
    name: "Salary Calculations & Deliberation Rules",
    desc: "Compensation calculations, grade step tariffs, seniority bonuses, and catchup campaign salary logic.",
    keywords: ["salary", "remuneration", "prime", "coefficient", "grade", "taux", "augmentation", "rattrapage"],
    patterns: ["src/lib/salaryUtils.ts", "src/services/campaignCatchupService.ts", "src/config/**"]
  },
  campaign_services: {
    name: "Campaign Lifecycle & Data Services",
    desc: "Operations for campaign synchronization, Google Sheets/Drive connectors, user directory, and data reconciliation.",
    keywords: ["campaign", "sheets", "drive", "objectives", "reconciliation", "sync", "directory", "cleansing"],
    patterns: ["src/services/**"]
  },
  candidate_evaluation: {
    name: "Candidate Dossier & Evaluation UI",
    desc: "Evaluation tabs for consultant skills, career bilan, objectives, pretentions, autonomy tables, and feedback.",
    keywords: ["candidate", "dossier", "evaluation", "tabs", "bilan", "pretentions", "skills", "autonomie", "feedback"],
    subcats: {
      shell: "Evaluation framing, criteria guidelines, autonomy and grade scale tables",
      tabs: "Dossier evaluation tabs including objectives, pretentions, satisfaction, and feedback"
    },
    patterns: ["src/components/candidate/**"]
  },
  jury_deliberation: {
    name: "Jury Deliberation Room & Voting UI",
    desc: "Deliberation interface, live candidate review header, decision forms, voter controls, and deliberations log.",
    keywords: ["jury", "deliberation", "jury room", "decision", "vote", "salary table", "deliberations table"],
    patterns: ["src/components/jury/**", "src/components/JuryView.tsx", "src/components/SalaryTable.tsx", "src/components/JuryDeliberationsTable.tsx"]
  },
  user_admin: {
    name: "User Administration & Role Management",
    desc: "User management directory, modal forms for user creation/deletion, jury assignment, and user profile drawer.",
    keywords: ["user admin", "create user", "delete user", "constituer jury", "user drawer", "user roles"],
    patterns: ["src/components/users/**", "src/components/UserManagement.tsx"]
  },
  navigation_views: {
    name: "Navigation, Layout & Application Views",
    desc: "Top-level views (Dashboard, Campaign Management, Consultant View, Personal Space), navigation bar, and main app container.",
    keywords: ["navbar", "layout", "routing", "dashboard", "personal space", "consultant view", "campaign card"],
    patterns: ["src/App.tsx", "src/main.tsx", "src/components/Navbar.tsx", "src/components/Dashboard.tsx", "src/components/personal/**", "src/components/campaigns/**"]
  },
  storage_persistence: {
    name: "Client Storage & Persistence Layer",
    desc: "IndexedDB wrapper, offline mock database operations, and local storage state persistence.",
    keywords: ["indexeddb", "database", "local storage", "dexie", "persistence", "offline store"],
    patterns: ["src/lib/localDatabase.ts", "src/services/localDatabaseService.ts", "src/services/localStore.ts"]
  },
  domain_types: {
    name: "Domain Models & TypeScript Interfaces",
    desc: "Centralized data models, campaign schemas, candidate dossiers, and Google Sheets integration contracts.",
    keywords: ["types", "interfaces", "data contracts", "models", "schemas"],
    patterns: ["src/types.ts", "src/types/**"]
  },
  shared_utilities: {
    name: "Shared Utilities & Mathematical Helpers",
    desc: "Formatting helpers, Tailwind class merges, percentage optimizer algorithms, PDF generation, and URL parameter encoders.",
    keywords: ["utils", "helpers", "pdf", "url", "percentage optimizer", "formatters", "cn"],
    patterns: ["src/lib/utils.ts", "src/lib/percentageOptimizer.ts", "src/utils/**"]
  },
  data_fixtures: {
    name: "Data Fixtures & Seed Records",
    desc: "Static JSON seed files representing initial campaigns, sample candidates, mock dossiers, and default annual report fixtures.",
    keywords: ["fixtures", "seed", "mock data", "campaigns.json", "dossiers.json", "users.json"],
    patterns: ["data/**", "src/data/**"]
  },
  test_suites: {
    name: "Automated Test Suites",
    desc: "End-to-end browser tests, database test suites, and campaign launch validation specifications.",
    keywords: ["test", "specs", "e2e", "browser test", "vitest", "unit test"],
    patterns: ["tests/**"]
  },
  config_project_docs: {
    name: "Build Configuration & Specifications",
    desc: "Tooling configurations (Vite, TypeScript, Tailwind), HTML entry, server runner, and project specification documentation.",
    keywords: ["vite", "tsconfig", "package.json", "tailwind", "server", "specifications", "documentation"],
    patterns: ["*.md", "*.json", "vite.config.ts", "server.ts", "index.html"]
  }
};

// --- Determine category & subcategory ---
function getCategoryInfo(filePath) {
  if (filePath.startsWith('src/lib/firebase') ||
      filePath.startsWith('src/lib/auth') ||
      filePath.startsWith('src/components/AuthErrorNotice') ||
      filePath.startsWith('firestore.rules') ||
      filePath.startsWith('firebase-') ||
      filePath.startsWith('tests/auth')) {
    return { cat: 'auth_security' };
  }
  if (filePath === 'src/lib/salaryUtils.ts' ||
      filePath === 'src/services/campaignCatchupService.ts' ||
      filePath === 'src/config/campaign_column_specifications.json') {
    return { cat: 'salary_deliberation' };
  }
  if (filePath.startsWith('src/components/candidate/tabs/')) {
    return { cat: 'candidate_evaluation', subcat: 'tabs' };
  }
  if (filePath.startsWith('src/components/candidate/')) {
    return { cat: 'candidate_evaluation', subcat: 'shell' };
  }
  if (filePath.startsWith('src/components/jury/') ||
      filePath === 'src/components/JuryView.tsx' ||
      filePath === 'src/components/SalaryTable.tsx' ||
      filePath === 'src/components/JuryDeliberationsTable.tsx') {
    return { cat: 'jury_deliberation' };
  }
  if (filePath.startsWith('src/components/users/') || filePath === 'src/components/UserManagement.tsx') {
    return { cat: 'user_admin' };
  }
  if (filePath === 'src/lib/localDatabase.ts' ||
      filePath === 'src/services/localDatabaseService.ts' ||
      filePath === 'src/services/localStore.ts') {
    return { cat: 'storage_persistence' };
  }
  if (filePath === 'src/types.ts' || filePath.startsWith('src/types/')) {
    return { cat: 'domain_types' };
  }
  if (filePath.startsWith('data/') || filePath.startsWith('src/data/')) {
    return { cat: 'data_fixtures' };
  }
  if (filePath.startsWith('src/services/')) {
    return { cat: 'campaign_services' };
  }
  if (filePath.startsWith('src/utils/') ||
      filePath === 'src/lib/utils.ts' ||
      filePath === 'src/lib/percentageOptimizer.ts') {
    return { cat: 'shared_utilities' };
  }
  if (filePath.startsWith('tests/')) {
    return { cat: 'test_suites' };
  }
  if (filePath.startsWith('src/components/campaigns/') ||
      filePath === 'src/components/CampaignManagement.tsx' ||
      filePath === 'src/components/personal/PersonalSpaceView.tsx' ||
      filePath === 'src/components/Dashboard.tsx' ||
      filePath === 'src/components/CandidateView.tsx' ||
      filePath === 'src/components/ConsultantView.tsx' ||
      filePath === 'src/components/Navbar.tsx' ||
      filePath === 'src/components/admin/AdminLinksTable.tsx' ||
      filePath === 'src/components/salary/OptimizerSuggestionsModal.tsx' ||
      filePath === 'src/App.tsx' ||
      filePath === 'src/main.tsx' ||
      filePath === 'src/index.css') {
    return { cat: 'navigation_views' };
  }
  return { cat: 'config_project_docs' };
}

// --- Modification policy lookup ---
function getPolicy(filePath) {
  if (filePath.startsWith('src/lib/firebase') ||
      filePath.startsWith('src/lib/auth') ||
      filePath.startsWith('src/components/AuthErrorNotice') ||
      filePath.startsWith('firestore.rules') ||
      filePath.startsWith('firebase-') ||
      filePath.startsWith('tests/auth')) {
    return 'never_edit';
  }
  if (filePath === 'bun.lock') return 'generated';
  if (filePath === 'package.json' ||
      filePath === 'metadata.json' ||
      filePath === 'index.html' ||
      filePath === 'server.ts' ||
      filePath === 'vite.config.ts' ||
      filePath === 'tsconfig.json' ||
      filePath === '.env.example' ||
      filePath === 'google-sheets-config.json' ||
      filePath === 'google-sheets-config.example.json' ||
      filePath.startsWith('data/')) {
    return 'approval_required';
  }
  return 'editable';
}

// --- Curated file descriptions (domain-specific, concise, zero file names mentioned) ---
const FILE_DESCRIPTIONS = {
  // auth_security
  'firebase-applet-config.json': 'Firebase project configuration defining client credentials and authentication domain.',
  'firebase-blueprint.json': 'Database blueprint specifying Firestore document structures, collections, and security constraints.',
  'firestore.rules': 'Database security rules enforcing role-based authorization and collection access controls.',
  'src/components/AuthErrorNotice.tsx': 'Error notification banner displayed when authentication or database connectivity encounters failures.',
  'src/lib/authErrors.ts': 'Error code mapper translating authentication service exceptions into localized user feedback.',
  'src/lib/firebase.ts': 'Firebase SDK initialization establishing authentication service and database client connections.',
  'tests/auth.browser.test.ts': 'Browser-based integration test verifying user authentication, session persistence, and logout flow.',
  'tests/authErrors.test.ts': 'Unit tests validating error code translation and formatting for authentication failures.',

  // salary_deliberation
  'src/config/campaign_column_specifications.json': 'Spreadsheet column schema mapping column headers and formats for salary deliberated data.',
  'src/lib/salaryUtils.ts': 'Compensation logic calculating grade salary grids, step coefficients, and seniority bonuses.',
  'src/services/campaignCatchupService.ts': 'Service computing multi-year salary catchup adjustments and compensation recommendations.',

  // campaign_services
  'src/services/appLinksService.ts': 'Service persisting and resolving external links for Google Sheets and Google Drive resources.',
  'src/services/campaignColumnsSpecificationService.ts': 'Service loading and validating column structure specifications for imported campaign sheets.',
  'src/services/campaignInitializationService.ts': 'Service orchestrating new evaluation campaign creation and initial candidate records setup.',
  'src/services/dataCleansing.ts': 'Data sanitation service normalizing candidate names, salary figures, and dates.',
  'src/services/dataReconciliationService.ts': 'Service reconciling differences between local candidate records and remote spreadsheet data.',
  'src/services/driveObjectivesService.ts': 'Service retrieving and synchronizing annual performance objective documents from cloud storage.',
  'src/services/dummyUsersGenerator.ts': 'Synthetic data generator producing mock consultant profiles for local testing.',
  'src/services/googleSheetsConfigService.ts': 'Service reading and persisting spreadsheet IDs, tab selections, and sync preferences.',
  'src/services/googleSheetsService.ts': 'API client interfacing with external spreadsheets for reading and saving deliberation data.',
  'src/services/localDatabaseService.ts': 'High-level database access service providing CRUD operations for campaigns, users, and evaluations.',
  'src/services/localStore.ts': 'Low-level persistence service wrapping browser key-value storage for offline operations.',
  'src/services/referentDataService.ts': 'Service extracting and managing career referent appraisals and guidance notes.',
  'src/services/userDirectoryService.ts': 'Service handling user lookup, directory queries, and role verification.',

  // storage_persistence
  'src/lib/localDatabase.ts': 'Client-side indexed database wrapper providing offline document persistence and transaction support.',
  'tests/localDatabase.test.ts': 'Test suite verifying database initialization, indexing, transactions, and fallback behaviors.',

  // candidate_evaluation
  'src/components/candidate/AutonomieGuidelineTable.tsx': 'Reference table presenting behavioral guidelines and autonomy expectations per experience level.',
  'src/components/candidate/CandidateUI.tsx': 'Shared UI elements, progress indicators, and status badges for candidate appraisal cards.',
  'src/components/candidate/GradeCriteriaTable.tsx': 'Reference matrix displaying promotion requirements, competencies, and evaluation criteria per grade.',
  'src/components/candidate/tabs/BilanIntroTab.tsx': 'Evaluation tab presenting consultant overview, career progression, and current assignments.',
  'src/components/candidate/tabs/DocumentsTab.tsx': 'Evaluation tab displaying attached annual reports, external links, and uploaded files.',
  'src/components/candidate/tabs/EngagementTab.tsx': 'Evaluation tab capturing consultant participation in internal initiatives and community events.',
  'src/components/candidate/tabs/ExpertisesTab.tsx': 'Evaluation tab listing technical proficiencies, tools, certifications, and domain expertise.',
  'src/components/candidate/tabs/IntercontratTab.tsx': 'Evaluation tab tracking non-billable periods, internal projects, and training activities.',
  'src/components/candidate/tabs/JuryFeedbacksTab.tsx': 'Evaluation tab displaying feedback history, deliberation outcomes, and jury recommendations.',
  'src/components/candidate/tabs/MeteosTab.tsx': 'Evaluation tab presenting project climate ratings, consultant sentiment scores, and feedback.',
  'src/components/candidate/tabs/ObjectivesTab.tsx': 'Evaluation tab displaying annual performance targets, key results, and achievement assessments.',
  'src/components/candidate/tabs/PeerFeedbacksTab.tsx': 'Evaluation tab displaying peer reviews, 360-degree feedback, and colleague assessments.',
  'src/components/candidate/tabs/PretentionsTab.tsx': 'Evaluation tab capturing consultant salary expectations, requested promotions, and desires.',
  'src/components/candidate/tabs/ReferentTab.tsx': 'Evaluation tab presenting career referent evaluations, growth trajectory, and guidance notes.',
  'src/components/candidate/tabs/SalaryCalculatorTab.tsx': 'Interactive compensation calculator generating proposed salary packages based on grade grids.',
  'src/components/candidate/tabs/SatisfactionTab.tsx': 'Evaluation tab presenting workplace satisfaction scores and feedback survey results.',
  'src/components/candidate/tabs/SkillsDossierFields.tsx': 'Interactive form fields allowing review and editing of candidate competencies and tools.',
  'src/components/candidate/tabs/SyntheseTab.tsx': 'Synthesis tab summarizing candidate ratings, autonomy level, and overall deliberation readiness.',

  // jury_deliberation
  'src/components/JuryView.tsx': 'Live jury deliberation view coordinating candidate presentation, dossier review, and voting.',
  'src/components/SalaryTable.tsx': 'Comparative salary table displaying current salaries, benchmarks, and proposed compensation.',
  'src/components/JuryDeliberationsTable.tsx': 'Summary table presenting campaign deliberation decisions, status indicators, and final grades.',
  'src/components/jury/JuryCandidateHeader.tsx': 'Header component displaying candidate identity, current salary, and target promotion in deliberation room.',
  'src/components/jury/JuryCandidateList.tsx': 'Queue navigation list allowing jury members to switch between candidates awaiting deliberation.',
  'src/components/jury/JuryDecisionForm.tsx': 'Deliberation decision form recording final salary decisions, promotion votes, and jury notes.',
  'src/components/jury/JuryDossierViewer.tsx': 'Embedded candidate dossier viewer displaying comprehensive evaluation tabs during deliberation.',
  'src/components/jury/JuryUI.tsx': 'Common UI primitives, action buttons, and status indicators tailored for the jury interface.',

  // user_admin
  'src/components/UserManagement.tsx': 'User administration dashboard for viewing, filtering, and managing user roles and profiles.',
  'src/components/users/ConstituerJuryModal.tsx': 'Modal dialog for selecting jury members and assembling deliberation committees.',
  'src/components/users/CreateUserModal.tsx': 'Modal dialog for registering new consultants or user accounts in the application.',
  'src/components/users/DeleteUserModal.tsx': 'Confirmation dialog for permanently removing a single user account.',
  'src/components/users/MassDeleteUsersModal.tsx': 'Confirmation dialog for batch removal of multiple user accounts.',
  'src/components/users/UserCommonUI.tsx': 'Shared UI components, status tags, and avatar badges for user administration.',
  'src/components/users/UserRowDrawer.tsx': 'Slide-over detail drawer for viewing and modifying individual user attributes and permissions.',

  // navigation_views
  'src/App.tsx': 'Application root component providing main view routing, authentication guarding, and header display.',
  'src/main.tsx': 'Client application entry point initializing React DOM rendering and error boundary.',
  'src/index.css': 'Global stylesheet configuring utility typography, design theme tokens, and base layout styles.',
  'src/components/Navbar.tsx': 'Application header bar providing navigation links, current user status, and logout button.',
  'src/components/CandidateView.tsx': 'Full candidate profile view displaying comprehensive dossier evaluation tabs.',
  'src/components/ConsultantView.tsx': 'Consultant self-service view enabling individual review of career milestones and goals.',
  'src/components/Dashboard.tsx': 'Analytics dashboard presenting campaign summaries, salary distributions, and decision metrics.',
  'src/components/CampaignManagement.tsx': 'Campaign administration view for configuring, launching, and managing deliberation campaigns.',
  'src/components/campaigns/CampaignCard.tsx': 'Card component presenting campaign summary details, status badges, and action menus.',
  'src/components/campaigns/CampaignDocsModal.tsx': 'Modal displaying linked documentation and spreadsheet resources for a campaign.',
  'src/components/campaigns/CatchupCampaignModal.tsx': 'Modal dialog for configuring and launching multi-year compensation catchup campaigns.',
  'src/components/campaigns/CloseCampaignModal.tsx': 'Confirmation dialog for closing and archiving a completed evaluation campaign.',
  'src/components/campaigns/CreateCampaignModal.tsx': 'Modal dialog for initiating a new deliberation campaign with target year and title.',
  'src/components/campaigns/DeleteAllDossiersModal.tsx': 'Confirmation dialog for resetting and removing all dossiers within a campaign.',
  'src/components/campaigns/DeleteCampaignModal.tsx': 'Confirmation dialog for permanently deleting an evaluation campaign.',
  'src/components/personal/PersonalSpaceView.tsx': 'Personal space dashboard visualizing career progress, salary trends, and objectives.',
  'src/components/admin/AdminLinksTable.tsx': 'Administration panel managing external links to Google Drive directories and spreadsheets.',
  'src/components/salary/OptimizerSuggestionsModal.tsx': 'Modal dialog displaying automated compensation adjustment recommendations.',

  // domain_types
  'src/types.ts': 'Core type definitions specifying candidate models, campaign schemas, and deliberation data contracts.',
  'src/types/googleSheetsConfig.ts': 'Type definitions declaring configuration schemas and sync options for external spreadsheets.',

  // shared_utilities
  'src/lib/percentageOptimizer.ts': 'Optimization algorithm balancing salary adjustments to maximize target budget utilization.',
  'src/lib/utils.ts': 'General utility helpers including conditional class concatenation and date formatters.',
  'src/utils/pdfGenerator.ts': 'Document generator compiling candidate evaluation summaries into downloadable PDF reports.',
  'src/utils/urlUtils.ts': 'Utility functions for URL parameter extraction, encoding, and navigation helpers.',

  // data_fixtures
  'data/campaignColumnsSpecifications.json': 'Seed specification defining spreadsheet column mapping schemas for campaign import.',
  'data/campaigns.json': 'Seed data file containing sample evaluation campaign records.',
  'data/dossiers.json': 'Seed data file containing mock candidate dossiers and evaluation scores.',
  'data/users.json': 'Seed data file containing mock user profiles and administrative roles.',
  'src/data/campaignColumnsSpecifications.json': 'Bundled column specification definitions used for default campaign creation.',
  'src/data/campaigns.json': 'Bundled sample campaign records used for offline testing and initial seeding.',
  'src/data/defaultAnnualReport.ts': 'Default report template providing structured evaluation sections for annual interviews.',
  'src/data/dossiers.json': 'Bundled sample evaluation dossiers used for offline development and testing.',
  'src/data/users.json': 'Bundled sample user accounts used for offline development and testing.',

  // test_suites
  'tests/campaignLaunch.browser.test.ts': 'Browser-based end-to-end test verifying campaign creation, sheet sync, and launch lifecycle.',

  // config_project_docs
  '.env.example': 'Environment variable declaration template outlining required keys without credentials.',
  '.gitignore': 'Version control exclusion list specifying temporary files, build outputs, and dependencies.',
  'CAHIER_DE_TESTS.md': 'Quality assurance test plan and scenario specifications for platform features.',
  'DOCUMENTATION.md': 'System architectural documentation, component hierarchies, and operational procedures.',
  'LOCAL_STORAGE_CHANGES.md': 'Changelog recording persistence schema migrations and local storage modifications.',
  'README.md': 'Repository introduction, architecture overview, installation steps, and development guide.',
  'SPECIFICATIONS.md': 'Functional specifications defining business domain rules, user roles, and workflows.',
  'blueprint.md': 'Architecture blueprint detailing service interfaces, data flows, and security guidelines.',
  'branding.txt': 'Brand identity specifications including primary colors, accent tones, and visual styling guidelines.',
  'bun.lock': 'Package manager lockfile pinning exact versions of third-party dependencies.',
  'google-sheets-config.example.json': 'Template file demonstrating spreadsheet configuration options for external synchronization.',
  'google-sheets-config.json': 'Local configuration file storing active spreadsheet identifiers and sheet names.',
  'index.html': 'Single page application HTML template defining document root, title, and viewport.',
  'metadata.json': 'Platform manifest specifying application metadata, capabilities, and system parameters.',
  'package.json': 'Package definition file declaring project dependencies, build commands, and script runners.',
  'security_spec.md': 'Security specification detailing authentication protocols, authorization matrices, and protection rules.',
  'server.ts': 'Production HTTP server configuration serving static assets and dev proxy endpoints.',
  'tsconfig.json': 'TypeScript compiler configuration defining syntax flags, module resolution, and path mappings.',
  'untitled.tsx': 'Unused scratch template file kept for reference.',
  'vite.config.ts': 'Vite bundler configuration specifying plugins, server port settings, and build optimizations.'
};

// --- Command: build ---
function buildIndex() {
  const allFiles = scanRepoFiles();
  const filesRegistry = {};

  for (const f of allFiles.sort()) {
    const cInfo = getCategoryInfo(f);
    const deps = extractDependencies(f, allFiles);
    const exports = extractExports(f);
    const policy = getPolicy(f);

    const entry = {
      cat: cInfo.cat,
      desc: FILE_DESCRIPTIONS[f] || "Component or resource supporting this functional domain.",
      policy: policy
    };
    if (cInfo.subcat) entry.subcat = cInfo.subcat;
    if (deps.length > 0) entry.deps = deps;
    if (exports && exports.length > 0) entry.exports = exports;

    // Associated test links
    if (f === 'src/lib/firebase.ts' || f === 'src/lib/authErrors.ts') {
      entry.tests = ['tests/auth.browser.test.ts', 'tests/authErrors.test.ts'];
    } else if (f === 'src/lib/localDatabase.ts' || f === 'src/services/localDatabaseService.ts') {
      entry.tests = ['tests/localDatabase.test.ts'];
    } else if (f === 'src/components/CampaignManagement.tsx') {
      entry.tests = ['tests/campaignLaunch.browser.test.ts'];
    }

    filesRegistry[f] = entry;
  }

  const indexData = {
    $schemaVersion: "2.0.0",
    updatedAt: new Date().toISOString(),
    totalFiles: Object.keys(filesRegistry).length,
    policies: {
      never_edit: "CRITICAL / IMMUTABLE: Authentication and core security files must never be modified under any circumstances.",
      approval_required: "EXPLICIT APPROVAL REQUIRED: Root configuration, project metadata, package definitions, server runner, or seed fixtures.",
      generated: "DO NOT EDIT DIRECTLY: Artifacts produced automatically by package managers or compilers (e.g. bun.lock).",
      editable: "STANDARD CODE: Application source files, components, services, and tests modifiable after explaining rationale."
    },
    routing: ROUTING_METADATA,
    files: filesRegistry
  };

  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2), 'utf8');
  console.log(`[OK] Successfully rebuilt Indexation_repo.json with ${Object.keys(filesRegistry).length} files.`);
}

// --- Command: categories (Progressive Retrieval Step 1) ---
function printCategories() {
  const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  console.log(JSON.stringify({
    $schemaVersion: data.$schemaVersion,
    policies: data.policies,
    routing: data.routing
  }, null, 2));
}

// --- Command: list <category> (Progressive Retrieval Step 2) ---
function listCategory(catName) {
  const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const matches = {};
  for (const [fPath, fObj] of Object.entries(data.files)) {
    if (fObj.cat === catName) {
      matches[fPath] = fObj;
    }
  }
  console.log(JSON.stringify(matches, null, 2));
}

// --- Command: inspect <filepath> (Progressive Retrieval Step 3) ---
function inspectFile(targetPath) {
  const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const entry = data.files[targetPath];
  if (!entry) {
    console.error(`File "${targetPath}" not found in index.`);
    process.exit(1);
  }
  // Compute reverse impact (files depending on targetPath)
  const consumers = [];
  for (const [fPath, fObj] of Object.entries(data.files)) {
    if (fObj.deps && fObj.deps.includes(targetPath)) {
      consumers.push(fPath);
    }
  }

  const result = {
    path: targetPath,
    ...entry,
    consumers: consumers
  };
  console.log(JSON.stringify(result, null, 2));
}

// --- Command: query <prompt or keyword> (Progressive Retrieval search) ---
function queryIndex(queryString) {
  const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const q = queryString.toLowerCase();
  const matchedCategories = [];

  for (const [cKey, cObj] of Object.entries(data.routing)) {
    const kwHit = cObj.keywords.some(kw => q.includes(kw.toLowerCase()) || kw.toLowerCase().includes(q));
    const descHit = cObj.desc.toLowerCase().includes(q) || cObj.name.toLowerCase().includes(q);
    if (kwHit || descHit) {
      matchedCategories.push(cKey);
    }
  }

  const matchingFiles = {};
  for (const [fPath, fObj] of Object.entries(data.files)) {
    const pathHit = fPath.toLowerCase().includes(q);
    const descHit = fObj.desc && fObj.desc.toLowerCase().includes(q);
    const catHit = matchedCategories.includes(fObj.cat);
    if (pathHit || descHit || catHit) {
      matchingFiles[fPath] = {
        cat: fObj.cat,
        subcat: fObj.subcat,
        policy: fObj.policy,
        desc: fObj.desc,
        depsCount: fObj.deps ? fObj.deps.length : 0
      };
    }
  }

  console.log(JSON.stringify({
    query: queryString,
    matchedCategories,
    candidateFilesCount: Object.keys(matchingFiles).length,
    candidates: matchingFiles
  }, null, 2));
}

// --- Command: validate ---
function validateIndex() {
  const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const repoFiles = scanRepoFiles();
  let errors = 0;
  let warnings = 0;

  console.log("=== Repository Index Validation ===");
  console.log(`Indexed files: ${Object.keys(data.files).length}`);
  console.log(`Physical files found: ${repoFiles.length}`);

  // Check missing or extra files
  for (const f of repoFiles) {
    if (!data.files[f]) {
      console.error(`[ERROR] Unindexed physical file: ${f}`);
      errors++;
    }
  }
  for (const f of Object.keys(data.files)) {
    if (!fs.existsSync(path.resolve(__dirname, '..', f))) {
      console.error(`[ERROR] Indexed file does not exist: ${f}`);
      errors++;
    }
  }

  // Check category references
  for (const [f, entry] of Object.entries(data.files)) {
    if (!data.routing[entry.cat]) {
      console.error(`[ERROR] File ${f} references non-existent category: ${entry.cat}`);
      errors++;
    }
    // Check dependencies
    if (entry.deps) {
      for (const d of entry.deps) {
        if (!data.files[d]) {
          console.error(`[ERROR] File ${f} has unresolved dependency: ${d}`);
          errors++;
        }
      }
    }
    // Check test references
    if (entry.tests) {
      for (const t of entry.tests) {
        if (!data.files[t]) {
          console.error(`[WARNING] File ${f} references unknown test: ${t}`);
          warnings++;
        }
      }
    }
  }

  // Check protection policies
  let neverEditCount = 0;
  for (const [f, entry] of Object.entries(data.files)) {
    if (entry.policy === 'never_edit') neverEditCount++;
  }
  console.log(`Protected immutable files ('never_edit'): ${neverEditCount}`);
  if (neverEditCount < 8) {
    console.error(`[ERROR] Protected files count is lower than expected 8! Found: ${neverEditCount}`);
    errors++;
  }

  console.log(`\nValidation complete with ${errors} error(s) and ${warnings} warning(s).`);
  process.exit(errors > 0 ? 1 : 0);
}

// --- Command: update <filepath> ---
function updateFile(filePath) {
  const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const allFiles = scanRepoFiles();
  if (!fs.existsSync(path.resolve(__dirname, '..', filePath))) {
    // Delete file entry
    delete data.files[filePath];
    // Remove from other files' deps
    for (const fObj of Object.values(data.files)) {
      if (fObj.deps) fObj.deps = fObj.deps.filter(d => d !== filePath);
    }
    console.log(`[OK] Removed ${filePath} from index.`);
  } else {
    // Update or insert
    const cInfo = getCategoryInfo(filePath);
    const deps = extractDependencies(filePath, allFiles);
    const exports = extractExports(filePath);
    const policy = getPolicy(filePath);
    const existingDesc = data.files[filePath]?.desc;

    data.files[filePath] = {
      cat: cInfo.cat,
      desc: existingDesc || FILE_DESCRIPTIONS[filePath] || "Component or resource supporting this functional domain.",
      policy: policy
    };
    if (cInfo.subcat) data.files[filePath].subcat = cInfo.subcat;
    if (deps.length > 0) data.files[filePath].deps = deps;
    if (exports && exports.length > 0) data.files[filePath].exports = exports;
    console.log(`[OK] Updated ${filePath} in index.`);
  }

  data.updatedAt = new Date().toISOString();
  data.totalFiles = Object.keys(data.files).length;
  fs.writeFileSync(INDEX_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// --- CLI Dispatcher ---
const [,, cmd, ...args] = process.argv;
switch (cmd) {
  case 'build':
    buildIndex();
    break;
  case 'categories':
    printCategories();
    break;
  case 'list':
    if (!args[0]) {
      console.error('Usage: repo-indexer.cjs list <categoryName>');
      process.exit(1);
    }
    listCategory(args[0]);
    break;
  case 'inspect':
    if (!args[0]) {
      console.error('Usage: repo-indexer.cjs inspect <filePath>');
      process.exit(1);
    }
    inspectFile(args[0]);
    break;
  case 'query':
    if (!args[0]) {
      console.error('Usage: repo-indexer.cjs query <searchTerm>');
      process.exit(1);
    }
    queryIndex(args.join(' '));
    break;
  case 'validate':
    validateIndex();
    break;
  case 'update':
    if (!args[0]) {
      console.error('Usage: repo-indexer.cjs update <filePath>');
      process.exit(1);
    }
    updateFile(args[0]);
    break;
  default:
    console.log(`Usage: node scripts/repo-indexer.cjs <build|categories|list|inspect|query|validate|update> [args]`);
}
