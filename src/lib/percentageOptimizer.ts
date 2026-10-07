/**
 * Economically-valid percentage optimizer.
 *
 * Drop-in replacement for ../../lib/percentageOptimizer.
 *
 * Core rules:
 * - Mission is discrete: 95..100, step 1. Raw global target = 98.
 * - Investissement is discrete: 0..100, step 10. Raw global target = 60.
 * - Raw percentages are the only percentages used for the global averages.
 * - A changed percentage axis is admissible only if that axis has a real
 *   marginal effect on the bounded Salaire Formule at the proposed final state.
 *   This prevents salary-flat plateau moves from manufacturing the global average.
 * - Salaire Formule is bounded per dossier by currentSalary below and
 *   soldSalary above.
 * - Retention is measured from each dossier's own currentSalary baseline.
 * - Optimization is hierarchical / lexicographic:
 *     1) get as close as economically possible to the real raw targets;
 *     2) compute the max-min salary-retention ideal point;
 *     3) build an adaptive epsilon-constraint representation of the conflict
 *        between salary fairness and ORIGINAL-score preservation;
 *     4) choose a normalized knee/compromise point from that representation;
 *     5) within every epsilon subproblem, preserve aggregate uplift, absolute
 *        Formula salary, movement fairness and finally PCA geometry.
 */

export const TARGET_M = 98;
export const TARGET_I = 60;

export const MIN_M = 95;
export const MAX_M = 100;
export const MIN_I = 0;
export const MAX_I = 100;

export const MISSION_STEP = 1;
export const INVESTMENT_STEP = 10;

const SALARY_TOLERANCE = 0.01;
const SCORE_EPSILON = 1e-10;
const RETENTION_EPSILON = 1e-10;

// Modern epsilon-constraint handling: instead of one arbitrary fixed retention
// slack, build a small representative epsilon-frontier between salary fairness
// and ORIGINAL-score preservation. The grid is refined adaptively in the
// feasible interval, following the cardinality/uniformity ideas used by modern
// epsilon-constraint Pareto-front representation methods.
const EPSILON_FRONTIER_CARDINALITY = 7;
const EPSILON_REFINEMENT_LIMIT = 24;
const EPSILON_MIN_GAP = 1e-6;

// Original-score protection. These are intentionally nonlinear: the same raw
// decrease is substantially more expensive when it starts from an excellent
// original percentage.
const MISSION_EXCELLENCE_STRENGTH = 8;
const INVESTMENT_EXCELLENCE_STRENGTH = 8;

// The inverse-covariance/PCA term is regularized before use. This is equivalent
// to shrinking the empirical covariance eigenvalues toward their mean before
// applying a Mahalanobis-style movement penalty.
const COVARIANCE_SHRINKAGE = 0.15;
const COVARIANCE_RIDGE = 0.02;

// Original-score protection is lexicographic. Mission and Investissement are
// mapped to the same 0..10 normalized quality ladder. Tier 10 is protected
// before tier 9, then tier 8, and so on.
const EXCELLENCE_TIER_COUNT = 11;

export interface OptimizerUser {
  id: string;
  name: string;

  mission?: number;
  investment?: number;

  // Legacy aliases used by the existing modal.
  m?: number;
  i?: number;

  dossierId?: string;
  matricule?: string;

  /** Dossier-specific theoretical formula ceiling. */
  a: number;

  /** Legacy alias. In this model b === currentSalary. */
  b?: number;

  /** Fixed Salaire Actuel and personal lower bound. */
  currentSalary: number;

  /** Fixed Salaire Vendu and personal upper bound. */
  soldSalary: number;
}

export interface Recommendation {
  id: string;
  name: string;
  dossierId?: string;
  matricule?: string;

  oldM: number;
  newM: number;
  deltaM: number;

  oldI: number;
  newI: number;
  deltaI: number;

  /** Diagnostic only. Never used as the real global percentage average. */
  oldEffectiveM: number;
  newEffectiveM: number;
  oldEffectiveI: number;
  newEffectiveI: number;

  /** Fixed per-dossier Salaire Actuel / retention baseline. */
  currentSalary: number;

  originalSalary: number;
  newSalary: number;
  salaryChange: number;
  salaryRetention: number;

  missionProtection: number;
  investmentProtection: number;
}

export interface EigenResult {
  covariance: [[number, number], [number, number]];
  eigenvalues: [number, number];
  eigenvectors: [[number, number], [number, number]];
}

export interface OptimizationResult {
  recommendations: Recommendation[];
  eigen: EigenResult;

  /** Actual raw percentages stored on dossiers. */
  oldMeanM: number;
  newMeanM: number;
  oldMeanI: number;
  newMeanI: number;

  /** Backward-compatible aliases of the same raw averages. */
  oldRawMeanM: number;
  newRawMeanM: number;
  oldRawMeanI: number;
  newRawMeanI: number;

  oldTotalSalary: number;
  newTotalSalary: number;
  worstRetention: number;
  targetMReached: boolean;
  targetIReached: boolean;
}

interface EconomicState {
  m: number;
  i: number;
  rawSalary: number;
  salary: number;
  effectiveM: number;
  effectiveI: number;
}

interface InternalProfile {
  source: OptimizerUser;
  originalM: number;
  originalI: number;

  a: number;
  currentSalary: number;
  soldSalary: number;

  states: EconomicState[];
  stateByKey: Map<string, number>;
  originalStateIndex: number;
  originalSalary: number;

  originalEffectiveM: number;
  originalEffectiveI: number;
}

interface StateOption {
  stateIndex: number;
  progressM: number;
  progressI: number;
  retention: number;
  retentionPenalty: number;
  euroLoss: number;
  excellencePenalty: number;
  excellenceTierLosses: number[];
  movementPenalty: number;
  pcaPenalty: number;
  movementMagnitude: number;
}

