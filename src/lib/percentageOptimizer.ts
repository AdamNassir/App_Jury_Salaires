/**
 * Plateau-aware percentage optimizer.
 *
 * Drop-in replacement for ../../lib/percentageOptimizer
 *
 * Mission:
 *   legal raw values = 95..100, step 1
 *   target ECONOMIC/effective global average = 98
 *
 * Investissement:
 *   legal raw values = 0..100, step 10
 *   target ECONOMIC/effective global average = 60
 *
 * Per dossier:
 *   b = currentSalary (fixed lower bound)
 *   soldSalary = fixed upper bound produced by TJ Vendu
 *   a = dossier-specific theoretical formula ceiling
 *
 * Raw formula:
 *   F(m, i) = (m / 100) * (b + (i / 100) * (a - b))
 *
 * Salary Formule actually used by the optimizer:
 *   clamp(F, currentSalary, soldSalary)
 *
 * The optimizer uses a dossier-specific ECONOMIC scale so raw percentage
 * movements inside a salary plateau do not falsely move the global averages.
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
const SCORE_EPSILON = 1e-9;

// Target closeness is very important, but not absolute: severe individual
// salary damage can still outweigh a tiny improvement in the target error.
const TARGET_WEIGHT = 50_000_000;
const WORST_SALARY_WEIGHT = 30_000;
const INDIVIDUAL_SALARY_WEIGHT = 10_000;
const TOTAL_SALARY_WEIGHT = 2_500;
const EXCELLENCE_WEIGHT = 250;
const MOVEMENT_WEIGHT = 150;
const PCA_WEIGHT = 1;

const MISSION_EXCELLENCE_STRENGTH = 8;
const INVESTMENT_EXCELLENCE_STRENGTH = 8;

export interface OptimizerUser {
  id: string;
  name: string;

  mission?: number;
  investment?: number;

  // Legacy aliases kept because the existing modal already provides them.
  m?: number;
  i?: number;

  dossierId?: string;
  matricule?: string;

  /**
   * Dossier-specific theoretical formula ceiling.
   */
  a: number;

  /**
   * Kept for backward compatibility. In the revised model b is the
   * fixed Salaire Actuel and should equal currentSalary.
   */
  b?: number;

  /**
   * Fixed Salaire Actuel. This is the lower bound of Salaire Formule.
   */
  currentSalary: number;

  /**
   * Fixed Salaire Vendu. This is the upper bound of Salaire Formule.
   */
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

  /**
   * Plateau-aware economic coordinates used in the global averages.
   */
  oldEffectiveM: number;
  newEffectiveM: number;
  oldEffectiveI: number;
  newEffectiveI: number;

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

  /**
   * These are the economically meaningful / plateau-aware averages.
   * They intentionally keep the existing field names so the modal API
   * does not need to change.
   */
  oldMeanM: number;
  newMeanM: number;
  oldMeanI: number;
  newMeanI: number;

  /**
   * Raw averages are exposed for audit/transparency.
   */
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
  salary: number;
  rawSalary: number;
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
  currentStateIndex: number;
  originalStateIndex: number;

  originalSalary: number;
  originalEffectiveM: number;
  originalEffectiveI: number;

  missionActive: boolean;
  investmentActive: boolean;
}

interface SolutionStats {
  score: number;
  targetError: number;
  meanEffectiveM: number;
  meanEffectiveI: number;
  meanRawM: number;
  meanRawI: number;
  totalSalary: number;
  worstRetention: number;
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
  return i / 100;
}

function dot(
  a: [number, number],
  b: [number, number]
): number {
  return a[0] * b[0] + a[1] * b[1];
}

