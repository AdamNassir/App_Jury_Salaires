/**
 * Plateau-aware percentage optimizer.
 *
 * Drop-in replacement for ../../lib/percentageOptimizer
 *
 * Mission:
 *   legal raw values = 95..100, step 1
 *   target raw global average = 98
 *
 * Investissement:
 *   legal raw values = 0..100, step 10
 *   target raw global average = 60
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
 * The optimizer uses dossier-specific economic coordinates to assess salary
 * sensitivity and plateau movements. Global targets remain the percentages
 * actually stored on dossiers and displayed in the salary table.
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
const TARGET_WEIGHT = 50000000;
const WORST_SALARY_WEIGHT = 5000;
const INDIVIDUAL_SALARY_WEIGHT = 20000;
const TOTAL_SALARY_WEIGHT = 5000;
const EXCELLENCE_WEIGHT = 50000;
const MOVEMENT_WEIGHT = 20000;
const PCA_WEIGHT = 1;
// The worst-person term is intentionally very steep. It is a soft barrier,
// not a hard salary-loss cap: a large loss remains possible if genuinely
// unavoidable, but the optimizer strongly prefers distributing reductions.
const WORST_SALARY_EXPONENT = 50;
const INDIVIDUAL_SALARY_EXPONENT = 12;
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
     * Plateau-aware diagnostic coordinates. They are NEVER used as the real
     * global Mission / Investissement averages.
     */
    oldEffectiveM: number;
    newEffectiveM: number;
    oldEffectiveI: number;
    newEffectiveI: number;
    /** Fixed per-dossier Salaire Actuel / personal retention baseline. */
    currentSalary: number;
    originalSalary: number;
    newSalary: number;
    salaryChange: number;
    salaryRetention: number;
    missionProtection: number;
    investmentProtection: number;
}
export interface EigenResult {
    covariance: [
        [
            number,
            number
        ],
        [
            number,
            number
        ]
    ];
    eigenvalues: [
        number,
        number
    ];
    eigenvectors: [
        [
            number,
            number
        ],
        [
            number,
            number
        ]
    ];
}
export interface OptimizationResult {
    recommendations: Recommendation[];
    eigen: EigenResult;
    /** Actual percentages stored on dossiers. */
    oldMeanM: number;
    newMeanM: number;
    oldMeanI: number;
    newMeanI: number;
    /** Backward-compatible aliases of the actual percentage averages. */
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
    if (values.length === 0)
        return 0;
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
function dot(a: [
    number,
    number
], b: [
    number,
    number
]): number {
    return a[0] * b[0] + a[1] * b[1];
}
function vectorLength(v: [
    number,
    number
]): number {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}
function normalizeVector(v: [
    number,
    number
]): [
    number,
    number
] {
    const length = vectorLength(v);
    if (length < 1e-12)
        return [0, 0];
    return [v[0] / length, v[1] / length];
}
/**
 * Unbounded mathematical salary formula.
 */
export function calculateRawFormulaSalary(mission: number, investment: number, a: number, currentSalary: number): number {
    return (mission / 100) * (currentSalary +
        (investment / 100) * (a - currentSalary));
}
/**
 * Business salary formula used by optimization:
 *
 * currentSalary <= Salaire Formule <= soldSalary
 */
export function calculateEffectiveFormulaSalary(mission: number, investment: number, a: number, currentSalary: number, soldSalary: number): number {
    const raw = calculateRawFormulaSalary(mission, investment, a, currentSalary);
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
    const originalM = snapMission(user.mission ?? user.m ?? TARGET_M);
    const originalI = snapInvestment(user.investment ?? user.i ?? TARGET_I);
    const currentSalary = Math.max(0, Number.isFinite(user.currentSalary)
        ? user.currentSalary
        : (user.b ?? 0));
    const soldSalary = Math.max(currentSalary, Number.isFinite(user.soldSalary)
        ? user.soldSalary
        : currentSalary);
    // The application guarantees a > currentSalary for processable dossiers.
    // The guard prevents numerical issues if bad test data slips through.
    const a = Math.max(Number.isFinite(user.a) ? user.a : soldSalary, currentSalary + 0.01);
    const salaryAt = (m: number, i: number) => calculateEffectiveFormulaSalary(m, i, a, currentSalary, soldSalary);
    /**
     * State-dependent economic coordinates.
     *
     * This is deliberately evaluated at the OTHER percentage of the candidate
     * state. A plateau can appear/disappear depending on the Mission /
     * Investissement combination because Salaire Formule is clamped between
     * currentSalary and soldSalary.
     *
     * If an axis is completely inactive at that state, it contributes the
     * neutral global target for that axis. This prevents raw percentage changes
     * inside a salary plateau from falsifying the economic global average.
     */
    const effectiveMAt = (m: number, i: number): number => {
        const lowSalary = salaryAt(MIN_M, i);
        const highSalary = salaryAt(MAX_M, i);
        const range = highSalary - lowSalary;
        if (Math.abs(range) <= SALARY_TOLERANCE) {
            return TARGET_M;
        }
        const value = MIN_M +
            (MAX_M - MIN_M) *
                ((salaryAt(m, i) - lowSalary) / range);
        return clamp(value, MIN_M, MAX_M);
    };
    const effectiveIAt = (m: number, i: number): number => {
        const lowSalary = salaryAt(m, MIN_I);
        const highSalary = salaryAt(m, MAX_I);
        const range = highSalary - lowSalary;
        if (Math.abs(range) <= SALARY_TOLERANCE) {
            return TARGET_I;
        }
        const value = (MAX_I - MIN_I) *
            ((salaryAt(m, i) - lowSalary) / range);
        return clamp(value, MIN_I, MAX_I);
    };
    // Kept as diagnostic metadata only.
    const missionActive = Math.abs(salaryAt(MAX_M, MAX_I) - salaryAt(MIN_M, MAX_I)) >
        SALARY_TOLERANCE;
    const investmentActive = Math.abs(salaryAt(MAX_M, MAX_I) - salaryAt(MAX_M, MIN_I)) >
        SALARY_TOLERANCE;
    const states: EconomicState[] = [];
    const stateByKey = new Map<string, number>();
    for (let m = MIN_M; m <= MAX_M; m += MISSION_STEP) {
        for (let i = MIN_I; i <= MAX_I; i += INVESTMENT_STEP) {
            const rawSalary = calculateRawFormulaSalary(m, i, a, currentSalary);
            const salary = calculateEffectiveFormulaSalary(m, i, a, currentSalary, soldSalary);
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
    const originalStateIndex = stateByKey.get(stateKey(originalM, originalI)) ?? 0;
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
    // PCA describes the real stored percentage population. Economic / plateau
    // coordinates are diagnostics only and must never replace raw percentages.
    const points = profiles.map((profile) => [
        normalizeMission(profile.originalM),
        normalizeInvestment(profile.originalI),
    ] as [
        number,
        number
    ]);
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
    const discriminant = Math.sqrt(Math.pow((a - d) / 2, 2) +
        c * c);
    const lambda1 = halfTrace + discriminant;
    const lambda2 = halfTrace - discriminant;
    let v1: [
        number,
        number
    ];
    if (Math.abs(c) > 1e-12) {
        v1 = normalizeVector([
            c,
            lambda1 - a,
        ]);
    }
    else {
        v1 = a >= d ? [1, 0] : [0, 1];
    }
    const v2: [
        number,
        number
    ] = [
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
function structuralPenalty(profile: InternalProfile, state: EconomicState, eigen: EigenResult): number {
    const movement: [
        number,
        number
    ] = [
        (state.m - profile.originalM) /
            (MAX_M - MIN_M),
        (state.i - profile.originalI) /
            (MAX_I - MIN_I),
    ];
    const [v1, v2] = eigen.eigenvectors;
    const [lambda1, lambda2] = eigen.eigenvalues;
    const p1 = dot(movement, v1);
    const p2 = dot(movement, v2);
    const regularization = 0.05;
    return ((p1 * p1) / (lambda1 + regularization) +
        (p2 * p2) / (lambda2 + regularization));
}
/**
 * Retention is measured from this dossier's own fixed current-salary floor,
 * not from zero.
 *
 * Example:
 *   currentSalary = 67,000
 *   original Formula = 67,500
 *   new Formula = 67,000
 * => original uplift = 500, retained uplift = 0, retention = 0%.
 *
 * Increases are capped at 100% retention for the loss/fairness metric so one
 * person's gain can never compensate for destroying another person's uplift.
 */
function formulaUpliftRetention(profile: InternalProfile, state: EconomicState): number {
    const originalUplift = Math.max(0, profile.originalSalary - profile.currentSalary);
    if (originalUplift <= SALARY_TOLERANCE) {
        return 1;
    }
    const retainedUplift = Math.max(0, state.salary - profile.currentSalary);
    return clamp(retainedUplift / originalUplift, 0, 1);
}
function evaluateSolution(profiles: InternalProfile[], eigen: EigenResult): SolutionStats {
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
    let originalTotalUplift = 0;
    let retainedTotalUplift = 0;
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
        const originalUplift = Math.max(0, profile.originalSalary - profile.currentSalary);
        const retainedUplift = Math.min(originalUplift, Math.max(0, state.salary - profile.currentSalary));
        originalTotalUplift += originalUplift;
        retainedTotalUplift += retainedUplift;
        const retention = formulaUpliftRetention(profile, state);
        const salaryLoss = 1 - retention;
        worstSalaryLoss = Math.max(worstSalaryLoss, salaryLoss);
        individualSalaryPenalty += Math.expm1(INDIVIDUAL_SALARY_EXPONENT * salaryLoss);
        // Log utility uses the same personal baseline. It only rewards retaining
        // existing Formula uplift; gains above the original uplift are deliberately
        // not allowed to compensate another dossier's loss.
        salaryUtility += Math.log(Math.max(retention, 0.000001));
        const missionDecrease = Math.max(0, profile.originalM - state.m);
        const investmentDecrease = Math.max(0, profile.originalI - state.i);
        excellencePenalty +=
            missionExcellenceProtection(profile.originalM) *
                Math.pow(missionDecrease / (MAX_M - MIN_M), 2);
        excellencePenalty +=
            investmentExcellenceProtection(profile.originalI) *
                Math.pow(investmentDecrease / (MAX_I - MIN_I), 2);
        // This protects low values too: a 40 -> 0 change is expensive
        // even though 40 has little "excellence" protection.
        movementPenalty +=
            Math.pow((state.m - profile.originalM) /
                (MAX_M - MIN_M), 2) +
                Math.pow((state.i - profile.originalI) /
                    (MAX_I - MIN_I), 2);
        pcaPenalty += structuralPenalty(profile, state, eigen);
    }
    const n = profiles.length;
    const meanEffectiveM = sumEffectiveM / n;
    const meanEffectiveI = sumEffectiveI / n;
    const meanRawM = sumRawM / n;
    const meanRawI = sumRawI / n;
    const normalizedMError = (meanRawM - TARGET_M) /
        (MAX_M - MIN_M);
    const normalizedIError = (meanRawI - TARGET_I) /
        (MAX_I - MIN_I);
    const targetError = normalizedMError * normalizedMError +
        normalizedIError * normalizedIError;
    const worstSalaryPenalty = Math.expm1(WORST_SALARY_EXPONENT * worstSalaryLoss);
    const aggregateRetention = originalTotalUplift > SALARY_TOLERANCE
        ? retainedTotalUplift / originalTotalUplift
        : 1;
    const aggregateSalaryLoss = Math.max(0, 1 - aggregateRetention);
    const score = TARGET_WEIGHT * targetError +
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
function rawAdjacentStateIndices(profile: InternalProfile): number[] {
    const current = profile.states[profile.currentStateIndex];
    const result: number[] = [];
    const candidates: Array<[
        number,
        number
    ]> = [
        [current.m - MISSION_STEP, current.i],
        [current.m + MISSION_STEP, current.i],
        [current.m, current.i - INVESTMENT_STEP],
        [current.m, current.i + INVESTMENT_STEP],
    ];
    for (const [m, i] of candidates) {
        if (m < MIN_M || m > MAX_M || i < MIN_I || i > MAX_I) {
            continue;
        }
        const index = profile.stateByKey.get(stateKey(m, i));
        if (index !== undefined)
            result.push(index);
    }
    return result;
}
/**
 * Joint discrete economic coordinate descent.
 *
 * Unlike the previous implementation, a dossier cannot jump directly from
 * Investissement 80 to 0 merely because that gives a large target gain.
 * Each iteration can move only to the next salary-distinct state on one axis.
 * Raw plateau points are skipped automatically, so plateau handling is kept
 * without enabling destructive giant jumps.
 */
function coordinateDescent(profiles: InternalProfile[], eigen: EigenResult): void {
    const n = profiles.length;
    if (n === 0)
        return;
    const targetTotalM = TARGET_M * n;
    const targetTotalI = TARGET_I * n;
    const rawTotals = () => {
        let m = 0;
        let i = 0;
        for (const profile of profiles) {
            const state = profile.states[profile.currentStateIndex];
            m += state.m;
            i += state.i;
        }
        return { m, i };
    };
    let totals = rawTotals();
    let remainingM = targetTotalM - totals.m;
    let remainingI = targetTotalI - totals.i;
    // At most 5 Mission steps + 10 Investment steps per dossier are ever needed.
    const maxIterations = Math.max(100, n * 20 + 100);
    for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (Math.abs(remainingM) < 0.5 && Math.abs(remainingI) < 0.5) {
            break;
        }
        let bestProfileIndex = -1;
        let bestStateIndex = -1;
        let bestAllocationCost = Number.POSITIVE_INFINITY;
        let bestWorstRetention = -1;
        let bestTargetError = Number.POSITIVE_INFINITY;
        for (let p = 0; p < profiles.length; p++) {
            const profile = profiles[p];
            const currentIndex = profile.currentStateIndex;
            const currentState = profile.states[currentIndex];
            for (const s of rawAdjacentStateIndices(profile)) {
                if (s === currentIndex)
                    continue;
                const next = profile.states[s];
                const dm = next.m - currentState.m;
                const di = next.i - currentState.i;
                // Only move in the direction still required by the real RAW targets.
                if (dm !== 0) {
                    if (remainingM === 0 || Math.sign(dm) !== Math.sign(remainingM)) {
                        continue;
                    }
                    if (Math.abs(dm) > Math.abs(remainingM))
                        continue;
                }
                if (di !== 0) {
                    if (remainingI === 0 || Math.sign(di) !== Math.sign(remainingI)) {
                        continue;
                    }
                    if (Math.abs(di) > Math.abs(remainingI))
                        continue;
                }
                profile.currentStateIndex = s;
                const candidate = evaluateSolution(profiles, eigen);
                profile.currentStateIndex = currentIndex;
                // The global target is enforced by remainingM/remainingI, so compare
                // allocation harm separately. This makes salary-flat plateau moves the
                // cheapest moves instead of ignoring them.
                const allocationCost = candidate.score - TARGET_WEIGHT * candidate.targetError;
                if (allocationCost < bestAllocationCost - SCORE_EPSILON ||
                    (Math.abs(allocationCost - bestAllocationCost) <= SCORE_EPSILON &&
                        candidate.worstRetention > bestWorstRetention + SCORE_EPSILON) ||
                    (Math.abs(allocationCost - bestAllocationCost) <= SCORE_EPSILON &&
                        Math.abs(candidate.worstRetention - bestWorstRetention) <= SCORE_EPSILON &&
                        candidate.targetError < bestTargetError - SCORE_EPSILON)) {
                    bestAllocationCost = allocationCost;
                    bestWorstRetention = candidate.worstRetention;
                    bestTargetError = candidate.targetError;
                    bestProfileIndex = p;
                    bestStateIndex = s;
                }
            }
        }
        if (bestProfileIndex < 0 || bestStateIndex < 0) {
            // With legal starting states and targets 98/60 this should not happen,
            // but stop safely rather than fabricate percentages.
            break;
        }
        profiles[bestProfileIndex].currentStateIndex = bestStateIndex;
        totals = rawTotals();
        remainingM = targetTotalM - totals.m;
        remainingI = targetTotalI - totals.i;
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
function pairwiseRefinement(profiles: InternalProfile[], eigen: EigenResult): void {
    if (profiles.length < 2 || profiles.length > 100) {
        return;
    }
    let current = evaluateSolution(profiles, eigen);
    const tryPairMove = (fromIndex: number, toIndex: number, deltaM: number, deltaI: number): boolean => {
        const from = profiles[fromIndex];
        const to = profiles[toIndex];
        const fromState = from.states[from.currentStateIndex];
        const toState = to.states[to.currentStateIndex];
        const nextFromM = fromState.m - deltaM;
        const nextFromI = fromState.i - deltaI;
        const nextToM = toState.m + deltaM;
        const nextToI = toState.i + deltaI;
        const fromNextIndex = from.stateByKey.get(stateKey(nextFromM, nextFromI));
        const toNextIndex = to.stateByKey.get(stateKey(nextToM, nextToI));
        if (fromNextIndex === undefined ||
            toNextIndex === undefined) {
            return false;
        }
        const oldFrom = from.currentStateIndex;
        const oldTo = to.currentStateIndex;
        from.currentStateIndex = fromNextIndex;
        to.currentStateIndex = toNextIndex;
        const fromNextState = from.states[fromNextIndex];
        const toNextState = to.states[toNextIndex];
        const candidate = evaluateSolution(profiles, eigen);
        if (candidate.score <
            current.score - SCORE_EPSILON) {
            current = candidate;
            return true;
        }
        from.currentStateIndex = oldFrom;
        to.currentStateIndex = oldTo;
        return false;
    };
    for (let pass = 0; pass < 3; pass++) {
        let improved = false;
        for (let from = 0; from < profiles.length; from++) {
            for (let to = 0; to < profiles.length; to++) {
                if (from === to)
                    continue;
                // Mission -1 / +1
                if (tryPairMove(from, to, MISSION_STEP, 0)) {
                    improved = true;
                }
                // Investissement -10 / +10
                if (tryPairMove(from, to, 0, INVESTMENT_STEP)) {
                    improved = true;
                }
            }
        }
        if (!improved)
            break;
    }
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
    const originalStats = evaluateSolution(profiles, eigen);
    coordinateDescent(profiles, eigen);
    pairwiseRefinement(profiles, eigen);
    const finalStats = evaluateSolution(profiles, eigen);
    const recommendations: Recommendation[] = profiles.map((profile) => {
        const originalState = profile.states[profile.originalStateIndex];
        const state = profile.states[profile.currentStateIndex];
        const salaryChange = state.salary - originalState.salary;
        const salaryRetention = formulaUpliftRetention(profile, state);
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
    // Most salary-sensitive / worst-retained recommendations first.
    recommendations.sort((a, b) => {
        if (Math.abs(a.salaryRetention - b.salaryRetention) > 1e-12) {
            return a.salaryRetention - b.salaryRetention;
        }
        const movementA = Math.abs(a.deltaM) +
            Math.abs(a.deltaI) / INVESTMENT_STEP;
        const movementB = Math.abs(b.deltaM) +
            Math.abs(b.deltaI) / INVESTMENT_STEP;
        return movementB - movementA;
    });
    const oldTotalSalary = profiles.reduce((sum, profile) => sum + profile.originalSalary, 0);
    return {
        recommendations,
        eigen,
        oldMeanM: originalStats.meanRawM,
        newMeanM: finalStats.meanRawM,
        oldMeanI: originalStats.meanRawI,
        newMeanI: finalStats.meanRawI,
        oldRawMeanM: originalStats.meanRawM,
        newRawMeanM: finalStats.meanRawM,
        oldRawMeanI: originalStats.meanRawI,
        newRawMeanI: finalStats.meanRawI,
        oldTotalSalary,
        newTotalSalary: finalStats.totalSalary,
        worstRetention: finalStats.worstRetention,
        targetMReached: Math.abs(finalStats.meanRawM - TARGET_M) <
            0.05,
        targetIReached: Math.abs(finalStats.meanRawI - TARGET_I) <
            0.05,
    };
}