interface FinalNode {
  progressM: number;
  progressI: number;
  excellenceTierLosses: number[];
  retentionPenalty: number;
  euroLoss: number;
  excellencePenalty: number;
  maxMovementMagnitude: number;
  movementPenalty: number;
  pcaPenalty: number;
  prev: FinalNode | null;
  stateIndex: number;
}

interface AllocationMetrics {
  worstRetention: number;
  excellenceTierLosses: number[];
  retentionPenalty: number;
  euroLoss: number;
  excellencePenalty: number;
  maxMovementMagnitude: number;
  movementPenalty: number;
  pcaPenalty: number;
}

interface EpsilonCandidate {
  epsilonRetentionFloor: number;
  chosenStateIndices: number[];
  metrics: AllocationMetrics;
  excellenceLexScore: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snapMission(value: number): number {
  return clamp(Math.round(value), MIN_M, MAX_M);
}

export function snapInvestment(value: number): number {
  const snapped = Math.round(value / INVESTMENT_STEP) * INVESTMENT_STEP;
  return clamp(snapped, MIN_I, MAX_I);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stateKey(m: number, i: number): string {
  return `${m}|${i}`;
}

function normalizeMission(m: number): number {
  return (m - MIN_M) / (MAX_M - MIN_M);
}

function normalizeInvestment(i: number): number {
  return (i - MIN_I) / (MAX_I - MIN_I);
}

function dot(a: [number, number], b: [number, number]): number {
  return a[0] * b[0] + a[1] * b[1];
}

function normalizeVector(v: [number, number]): [number, number] {
  const length = Math.hypot(v[0], v[1]);
  if (length <= 1e-12) return [1, 0];
  return [v[0] / length, v[1] / length];
}

/** Unbounded mathematical Salaire Formule. */
export function calculateRawFormulaSalary(
  mission: number,
  investment: number,
  a: number,
  currentSalary: number,
): number {
  return (
    (mission / 100) *
    (currentSalary + (investment / 100) * (a - currentSalary))
  );
}

/**
 * Business Salaire Formule used by the optimizer.
 * currentSalary <= result <= soldSalary.
 */
export function calculateEffectiveFormulaSalary(
  mission: number,
  investment: number,
  a: number,
  currentSalary: number,
  soldSalary: number,
): number {
  const raw = calculateRawFormulaSalary(
    mission,
    investment,
    a,
    currentSalary,
  );

  return clamp(raw, currentSalary, Math.max(currentSalary, soldSalary));
}

function missionExcellenceProtection(originalM: number): number {
  const quality = clamp(normalizeMission(originalM), 0, 1);
  return Math.exp(MISSION_EXCELLENCE_STRENGTH * Math.pow(quality, 3));
}

function investmentExcellenceProtection(originalI: number): number {
  const quality = clamp(normalizeInvestment(originalI), 0, 1);
  return Math.exp(INVESTMENT_EXCELLENCE_STRENGTH * Math.pow(quality, 4));
}

function buildProfile(user: OptimizerUser): InternalProfile {
  const originalM = snapMission(user.mission ?? user.m ?? TARGET_M);
  const originalI = snapInvestment(user.investment ?? user.i ?? TARGET_I);

  const currentSalary = Math.max(
    0,
    Number.isFinite(user.currentSalary)
      ? user.currentSalary
      : (user.b ?? 0),
  );

  const soldSalary = Math.max(
    currentSalary,
    Number.isFinite(user.soldSalary) ? user.soldSalary : currentSalary,
  );

  // Processable dossiers should satisfy a > currentSalary. Keep a tiny guard so
  // malformed test data cannot create a negative/zero formula range.
  const a = Math.max(
    Number.isFinite(user.a) ? user.a : soldSalary,
    currentSalary + 0.01,
  );

  const salaryAt = (m: number, i: number): number =>
    calculateEffectiveFormulaSalary(m, i, a, currentSalary, soldSalary);

  // Diagnostics only. These coordinates describe where a state sits on the
  // dossier-specific salary response, but they NEVER replace raw M/I averages.
  const effectiveMAt = (m: number, i: number): number => {
    const low = salaryAt(MIN_M, i);
    const high = salaryAt(MAX_M, i);
    const range = high - low;

    if (Math.abs(range) <= SALARY_TOLERANCE) return TARGET_M;

    return clamp(
      MIN_M +
        (MAX_M - MIN_M) * ((salaryAt(m, i) - low) / range),
      MIN_M,
      MAX_M,
    );
  };

  const effectiveIAt = (m: number, i: number): number => {
    const low = salaryAt(m, MIN_I);
    const high = salaryAt(m, MAX_I);
    const range = high - low;

    if (Math.abs(range) <= SALARY_TOLERANCE) return TARGET_I;

    return clamp(
      MIN_I +
        (MAX_I - MIN_I) * ((salaryAt(m, i) - low) / range),
      MIN_I,
      MAX_I,
    );
  };

  const states: EconomicState[] = [];
  const stateByKey = new Map<string, number>();

  for (let m = MIN_M; m <= MAX_M; m += MISSION_STEP) {
    for (let i = MIN_I; i <= MAX_I; i += INVESTMENT_STEP) {
      const rawSalary = calculateRawFormulaSalary(m, i, a, currentSalary);
      const salary = calculateEffectiveFormulaSalary(
        m,
        i,
        a,
        currentSalary,
        soldSalary,
      );

      const index = states.length;
      states.push({
        m,
        i,
        rawSalary,
        salary,
        effectiveM: effectiveMAt(m, i),
        effectiveI: effectiveIAt(m, i),
      });
      stateByKey.set(stateKey(m, i), index);
    }
  }

  const originalStateIndex =
    stateByKey.get(stateKey(originalM, originalI)) ?? 0;
  const originalState = states[originalStateIndex];

  return {
    source: user,
    originalM,
    originalI,
    a,
    currentSalary,
    soldSalary,
    states,
    stateByKey,
    originalStateIndex,
    originalSalary: originalState.salary,
    originalEffectiveM: originalState.effectiveM,
    originalEffectiveI: originalState.effectiveI,
  };
}

/**
 * PCA / eigen analysis of the ORIGINAL RAW population.
 *
 * The returned matrix/eigenvalues are the empirical normalized covariance.
 * The optimizer regularizes its inverse geometry separately before using it as
 * a tie-breaker; this keeps the displayed covariance honest while preventing a
 * tiny eigenvalue from exploding the penalty.
 */
function calculateEigenAnalysis(profiles: InternalProfile[]): EigenResult {
  if (profiles.length < 2) {
    return {
      covariance: [
        [0, 0],
        [0, 0],
      ],
      eigenvalues: [0, 0],
      eigenvectors: [
        [1, 0],
        [0, 1],
      ],
    };
  }

  const points = profiles.map(
    (profile) =>
      [
        normalizeMission(profile.originalM),
        normalizeInvestment(profile.originalI),
      ] as [number, number],
  );

  const meanM = mean(points.map((p) => p[0]));
  const meanI = mean(points.map((p) => p[1]));

  let varM = 0;
  let varI = 0;
  let covMI = 0;

  for (const [m, i] of points) {
    const dm = m - meanM;
    const di = i - meanI;
    varM += dm * dm;
    varI += di * di;
    covMI += dm * di;
  }

  const denominator = profiles.length - 1;
  varM /= denominator;
  varI /= denominator;
  covMI /= denominator;

  const halfTrace = (varM + varI) / 2;
  const discriminant = Math.sqrt(
    Math.pow((varM - varI) / 2, 2) + covMI * covMI,
  );

  const lambda1 = Math.max(0, halfTrace + discriminant);
  const lambda2 = Math.max(0, halfTrace - discriminant);

  let v1: [number, number];
  if (Math.abs(covMI) > 1e-12) {
    v1 = normalizeVector([covMI, lambda1 - varM]);
  } else {
    v1 = varM >= varI ? [1, 0] : [0, 1];
  }

  const v2: [number, number] = [-v1[1], v1[0]];

  return {
    covariance: [
      [varM, covMI],
      [covMI, varI],
    ],
    eigenvalues: [lambda1, lambda2],
    eigenvectors: [v1, v2],
  };
}

/**
 * Regularized inverse-covariance movement penalty.
 *
 * In the eigenbasis this is a Mahalanobis-style distance. The eigenvalues are
 * shrunk toward their mean before inversion, so a nearly singular covariance
 * cannot dominate the economic objectives.
 */
function structuralPenalty(
  profile: InternalProfile,
  state: EconomicState,
  eigen: EigenResult,
): number {
  const movement: [number, number] = [
    (state.m - profile.originalM) / (MAX_M - MIN_M),
    (state.i - profile.originalI) / (MAX_I - MIN_I),
  ];

  const [v1, v2] = eigen.eigenvectors;
  const [lambda1, lambda2] = eigen.eigenvalues;
  const meanLambda = (lambda1 + lambda2) / 2;

  const regularizedLambda1 =
    (1 - COVARIANCE_SHRINKAGE) * lambda1 +
    COVARIANCE_SHRINKAGE * meanLambda +
    COVARIANCE_RIDGE;

  const regularizedLambda2 =
    (1 - COVARIANCE_SHRINKAGE) * lambda2 +
    COVARIANCE_SHRINKAGE * meanLambda +
    COVARIANCE_RIDGE;

  const p1 = dot(movement, v1);
  const p2 = dot(movement, v2);

  return (
    (p1 * p1) / regularizedLambda1 +
    (p2 * p2) / regularizedLambda2
  );
}

/**
 * Retention is relative to this dossier's own currentSalary, not zero.
 *
 * Example: current=67,000, original Formula=67,500, new Formula=67,000
 * => original uplift=500, retained uplift=0 => retention=0%.
 */
function formulaUpliftRetention(
  profile: InternalProfile,
  state: EconomicState,
): number {
  const originalUplift = Math.max(
    0,
    profile.originalSalary - profile.currentSalary,
  );

  if (originalUplift <= SALARY_TOLERANCE) return 1;

  const retainedUplift = Math.max(
    0,
    state.salary - profile.currentSalary,
  );

  return clamp(retainedUplift / originalUplift, 0, 1);
}

function excellencePenalty(
  profile: InternalProfile,
  state: EconomicState,
): number {
  const missionDecrease = Math.max(0, profile.originalM - state.m);
  const investmentDecrease = Math.max(0, profile.originalI - state.i);

  return (
    missionExcellenceProtection(profile.originalM) *
      Math.pow(missionDecrease / (MAX_M - MIN_M), 2) +
    investmentExcellenceProtection(profile.originalI) *
      Math.pow(investmentDecrease / (MAX_I - MIN_I), 2)
  );
}

/**
 * Lexicographic ORIGINAL-score damage vector. Index 10 is the strongest
 * starting tier and index 0 the weakest. Only decreases create damage.
 */
function excellenceTierLosses(
  profile: InternalProfile,
  state: EconomicState,
): number[] {
  const losses = new Array<number>(EXCELLENCE_TIER_COUNT).fill(0);

  const missionDecrease = Math.max(0, profile.originalM - state.m);
  if (missionDecrease > 0) {
    const tier = Math.round(10 * normalizeMission(profile.originalM));
    losses[tier] += missionDecrease / (MAX_M - MIN_M);
  }

  const investmentDecrease = Math.max(0, profile.originalI - state.i);
  if (investmentDecrease > 0) {
    const tier = Math.round(10 * normalizeInvestment(profile.originalI));
    losses[tier] += investmentDecrease / (MAX_I - MIN_I);
  }

  return losses;
}

function rawMovementPenalty(
  profile: InternalProfile,
  state: EconomicState,
): number {
  const dm = (state.m - profile.originalM) / (MAX_M - MIN_M);
  const di = (state.i - profile.originalI) / (MAX_I - MIN_I);
  return dm * dm + di * di;
}

/**
 * Critical anti-falsification rule.
 *
 * If an axis changes, that axis must have a real marginal salary effect at the
 * proposed FINAL value of the other axis. This prevents a salary-active change
 * on one axis from "carrying" a useless plateau change on the other axis.
 */
function isEconomicallyMeaningfulState(
  profile: InternalProfile,
  state: EconomicState,
): boolean {
  const changedM = state.m !== profile.originalM;
  const changedI = state.i !== profile.originalI;

  if (!changedM && !changedI) return true;

  const salaryAt = (m: number, i: number): number =>
    calculateEffectiveFormulaSalary(
      m,
      i,
      profile.a,
      profile.currentSalary,
      profile.soldSalary,
    );

  // The final recommendation as a whole must change Formula salary.
  if (Math.abs(state.salary - profile.originalSalary) <= SALARY_TOLERANCE) {
    return false;
  }

  // If Mission changed, reverting only Mission to its original value while
  // keeping final Investissement must change salary. Otherwise Mission is just
  // a plateau-only manipulation of the raw average.
  if (changedM) {
    const withoutMissionChange = salaryAt(profile.originalM, state.i);
    if (
      Math.abs(state.salary - withoutMissionChange) <= SALARY_TOLERANCE
    ) {
      return false;
    }
  }

  // Same rule independently for Investissement.
  if (changedI) {
    const withoutInvestmentChange = salaryAt(state.m, profile.originalI);
    if (
      Math.abs(state.salary - withoutInvestmentChange) <= SALARY_TOLERANCE
    ) {
      return false;
    }
  }

  return true;
}

function buildOptions(
  profile: InternalProfile,
  directionM: -1 | 0 | 1,
  directionI: -1 | 0 | 1,
  requiredM: number,
  requiredISteps: number,
  eigen: EigenResult,
): StateOption[] {
  const options: StateOption[] = [];

  for (let index = 0; index < profile.states.length; index++) {
    const state = profile.states[index];
    const dm = state.m - profile.originalM;
    const di = state.i - profile.originalI;

    if (directionM === 0 && dm !== 0) continue;
    if (directionM < 0 && dm > 0) continue;
    if (directionM > 0 && dm < 0) continue;

    if (directionI === 0 && di !== 0) continue;
    if (directionI < 0 && di > 0) continue;
    if (directionI > 0 && di < 0) continue;

    // Individuals may cross the global target when that is necessary to preserve
    // stronger ORIGINAL scores elsewhere. This is intentionally not a hard
    // per-user target: excellence tiers, max-min retention and convex movement
    // penalties decide whether such redistribution is worthwhile.

    const progressM = Math.abs(dm);
    const progressISteps = Math.abs(di) / INVESTMENT_STEP;

    if (progressM > requiredM) continue;
    if (progressISteps > requiredISteps) continue;

    if (!isEconomicallyMeaningfulState(profile, state)) continue;

    // Monotonic sanity guard: target-direction decreases must not raise Formula
    // salary and increases must not lower it.
    const hasAnyDecrease = dm < 0 || di < 0;
    const hasAnyIncrease = dm > 0 || di > 0;

    if (
      hasAnyDecrease &&
      state.salary > profile.originalSalary + SALARY_TOLERANCE
    ) {
      continue;
    }

    if (
      hasAnyIncrease &&
      state.salary < profile.originalSalary - SALARY_TOLERANCE
    ) {
      continue;
    }

    const retention = formulaUpliftRetention(profile, state);
    const loss = 1 - retention;

    options.push({
      stateIndex: index,
      progressM,
      progressI: progressISteps,
      retention,
      // Convex individual penalty: after max-min retention has been fixed, this
      // still prefers spreading smaller relative losses over concentrating them.
      retentionPenalty: Math.expm1(8 * loss),
      euroLoss: Math.max(0, profile.originalSalary - state.salary),
      excellencePenalty: excellencePenalty(profile, state),
      excellenceTierLosses: excellenceTierLosses(profile, state),
      movementPenalty: rawMovementPenalty(profile, state),
      pcaPenalty: structuralPenalty(profile, state, eigen),
      movementMagnitude: Math.max(
        Math.abs(dm) / (MAX_M - MIN_M),
        Math.abs(di) / (MAX_I - MIN_I),
      ),
    });
  }

  // The unchanged state must always be available, even for a completely flat
  // dossier that has no economically valid changed state.
  if (!options.some((option) => option.progressM === 0 && option.progressI === 0)) {
    const state = profile.states[profile.originalStateIndex];
    options.push({
      stateIndex: profile.originalStateIndex,
      progressM: 0,
      progressI: 0,
      retention: 1,
      retentionPenalty: 0,
      euroLoss: 0,
      excellencePenalty: 0,
      excellenceTierLosses: new Array<number>(EXCELLENCE_TIER_COUNT).fill(0),
      movementPenalty: 0,
      pcaPenalty: 0,
      movementMagnitude: 0,
    });
  }

  return options;
}

function encodeProgress(m: number, i: number, widthI: number): number {
  return m * widthI + i;
}

function decodeProgress(key: number, widthI: number): [number, number] {
  return [Math.floor(key / widthI), key % widthI];
}

/** Sparse reachability DP for the multiple-choice discrete state problem. */
function reachableProgress(
  optionsByProfile: StateOption[][],
  capM: number,
  capI: number,
  minRetention = 0,
): Set<number> {
  const widthI = capI + 1;
  let reachable = new Set<number>([encodeProgress(0, 0, widthI)]);

  for (const options of optionsByProfile) {
    const next = new Set<number>();

    for (const key of reachable) {
      const [baseM, baseI] = decodeProgress(key, widthI);

      for (const option of options) {
        if (option.retention + RETENTION_EPSILON < minRetention) continue;

        const m = baseM + option.progressM;
        const i = baseI + option.progressI;

        if (m > capM || i > capI) continue;
        next.add(encodeProgress(m, i, widthI));
      }
    }

    reachable = next;
    if (reachable.size === 0) break;
  }

  return reachable;
}

function chooseClosestReachableTarget(
  reachable: Set<number>,
  requiredM: number,
  requiredI: number,
  populationSize: number,
): [number, number] {
  const widthI = requiredI + 1;

  let bestM = 0;
  let bestI = 0;
  let bestError = Number.POSITIVE_INFINITY;
  let bestProgress = -1;

  for (const key of reachable) {
    const [m, i] = decodeProgress(key, widthI);

    const residualM =
      populationSize > 0
        ? (requiredM - m) / (populationSize * (MAX_M - MIN_M))
        : 0;

    const residualI =
      populationSize > 0
        ? (requiredI - i) /
          (populationSize * ((MAX_I - MIN_I) / INVESTMENT_STEP))
        : 0;

    const error = residualM * residualM + residualI * residualI;
    const progress =
      (requiredM > 0 ? m / requiredM : 1) +
      (requiredI > 0 ? i / requiredI : 1);

    if (
      error < bestError - SCORE_EPSILON ||
      (Math.abs(error - bestError) <= SCORE_EPSILON &&
        progress > bestProgress + SCORE_EPSILON)
    ) {
      bestError = error;
      bestProgress = progress;
      bestM = m;
      bestI = i;
    }
  }

  return [bestM, bestI];
}

function canReachTarget(
  optionsByProfile: StateOption[][],
  targetM: number,
  targetI: number,
  minRetention: number,
): boolean {
  const reachable = reachableProgress(
    optionsByProfile,
    targetM,
    targetI,
    minRetention,
  );
  return reachable.has(encodeProgress(targetM, targetI, targetI + 1));
}

/** Pass 2: exact max-min fairness on personal Formula-uplift retention. */
function maximizeWorstRetention(
  optionsByProfile: StateOption[][],
  targetM: number,
  targetI: number,
): number {
  const values = Array.from(
    new Set(
      optionsByProfile.flatMap((options) =>
        options.map((option) => Number(option.retention.toFixed(12))),
      ),
    ),
  ).sort((a, b) => a - b);

  if (values.length === 0) return 1;

  let low = 0;
  let high = values.length - 1;
  let best = values[0];

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const threshold = values[mid];

    if (canReachTarget(optionsByProfile, targetM, targetI, threshold)) {
      best = threshold;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function addTierLosses(a: number[], b: number[]): number[] {
  const result = new Array<number>(EXCELLENCE_TIER_COUNT);
  for (let i = 0; i < EXCELLENCE_TIER_COUNT; i++) {
    result[i] = (a[i] ?? 0) + (b[i] ?? 0);
  }
  return result;
}

/** Compare ORIGINAL-score damage from strongest starting tier to weakest. */
function compareTierLosses(a: number[], b: number[]): number {
  for (let tier = EXCELLENCE_TIER_COUNT - 1; tier >= 0; tier--) {
    const x = a[tier] ?? 0;
    const y = b[tier] ?? 0;
    const scale = Math.max(1, Math.abs(x), Math.abs(y));
    if (Math.abs(x - y) > SCORE_EPSILON * scale) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Exact lexicographic refinement for a fixed epsilon-retention constraint:
 *   1) protect the highest ORIGINAL score tiers;
 *   2) minimize aggregate relative uplift loss;
 *   3) minimize absolute Formula-salary loss;
 *   4) minimize residual nonlinear excellence damage;
 *   5) minimize the largest individual raw movement;
 *   6) minimize total raw movement;
 *   7) minimize regularized PCA/Mahalanobis structural distortion.
 *
 * The epsilon-retention floor itself is handled outside this comparator.
 */