function vectorLength(v: [number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

function normalizeVector(v: [number, number]): [number, number] {
  const length = vectorLength(v);
  if (length < 1e-12) return [0, 0];
  return [v[0] / length, v[1] / length];
}

/**
 * Unbounded mathematical salary formula.
 */
export function calculateRawFormulaSalary(
  mission: number,
  investment: number,
  a: number,
  currentSalary: number
): number {
  return (
    mission / 100
  ) * (
    currentSalary +
    (investment / 100) * (a - currentSalary)
  );
}

/**
 * Business salary formula used by optimization:
 *
 * currentSalary <= Salaire Formule <= soldSalary
 */
export function calculateEffectiveFormulaSalary(
  mission: number,
  investment: number,
  a: number,
  currentSalary: number,
  soldSalary: number
): number {
  const raw = calculateRawFormulaSalary(
    mission,
    investment,
    a,
    currentSalary
  );

  return clamp(
    raw,
    currentSalary,
    Math.max(currentSalary, soldSalary)
  );
}

function missionExcellenceProtection(originalM: number): number {
  const quality = clamp(normalizeMission(originalM), 0, 1);
  return Math.exp(
    MISSION_EXCELLENCE_STRENGTH * Math.pow(quality, 3)
  );
}

function investmentExcellenceProtection(originalI: number): number {
  const quality = clamp(normalizeInvestment(originalI), 0, 1);
  return Math.exp(
    INVESTMENT_EXCELLENCE_STRENGTH * Math.pow(quality, 4)
  );
}

/**
 * Build the fixed, dossier-specific economic scales.
 *
 * Mission's canonical response is measured at Investissement = 100.
 * Investissement's canonical response is measured at Mission = 100.
 *
 * This follows the "true personal scale" idea:
 * if, for example, Mission 98/99/100 all produce the same capped salary
 * at maximum Investissement, all three map to the same effective Mission.
 *
 * If an entire axis is economically inactive for a dossier, its effective
 * coordinate is neutralized at the global target (98 for M / 60 for I).
 */
function buildProfile(user: OptimizerUser): InternalProfile {
  const originalM = snapMission(
    user.mission ?? user.m ?? TARGET_M
  );
  const originalI = snapInvestment(
    user.investment ?? user.i ?? TARGET_I
  );

  const currentSalary = Math.max(
    0,
    Number.isFinite(user.currentSalary)
      ? user.currentSalary
      : (user.b ?? 0)
  );

  const soldSalary = Math.max(
    currentSalary,
    Number.isFinite(user.soldSalary)
      ? user.soldSalary
      : currentSalary
  );

  // The application guarantees a > currentSalary for processable dossiers.
  // The guard prevents numerical issues if bad test data slips through.
  const a = Math.max(
    Number.isFinite(user.a) ? user.a : soldSalary,
    currentSalary + 0.01
  );

  const salaryAt = (m: number, i: number) =>
    calculateEffectiveFormulaSalary(
      m,
      i,
      a,
      currentSalary,
      soldSalary
    );

  // Canonical personal Mission scale at maximum Investissement.
  const missionLowSalary = salaryAt(MIN_M, MAX_I);
  const missionHighSalary = salaryAt(MAX_M, MAX_I);
  const missionRange = missionHighSalary - missionLowSalary;
  const missionActive = Math.abs(missionRange) > SALARY_TOLERANCE;

  const effectiveM = (m: number): number => {
    if (!missionActive) return TARGET_M;

    const value =
      MIN_M +
      (MAX_M - MIN_M) *
        (
          (salaryAt(m, MAX_I) - missionLowSalary) /
          missionRange
        );

    return clamp(value, MIN_M, MAX_M);
  };

  // Canonical personal Investissement scale at maximum Mission.
  const investmentLowSalary = salaryAt(MAX_M, MIN_I);
  const investmentHighSalary = salaryAt(MAX_M, MAX_I);
  const investmentRange =
    investmentHighSalary - investmentLowSalary;
  const investmentActive =
    Math.abs(investmentRange) > SALARY_TOLERANCE;

  const effectiveI = (i: number): number => {
    if (!investmentActive) return TARGET_I;

    const value =
      100 *
      (
        (salaryAt(MAX_M, i) - investmentLowSalary) /
        investmentRange
      );

    return clamp(value, MIN_I, MAX_I);
  };

  const states: EconomicState[] = [];
  const stateByKey = new Map<string, number>();

  for (let m = MIN_M; m <= MAX_M; m += MISSION_STEP) {
    for (
      let i = MIN_I;
      i <= MAX_I;
      i += INVESTMENT_STEP
    ) {
      const rawSalary = calculateRawFormulaSalary(
        m,
        i,
        a,
        currentSalary
      );

      const salary = calculateEffectiveFormulaSalary(
        m,
        i,
        a,
        currentSalary,
        soldSalary
      );

      const index = states.length;

      states.push({
        m,
        i,
        rawSalary,
        salary,
        effectiveM: effectiveM(m),
        effectiveI: effectiveI(i),
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
    currentStateIndex: originalStateIndex,
    originalStateIndex,
    originalSalary: originalState.salary,
    originalEffectiveM: originalState.effectiveM,
    originalEffectiveI: originalState.effectiveI,
    missionActive,
    investmentActive,
  };
}

function calculateEigenAnalysis(
  profiles: InternalProfile[]
): EigenResult {
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

  const points = profiles.map((profile) => [
    normalizeMission(profile.originalEffectiveM),
    normalizeInvestment(profile.originalEffectiveI),
  ] as [number, number]);

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

  const a = varM;
  const c = covMI;
  const d = varI;

  const halfTrace = (a + d) / 2;
  const discriminant = Math.sqrt(
    Math.pow((a - d) / 2, 2) +
    c * c
  );

  const lambda1 = halfTrace + discriminant;
  const lambda2 = halfTrace - discriminant;

  let v1: [number, number];

  if (Math.abs(c) > 1e-12) {
    v1 = normalizeVector([
      c,
      lambda1 - a,
    ]);
  } else {
    v1 = a >= d ? [1, 0] : [0, 1];
  }

  const v2: [number, number] = [
    -v1[1],
    v1[0],
  ];

  return {
    covariance: [
      [varM, covMI],
      [covMI, varI],
    ],
    eigenvalues: [
      Math.max(0, lambda1),
      Math.max(0, lambda2),
    ],
    eigenvectors: [v1, v2],
  };
}

function structuralPenalty(
  profile: InternalProfile,
  state: EconomicState,
  eigen: EigenResult
): number {
  const movement: [number, number] = [
    (state.effectiveM - profile.originalEffectiveM) /
      (MAX_M - MIN_M),
    (state.effectiveI - profile.originalEffectiveI) /
      (MAX_I - MIN_I),
  ];

  const [v1, v2] = eigen.eigenvectors;
  const [lambda1, lambda2] = eigen.eigenvalues;

  const p1 = dot(movement, v1);
  const p2 = dot(movement, v2);

  const regularization = 0.05;

  return (
    (p1 * p1) / (lambda1 + regularization) +
    (p2 * p2) / (lambda2 + regularization)
  );
}

function evaluateSolution(
  profiles: InternalProfile[],
  eigen: EigenResult
): SolutionStats {
  if (profiles.length === 0) {
    return {
      score: 0,
      targetError: 0,
      meanEffectiveM: TARGET_M,
      meanEffectiveI: TARGET_I,
      meanRawM: TARGET_M,
      meanRawI: TARGET_I,
      totalSalary: 0,
      worstRetention: 1,
    };
  }

  let sumEffectiveM = 0;
  let sumEffectiveI = 0;
  let sumRawM = 0;
  let sumRawI = 0;

  let totalSalary = 0;
  let originalTotalSalary = 0;

  let worstSalaryLoss = 0;
  let individualSalaryPenalty = 0;
  let salaryUtility = 0;
  let excellencePenalty = 0;
  let movementPenalty = 0;
  let pcaPenalty = 0;

  for (const profile of profiles) {
    const state = profile.states[profile.currentStateIndex];

    sumEffectiveM += state.effectiveM;
    sumEffectiveI += state.effectiveI;
    sumRawM += state.m;
    sumRawI += state.i;

    totalSalary += state.salary;
    originalTotalSalary += profile.originalSalary;

    const originalSalary = Math.max(
      profile.originalSalary,
      0.000001
    );

    const retention = state.salary / originalSalary;
    const salaryLoss = Math.max(0, 1 - retention);

    worstSalaryLoss = Math.max(
      worstSalaryLoss,
      salaryLoss
    );

    individualSalaryPenalty += Math.expm1(
      6 * salaryLoss
    );

    // Rewards salary preservation / increases without allowing a very
    // large salary to fully compensate for crushing another dossier.
    salaryUtility += Math.log(
      Math.max(retention, 0.000001)
    );

    const missionDecrease = Math.max(
      0,
      profile.originalM - state.m
    );

    const investmentDecrease = Math.max(
      0,
      profile.originalI - state.i
    );

    excellencePenalty +=
      missionExcellenceProtection(profile.originalM) *
      Math.pow(
        missionDecrease / (MAX_M - MIN_M),
        2
      );

    excellencePenalty +=
      investmentExcellenceProtection(profile.originalI) *
      Math.pow(
        investmentDecrease / (MAX_I - MIN_I),
        2
      );

    // This protects low values too: a 40 -> 0 change is expensive
    // even though 40 has little "excellence" protection.
    movementPenalty +=
      Math.pow(
        (state.m - profile.originalM) /
          (MAX_M - MIN_M),
        2
      ) +
      Math.pow(
        (state.i - profile.originalI) /
          (MAX_I - MIN_I),
        2
      );

    pcaPenalty += structuralPenalty(
      profile,
      state,
      eigen
    );
  }

  const n = profiles.length;

  const meanEffectiveM = sumEffectiveM / n;
  const meanEffectiveI = sumEffectiveI / n;
  const meanRawM = sumRawM / n;
  const meanRawI = sumRawI / n;

  const normalizedMError =
    (meanEffectiveM - TARGET_M) /
    (MAX_M - MIN_M);

  const normalizedIError =
    (meanEffectiveI - TARGET_I) /
    (MAX_I - MIN_I);

  const targetError =
    normalizedMError * normalizedMError +
    normalizedIError * normalizedIError;

  const worstSalaryPenalty = Math.expm1(
    8 * worstSalaryLoss
  );

  const aggregateRetention =
    originalTotalSalary > 0
      ? totalSalary / originalTotalSalary
      : 1;

  const aggregateSalaryLoss = Math.max(
    0,
    1 - aggregateRetention
  );

  const score =
    TARGET_WEIGHT * targetError +
    WORST_SALARY_WEIGHT * worstSalaryPenalty +
    INDIVIDUAL_SALARY_WEIGHT *
      (individualSalaryPenalty / n) +
    TOTAL_SALARY_WEIGHT *
      aggregateSalaryLoss -
    // Small reward for aggregate/log welfare.
    (TOTAL_SALARY_WEIGHT / 4) *
      (salaryUtility / n) +
    EXCELLENCE_WEIGHT *
      (excellencePenalty / n) +
    MOVEMENT_WEIGHT *
      (movementPenalty / n) +
    PCA_WEIGHT *
      (pcaPenalty / n);

  return {
    score,
    targetError,
    meanEffectiveM,
    meanEffectiveI,
    meanRawM,
    meanRawI,
    totalSalary,
    worstRetention: 1 - worstSalaryLoss,
  };
}

/**
 * Joint discrete coordinate descent.
 *
 * Every pass may move a dossier directly to ANY of its 66 legal states.
 * This is essential for plateau handling:
 *
 * if 100 -> 99 -> 98 are all salary-equivalent, but 97 leaves the plateau,
 * the optimizer can evaluate 100 -> 97 directly instead of getting stuck
 * because the intermediate plateau steps offer no immediate target benefit.
 */
function coordinateDescent(
  profiles: InternalProfile[],
  eigen: EigenResult
): void {
  let current = evaluateSolution(profiles, eigen);

  const maxIterations = Math.max(
    50,
    Math.min(500, profiles.length * 12)
  );

  for (
    let iteration = 0;
    iteration < maxIterations;
    iteration++
  ) {
    let bestScore = current.score;
    let bestProfileIndex = -1;
    let bestStateIndex = -1;

    for (
      let p = 0;
      p < profiles.length;
      p++
    ) {
      const profile = profiles[p];
      const originalIndex = profile.currentStateIndex;

      for (
        let s = 0;
        s < profile.states.length;
        s++
      ) {
        if (s === originalIndex) continue;

        profile.currentStateIndex = s;

        const candidate = evaluateSolution(
          profiles,
          eigen
        );

        if (
          candidate.score <
          bestScore - SCORE_EPSILON
        ) {
          bestScore = candidate.score;
          bestProfileIndex = p;
          bestStateIndex = s;
        }
      }

      profile.currentStateIndex = originalIndex;
    }

    if (
      bestProfileIndex < 0 ||
      bestStateIndex < 0
    ) {
      break;
    }

    profiles[bestProfileIndex].currentStateIndex =
      bestStateIndex;

    current = evaluateSolution(profiles, eigen);
  }
}

/**
 * Pairwise redistribution phase.
 *
 * The first phase may reach a good global target but leave a local salary
 * fairness inefficiency. These raw-preserving transfers let two dossiers
 * exchange one legal unit while the full economic objective decides whether
 * the exchange is useful.
 */
function pairwiseRefinement(
  profiles: InternalProfile[],
  eigen: EigenResult
): void {
  if (profiles.length < 2 || profiles.length > 100) {
    return;
  }

  let current = evaluateSolution(profiles, eigen);

  const tryPairMove = (
    fromIndex: number,
    toIndex: number,
    deltaM: number,
    deltaI: number
  ): boolean => {
    const from = profiles[fromIndex];
    const to = profiles[toIndex];

    const fromState =
      from.states[from.currentStateIndex];
    const toState =
      to.states[to.currentStateIndex];

    const nextFromM = fromState.m - deltaM;
    const nextFromI = fromState.i - deltaI;

    const nextToM = toState.m + deltaM;
    const nextToI = toState.i + deltaI;

    const fromNextIndex = from.stateByKey.get(
      stateKey(nextFromM, nextFromI)
    );

    const toNextIndex = to.stateByKey.get(
      stateKey(nextToM, nextToI)
    );

    if (
      fromNextIndex === undefined ||
      toNextIndex === undefined
    ) {
      return false;
    }

    const oldFrom = from.currentStateIndex;
    const oldTo = to.currentStateIndex;

    from.currentStateIndex = fromNextIndex;
    to.currentStateIndex = toNextIndex;

    const candidate = evaluateSolution(
      profiles,
      eigen
    );

    if (
      candidate.score <
      current.score - SCORE_EPSILON
    ) {
      current = candidate;
      return true;
    }

    from.currentStateIndex = oldFrom;
    to.currentStateIndex = oldTo;
    return false;
  };

  for (let pass = 0; pass < 3; pass++) {
    let improved = false;

    for (
      let from = 0;
      from < profiles.length;
      from++
    ) {
      for (
        let to = 0;
        to < profiles.length;
        to++
      ) {
        if (from === to) continue;

        // Mission -1 / +1
        if (
          tryPairMove(
            from,
            to,
            MISSION_STEP,
            0
          )
        ) {
          improved = true;
        }

        // Investissement -10 / +10
        if (
          tryPairMove(
            from,
            to,
            0,
            INVESTMENT_STEP
          )
        ) {
          improved = true;
        }
      }
    }

    if (!improved) break;
  }
}

export function optimize(
  users: OptimizerUser[]
): OptimizationResult {
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

  const originalStats = evaluateSolution(
    profiles,
    eigen
  );

  coordinateDescent(profiles, eigen);
  pairwiseRefinement(profiles, eigen);

  const finalStats = evaluateSolution(
    profiles,
    eigen
  );

  const recommendations: Recommendation[] =
    profiles.map((profile) => {
      const originalState =
        profile.states[profile.originalStateIndex];

      const state =
        profile.states[profile.currentStateIndex];

      const salaryChange =
        state.salary - originalState.salary;

      const salaryRetention =
        originalState.salary > 0
          ? state.salary / originalState.salary
          : 1;

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

        originalSalary: originalState.salary,
        newSalary: state.salary,
        salaryChange,
        salaryRetention,

        missionProtection:
          missionExcellenceProtection(profile.originalM),

        investmentProtection:
          investmentExcellenceProtection(profile.originalI),
      };
    });

  // Most salary-sensitive / worst-retained recommendations first.
  recommendations.sort((a, b) => {
    if (
      Math.abs(
        a.salaryRetention - b.salaryRetention
      ) > 1e-12
    ) {
      return a.salaryRetention - b.salaryRetention;
    }

    const movementA =
      Math.abs(a.deltaM) +
      Math.abs(a.deltaI) / INVESTMENT_STEP;

    const movementB =
      Math.abs(b.deltaM) +
      Math.abs(b.deltaI) / INVESTMENT_STEP;

    return movementB - movementA;
  });

  const oldTotalSalary = profiles.reduce(
    (sum, profile) => sum + profile.originalSalary,
    0
  );

  return {
    recommendations,
    eigen,

    oldMeanM: originalStats.meanEffectiveM,
    newMeanM: finalStats.meanEffectiveM,

    oldMeanI: originalStats.meanEffectiveI,
    newMeanI: finalStats.meanEffectiveI,

    oldRawMeanM: originalStats.meanRawM,
    newRawMeanM: finalStats.meanRawM,

    oldRawMeanI: originalStats.meanRawI,
    newRawMeanI: finalStats.meanRawI,

    oldTotalSalary,
    newTotalSalary: finalStats.totalSalary,

    worstRetention: finalStats.worstRetention,

    targetMReached:
      Math.abs(finalStats.meanEffectiveM - TARGET_M) <
      0.05,

    targetIReached:
      Math.abs(finalStats.meanEffectiveI - TARGET_I) <
      0.05,
  };
}