function compareFinalNodes(a: FinalNode, b: FinalNode): number {
  const tierComparison = compareTierLosses(
    a.excellenceTierLosses,
    b.excellenceTierLosses,
  );
  if (tierComparison !== 0) return tierComparison;

  const fields: Array<[number, number]> = [
    [a.retentionPenalty, b.retentionPenalty],
    [a.euroLoss, b.euroLoss],
    [a.excellencePenalty, b.excellencePenalty],
    [a.maxMovementMagnitude, b.maxMovementMagnitude],
    [a.movementPenalty, b.movementPenalty],
    [a.pcaPenalty, b.pcaPenalty],
  ];

  for (const [x, y] of fields) {
    const scale = Math.max(1, Math.abs(x), Math.abs(y));
    if (Math.abs(x - y) > SCORE_EPSILON * scale) {
      return x < y ? -1 : 1;
    }
  }

  return 0;
}

function solveBestAllocation(
  optionsByProfile: StateOption[][],
  targetM: number,
  targetI: number,
  minRetention: number,
): number[] {
  const widthI = targetI + 1;

  let frontier = new Map<number, FinalNode>();
  frontier.set(encodeProgress(0, 0, widthI), {
    progressM: 0,
    progressI: 0,
    excellenceTierLosses: new Array<number>(EXCELLENCE_TIER_COUNT).fill(0),
    retentionPenalty: 0,
    euroLoss: 0,
    excellencePenalty: 0,
    maxMovementMagnitude: 0,
    movementPenalty: 0,
    pcaPenalty: 0,
    prev: null,
    stateIndex: -1,
  });

  for (const options of optionsByProfile) {
    const next = new Map<number, FinalNode>();

    for (const node of frontier.values()) {
      for (const option of options) {
        if (option.retention + RETENTION_EPSILON < minRetention) continue;

        const progressM = node.progressM + option.progressM;
        const progressI = node.progressI + option.progressI;

        if (progressM > targetM || progressI > targetI) continue;

        const candidate: FinalNode = {
          progressM,
          progressI,
          excellenceTierLosses: addTierLosses(
            node.excellenceTierLosses,
            option.excellenceTierLosses,
          ),
          retentionPenalty:
            node.retentionPenalty + option.retentionPenalty,
          euroLoss: node.euroLoss + option.euroLoss,
          excellencePenalty:
            node.excellencePenalty + option.excellencePenalty,
          maxMovementMagnitude: Math.max(
            node.maxMovementMagnitude,
            option.movementMagnitude,
          ),
          movementPenalty: node.movementPenalty + option.movementPenalty,
          pcaPenalty: node.pcaPenalty + option.pcaPenalty,
          prev: node,
          stateIndex: option.stateIndex,
        };

        const key = encodeProgress(progressM, progressI, widthI);
        const existing = next.get(key);

        if (!existing || compareFinalNodes(candidate, existing) < 0) {
          next.set(key, candidate);
        }
      }
    }

    frontier = next;
  }

  const final = frontier.get(encodeProgress(targetM, targetI, widthI));

  if (!final) {
    return optionsByProfile.map((options) => options[0]?.stateIndex ?? 0);
  }

  const chosen = new Array<number>(optionsByProfile.length);
  let node: FinalNode | null = final;

  for (let index = optionsByProfile.length - 1; index >= 0; index--) {
    if (!node) break;
    chosen[index] = node.stateIndex;
    node = node.prev;
  }

  return chosen;
}

function optionForState(
  options: StateOption[],
  stateIndex: number,
): StateOption {
  return (
    options.find((option) => option.stateIndex === stateIndex) ??
    options[0]
  );
}

function evaluateAllocationMetrics(
  optionsByProfile: StateOption[][],
  chosenStateIndices: number[],
): AllocationMetrics {
  const metrics: AllocationMetrics = {
    worstRetention: 1,
    excellenceTierLosses: new Array<number>(EXCELLENCE_TIER_COUNT).fill(0),
    retentionPenalty: 0,
    euroLoss: 0,
    excellencePenalty: 0,
    maxMovementMagnitude: 0,
    movementPenalty: 0,
    pcaPenalty: 0,
  };

  for (let index = 0; index < optionsByProfile.length; index++) {
    const option = optionForState(
      optionsByProfile[index],
      chosenStateIndices[index],
    );

    metrics.worstRetention = Math.min(
      metrics.worstRetention,
      option.retention,
    );
    metrics.excellenceTierLosses = addTierLosses(
      metrics.excellenceTierLosses,
      option.excellenceTierLosses,
    );
    metrics.retentionPenalty += option.retentionPenalty;
    metrics.euroLoss += option.euroLoss;
    metrics.excellencePenalty += option.excellencePenalty;
    metrics.maxMovementMagnitude = Math.max(
      metrics.maxMovementMagnitude,
      option.movementMagnitude,
    );
    metrics.movementPenalty += option.movementPenalty;
    metrics.pcaPenalty += option.pcaPenalty;
  }

  return metrics;
}

/**
 * Convert the lexicographic excellence vector to a scalar only for measuring
 * distances between Pareto-front representatives. The base is chosen larger
 * than the maximum possible aggregate damage, so a stronger tier dominates the
 * sum of every weaker tier. This scalar NEVER replaces the exact vector in the
 * allocation optimizer itself.
 */
function excellenceLexScore(
  tierLosses: number[],
  populationSize: number,
): number {
  const base = Math.max(3, 2 * populationSize + 1);
  let score = 0;
  let multiplier = 1;

  for (let tier = 0; tier < EXCELLENCE_TIER_COUNT; tier++) {
    score += (tierLosses[tier] ?? 0) * multiplier;
    multiplier *= base;
  }

  return score;
}

function epsilonCandidateSignature(candidate: EpsilonCandidate): string {
  return [
    candidate.metrics.worstRetention.toFixed(10),
    ...candidate.metrics.excellenceTierLosses.map((value) => value.toFixed(10)),
  ].join('|');
}

/**
 * Adaptive representative epsilon-frontier.
 *
 * This replaces the old fixed 0.5 percentage-point epsilon. We first compute
 * the salary-fairness endpoint and the excellence-preservation endpoint. Then
 * we refine the feasible epsilon interval by repeatedly splitting its largest
 * unexplored gap until we obtain a compact representation (or hit the safety
 * iteration limit). This is deliberately range-insensitive: the grid is built
 * from the actually attainable endpoints rather than an assumed nadir bound.
 */
function buildRepresentativeEpsilonFrontier(
  optionsByProfile: StateOption[][],
  targetM: number,
  targetI: number,
  bestWorstRetention: number,
): EpsilonCandidate[] {
  const populationSize = optionsByProfile.length;
  const solvedByThreshold = new Map<number, EpsilonCandidate>();
  const uniqueByOutcome = new Map<string, EpsilonCandidate>();

  const solveAt = (threshold: number): EpsilonCandidate => {
    const clampedThreshold = clamp(threshold, 0, bestWorstRetention);
    const key = Number(clampedThreshold.toFixed(12));
    const cached = solvedByThreshold.get(key);
    if (cached) return cached;

    const chosenStateIndices = solveBestAllocation(
      optionsByProfile,
      targetM,
      targetI,
      clampedThreshold,
    );
    const metrics = evaluateAllocationMetrics(
      optionsByProfile,
      chosenStateIndices,
    );
    const candidate: EpsilonCandidate = {
      epsilonRetentionFloor: clampedThreshold,
      chosenStateIndices,
      metrics,
      excellenceLexScore: excellenceLexScore(
        metrics.excellenceTierLosses,
        populationSize,
      ),
    };

    solvedByThreshold.set(key, candidate);
    const signature = epsilonCandidateSignature(candidate);
    const existing = uniqueByOutcome.get(signature);
    if (
      !existing ||
      candidate.metrics.retentionPenalty <
        existing.metrics.retentionPenalty - SCORE_EPSILON
    ) {
      uniqueByOutcome.set(signature, candidate);
    }
    return candidate;
  };

  // Payoff-table endpoints: salary-fairness optimum vs excellence optimum.
  const salaryEndpoint = solveAt(bestWorstRetention);
  const excellenceEndpoint = solveAt(0);

  const low = Math.min(
    salaryEndpoint.metrics.worstRetention,
    excellenceEndpoint.metrics.worstRetention,
  );
  const high = salaryEndpoint.metrics.worstRetention;

  solveAt(low);
  solveAt(high);

  // If the excellence-optimal allocation already achieves the salary-fairness
  // optimum, there is no trade-off to represent. Avoid solving artificial
  // epsilon levels below the actually attainable conflict interval.
  if (high - low <= EPSILON_MIN_GAP) {
    return Array.from(uniqueByOutcome.values()).sort(
      (a, b) => b.metrics.worstRetention - a.metrics.worstRetention,
    );
  }

  for (let iteration = 0; iteration < EPSILON_REFINEMENT_LIMIT; iteration++) {
    if (uniqueByOutcome.size >= EPSILON_FRONTIER_CARDINALITY) break;

    const thresholds = Array.from(solvedByThreshold.keys())
      .filter(
        (threshold) =>
          threshold >= low - EPSILON_MIN_GAP &&
          threshold <= high + EPSILON_MIN_GAP,
      )
      .sort((a, b) => a - b);
    let bestLeft = Number.NaN;
    let bestRight = Number.NaN;
    let largestGap = 0;

    for (let index = 1; index < thresholds.length; index++) {
      const left = thresholds[index - 1];
      const right = thresholds[index];
      const gap = right - left;
      if (gap > largestGap + EPSILON_MIN_GAP) {
        largestGap = gap;
        bestLeft = left;
        bestRight = right;
      }
    }

    if (!Number.isFinite(bestLeft) || largestGap <= EPSILON_MIN_GAP) break;
    solveAt((bestLeft + bestRight) / 2);
  }

  return Array.from(uniqueByOutcome.values()).sort(
    (a, b) => b.metrics.worstRetention - a.metrics.worstRetention,
  );
}

/**
 * Select a knee/compromise point from the representative epsilon-frontier.
 * Both dimensions are normalized by the observed payoff range, avoiding a
 * hand-tuned weighted sum. Chebyshev distance to the ideal point prevents a
 * tiny gain on one objective from justifying catastrophic damage on the other.
 * Ties prefer higher salary retention, then exact lexicographic excellence.
 */
function selectEpsilonFrontierCandidate(
  candidates: EpsilonCandidate[],
): EpsilonCandidate {
  if (candidates.length === 0) {
    throw new Error('epsilon frontier must contain at least one candidate');
  }
  if (candidates.length === 1) return candidates[0];

  const bestRetention = Math.max(
    ...candidates.map((candidate) => candidate.metrics.worstRetention),
  );
  const worstRetention = Math.min(
    ...candidates.map((candidate) => candidate.metrics.worstRetention),
  );
  const bestExcellence = Math.min(
    ...candidates.map((candidate) => candidate.excellenceLexScore),
  );
  const worstExcellence = Math.max(
    ...candidates.map((candidate) => candidate.excellenceLexScore),
  );

  const retentionRange = Math.max(
    RETENTION_EPSILON,
    bestRetention - worstRetention,
  );
  const excellenceRange = Math.max(
    SCORE_EPSILON,
    worstExcellence - bestExcellence,
  );

  let best = candidates[0];
  let bestChebyshev = Number.POSITIVE_INFINITY;
  let bestSum = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const retentionLoss =
      (bestRetention - candidate.metrics.worstRetention) / retentionRange;
    const excellenceLoss =
      (candidate.excellenceLexScore - bestExcellence) / excellenceRange;

    const chebyshev = Math.max(retentionLoss, excellenceLoss);
    const sum = retentionLoss + excellenceLoss;

    const tierComparison = compareTierLosses(
      candidate.metrics.excellenceTierLosses,
      best.metrics.excellenceTierLosses,
    );

    if (
      chebyshev < bestChebyshev - SCORE_EPSILON ||
      (Math.abs(chebyshev - bestChebyshev) <= SCORE_EPSILON &&
        sum < bestSum - SCORE_EPSILON) ||
      (Math.abs(chebyshev - bestChebyshev) <= SCORE_EPSILON &&
        Math.abs(sum - bestSum) <= SCORE_EPSILON &&
        candidate.metrics.worstRetention >
          best.metrics.worstRetention + RETENTION_EPSILON) ||
      (Math.abs(chebyshev - bestChebyshev) <= SCORE_EPSILON &&
        Math.abs(sum - bestSum) <= SCORE_EPSILON &&
        Math.abs(
          candidate.metrics.worstRetention - best.metrics.worstRetention,
        ) <= RETENTION_EPSILON &&
        tierComparison < 0)
    ) {
      best = candidate;
      bestChebyshev = chebyshev;
      bestSum = sum;
    }
  }

  return best;
}

export function optimize(users: OptimizerUser[]): OptimizationResult {
  if (users.length === 0) {
    return {
      recommendations: [],
      eigen: calculateEigenAnalysis([]),
      oldMeanM: TARGET_M,
      newMeanM: TARGET_M,
      oldMeanI: TARGET_I,
      newMeanI: TARGET_I,
      oldRawMeanM: TARGET_M,
      newRawMeanM: TARGET_M,
      oldRawMeanI: TARGET_I,
      newRawMeanI: TARGET_I,
      oldTotalSalary: 0,
      newTotalSalary: 0,
      worstRetention: 1,
      targetMReached: true,
      targetIReached: true,
    };
  }

  const profiles = users.map(buildProfile);
  const eigen = calculateEigenAnalysis(profiles);
  const n = profiles.length;

  const originalTotalM = profiles.reduce(
    (sum, profile) => sum + profile.originalM,
    0,
  );
  const originalTotalI = profiles.reduce(
    (sum, profile) => sum + profile.originalI,
    0,
  );

  const targetTotalM = TARGET_M * n;
  const targetTotalI = TARGET_I * n;

  const rawDeltaM = targetTotalM - originalTotalM;
  const rawDeltaI = targetTotalI - originalTotalI;

  const directionM: -1 | 0 | 1 =
    rawDeltaM < 0 ? -1 : rawDeltaM > 0 ? 1 : 0;

  const directionI: -1 | 0 | 1 =
    rawDeltaI < 0 ? -1 : rawDeltaI > 0 ? 1 : 0;

  const requiredM = Math.abs(rawDeltaM);
  const requiredISteps = Math.round(
    Math.abs(rawDeltaI) / INVESTMENT_STEP,
  );

  const optionsByProfile = profiles.map((profile) =>
    buildOptions(
      profile,
      directionM,
      directionI,
      requiredM,
      requiredISteps,
      eigen,
    ),
  );

  // Phase 1: find the closest raw target that can actually be reached using
  // economically meaningful states. Plateau-only changes simply do not exist in
  // this feasible set, so they can never falsify the global average.
  const reachable = reachableProgress(
    optionsByProfile,
    requiredM,
    requiredISteps,
  );

  const [selectedProgressM, selectedProgressI] =
    chooseClosestReachableTarget(
      reachable,
      requiredM,
      requiredISteps,
      n,
    );

  // Phase 2: compute the salary-fairness ideal point at the economically valid
  // raw target. This is the upper endpoint of the epsilon-constraint frontier.
  const bestWorstRetention = maximizeWorstRetention(
    optionsByProfile,
    selectedProgressM,
    selectedProgressI,
  );

  // Phase 3: modern epsilon-constraint representation. Instead of choosing one
  // arbitrary fixed epsilon, generate a compact, adaptively refined set of
  // nondominated salary-retention / ORIGINAL-excellence trade-offs using the
  // actually attainable payoff range.
  const epsilonFrontier = buildRepresentativeEpsilonFrontier(
    optionsByProfile,
    selectedProgressM,
    selectedProgressI,
    bestWorstRetention,
  );

  // Phase 4: choose the knee/compromise point in normalized objective space.
  // Lower-order salary, movement and PCA objectives are already optimized
  // lexicographically inside every fixed-epsilon subproblem.
  const selectedEpsilonCandidate =
    selectEpsilonFrontierCandidate(epsilonFrontier);
  const chosenStateIndices = selectedEpsilonCandidate.chosenStateIndices;

  let oldSumM = 0;
  let oldSumI = 0;
  let newSumM = 0;
  let newSumI = 0;
  let oldTotalSalary = 0;
  let newTotalSalary = 0;
  let worstRetention = 1;

  const recommendations: Recommendation[] = profiles.map((profile, index) => {
    const originalState = profile.states[profile.originalStateIndex];
    const chosenStateIndex =
      chosenStateIndices[index] ?? profile.originalStateIndex;
    const state = profile.states[chosenStateIndex];

    const salaryRetention = formulaUpliftRetention(profile, state);
    const salaryChange = state.salary - originalState.salary;

    oldSumM += profile.originalM;
    oldSumI += profile.originalI;
    newSumM += state.m;
    newSumI += state.i;
    oldTotalSalary += originalState.salary;
    newTotalSalary += state.salary;
    worstRetention = Math.min(worstRetention, salaryRetention);

    return {
      id: profile.source.id,
      name: profile.source.name,
      dossierId: profile.source.dossierId,
      matricule: profile.source.matricule,

      oldM: profile.originalM,
      newM: state.m,
      deltaM: state.m - profile.originalM,

      oldI: profile.originalI,
      newI: state.i,
      deltaI: state.i - profile.originalI,

      oldEffectiveM: profile.originalEffectiveM,
      newEffectiveM: state.effectiveM,
      oldEffectiveI: profile.originalEffectiveI,
      newEffectiveI: state.effectiveI,

      currentSalary: profile.currentSalary,
      originalSalary: originalState.salary,
      newSalary: state.salary,
      salaryChange,
      salaryRetention,

      missionProtection: missionExcellenceProtection(profile.originalM),
      investmentProtection: investmentExcellenceProtection(profile.originalI),
    };
  });

  // Surface the most salary-sensitive recommendations first, then the largest
  // raw movement. This does not influence the optimization itself.
  recommendations.sort((a, b) => {
    if (Math.abs(a.salaryRetention - b.salaryRetention) > 1e-12) {
      return a.salaryRetention - b.salaryRetention;
    }

    const movementA =
      Math.abs(a.deltaM) + Math.abs(a.deltaI) / INVESTMENT_STEP;
    const movementB =
      Math.abs(b.deltaM) + Math.abs(b.deltaI) / INVESTMENT_STEP;

    return movementB - movementA;
  });

  const oldMeanM = oldSumM / n;
  const oldMeanI = oldSumI / n;
  const newMeanM = newSumM / n;
  const newMeanI = newSumI / n;

  return {
    recommendations,
    eigen,

    oldMeanM,
    newMeanM,
    oldMeanI,
    newMeanI,

    oldRawMeanM: oldMeanM,
    newRawMeanM: newMeanM,
    oldRawMeanI: oldMeanI,
    newRawMeanI: newMeanI,

    oldTotalSalary,
    newTotalSalary,
    worstRetention,

    targetMReached: Math.abs(newMeanM - TARGET_M) < 0.05,
    targetIReached: Math.abs(newMeanI - TARGET_I) < 0.05,
  };
}
