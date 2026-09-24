/**
 * MISSION / INVESTISSEMENT SALARY OPTIMIZER
 *
 * MISSION (x)
 * -----------
 * Allowed values: 95, 96, 97, 98, 99, 100
 * Step: 1
 * Global target average: 98
 *
 * INVESTISSEMENT (y)
 * ------------------
 * Allowed values: 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
 * Step: 10
 * Global target average: 60
 * Never recommend values between these discrete states.
 *
 * SALARY
 * ------
 * S(x,y) = (x / 100) * (b + y * (a - b) / 100)
 *
 * Where:
 *   a = maximum salary when x = 100 and y = 100
 *   b = salary/base constant
 *
 * OPTIMIZATION PRIORITIES
 * -----------------------
 * 1. Reach the two global percentage targets.
 * 2. Protect the worst affected individual's salary.
 * 3. Preserve every person's salary as much as possible.
 * 4. Maximize population salary welfare.
 * 5. Strongly protect high ORIGINAL percentage values against decreases.
 * 6. Never weaken protection because a percentage has already been reduced.
 * 7. Do not use low-percentage users as dumping grounds.
 * 8. Penalize increasingly large movement from each user's original values.
 * 9. Use covariance/eigenvalues/eigenvectors only as a secondary structural signal.
 * 10. There is no hard maximum per-user change.
 * 11. All recommendations must stay discrete.
 *
 * When optimizing Investissement: each move is exactly +10 or -10.
 * When redistributing Investissement: one moves -10 while another moves +10.
 * When optimizing Mission: each move is exactly +1 or -1.
 */

// ============================================================
// TYPES
// ============================================================

export type OptimizerUser = {
  id: string;
  name: string;
  mission: number;
  investment: number;
  dossierId?: string;
  matricule?: string;
  a?: number;
  b?: number;
  currentSalary?: number;

  // Compatibility aliases
  m?: number;
  i?: number;
};

export type WorkingUser = OptimizerUser & {
  originalMission: number;
  originalInvestment: number;
  originalSalary: number;
  effectiveA: number;
  effectiveB: number;
};

export type EigenResult = {
  covariance: [[number, number], [number, number]];
  eigenvalues: [number, number];
  eigenvectors: [[number, number], [number, number]];
};

export type Recommendation = {
  id: string;
  name: string;
  dossierId?: string;
  matricule?: string;

  originalMission: number;
  newMission: number;
  missionChange: number;

  originalInvestment: number;
  newInvestment: number;
  investmentChange: number;

  originalSalary: number;
  newSalary: number;
  salaryChange: number;
  salaryChangePercent: number;
  salaryRetention: number;

  missionProtection: number;
  investmentProtection: number;

  // Compatibility aliases
  oldM: number;
  newM: number;
  deltaM: number;

  oldI: number;
  newI: number;
  deltaI: number;

  mProtection: number;
  iProtection: number;
  protectionM: number;
  protectionI: number;

  pcaAlignment: number;
  score: number;
  priorityScore: number;
};

export type OptimizationResult = {
  recommendations: Recommendation[];
  eigen: EigenResult;

  oldMissionMean: number;
  newMissionMean: number;

  oldInvestmentMean: number;
  newInvestmentMean: number;

  oldTotalSalary: number;
  newTotalSalary: number;

  worstRetention: number;

  // Compatibility aliases
  oldMeanM: number;
  newMeanM: number;
  oldMeanI: number;
  newMeanI: number;

  targetMissionReached: boolean;
  targetInvestmentReached: boolean;
  exactMTargetReached: boolean;
  exactITargetReached: boolean;
};

export type Move = {
  userIndex: number;
  metric: 'mission' | 'investment';
  delta: number;
  cost: number;
};

// ============================================================
// CONSTANTS & DOMAIN
// ============================================================

export const TARGET_MISSION = 98;
export const TARGET_INVESTMENT = 60;
export const TARGET_M = TARGET_MISSION;
export const TARGET_I = TARGET_INVESTMENT;

export const MIN_MISSION = 95;
export const MAX_MISSION = 100;
export const MISSION_STEP = 1;
export const MIN_M = MIN_MISSION;
export const MAX_M = MAX_MISSION;

export const MIN_INVESTMENT = 0;
export const MAX_INVESTMENT = 100;
export const INVESTMENT_STEP = 10;
export const MIN_I = MIN_INVESTMENT;
export const MAX_I = MAX_INVESTMENT;

// ============================================================
// OPTIMIZER WEIGHTS
// ============================================================

export const WORST_SALARY_WEIGHT = 700;
export const INDIVIDUAL_SALARY_WEIGHT = 160;
export const TOTAL_SALARY_WEIGHT = 20;
export const EXCELLENCE_WEIGHT = 20;
export const MOVEMENT_WEIGHT = 25;
export const PCA_WEIGHT = 0.15;

export const MISSION_EXCELLENCE_STRENGTH = 8;
export const INVESTMENT_EXCELLENCE_STRENGTH = 8;

// ============================================================
// BASIC HELPERS
// ============================================================

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function dot(a: [number, number], b: [number, number]): number {
  return a[0] * b[0] + a[1] * b[1];
}

function vectorLength(vector: [number, number]): number {
  return Math.sqrt(vector[0] ** 2 + vector[1] ** 2);
}

function normalizeVector(vector: [number, number]): [number, number] {
  const length = vectorLength(vector);
  if (length < 1e-12) {
    return [0, 0];
  }
  return [vector[0] / length, vector[1] / length];
}

// ============================================================
// DISCRETE VALUE HELPERS
// ============================================================

export function snapMission(value: number): number {
  return clamp(Math.round(value), MIN_MISSION, MAX_MISSION);
}

export function snapInvestment(value: number): number {
  const snapped = Math.round(value / INVESTMENT_STEP) * INVESTMENT_STEP;
  return clamp(snapped, MIN_INVESTMENT, MAX_INVESTMENT);
}

// ============================================================
// SALARY FORMULA
// ============================================================

export function salary(
  mission: number,
  investment: number,
  maxSalary: number,
  baseSalary: number,
  currentSalary?: number
): number {
  const computed =
    (mission / 100) * (baseSalary + (investment * (maxSalary - baseSalary)) / 100);

  if (currentSalary !== undefined && currentSalary > 0) {
    return Math.max(currentSalary, computed);
  }
  return computed;
}

// ============================================================
// NORMALIZATION
// ============================================================

export function normalizeMission(mission: number): number {
  return (mission - MIN_MISSION) / (MAX_MISSION - MIN_MISSION);
}

export function normalizeInvestment(investment: number): number {
  return investment / MAX_INVESTMENT;
}

// ============================================================
// ORIGINAL-VALUE EXCELLENCE PROTECTION
// ============================================================

export function missionProtection(originalMission: number): number {
  const quality = clamp(normalizeMission(originalMission), 0, 1);
  return Math.exp(MISSION_EXCELLENCE_STRENGTH * quality ** 3);
}

export function investmentProtection(originalInvestment: number): number {
  const quality = clamp(normalizeInvestment(originalInvestment), 0, 1);
  return Math.exp(INVESTMENT_EXCELLENCE_STRENGTH * quality ** 4);
}

// ============================================================
// COVARIANCE MATRIX + EIGENDECOMPOSITION
// ============================================================

export function calculateEigenAnalysis(users: OptimizerUser[]): EigenResult {
  if (users.length < 2) {
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

  const normalized = users.map(
    (user) =>
      [
        normalizeMission(user.mission ?? user.m ?? 98),
        normalizeInvestment(user.investment ?? user.i ?? 60),
      ] as [number, number]
  );

  const missionMean = mean(normalized.map((row) => row[0]));
  const investmentMean = mean(normalized.map((row) => row[1]));

  let missionVariance = 0;
  let investmentVariance = 0;
  let covariance = 0;

  for (const [mission, investment] of normalized) {
    const missionDifference = mission - missionMean;
    const investmentDifference = investment - investmentMean;

    missionVariance += missionDifference ** 2;
    investmentVariance += investmentDifference ** 2;
    covariance += missionDifference * investmentDifference;
  }

  const denominator = users.length - 1;
  missionVariance /= denominator;
  investmentVariance /= denominator;
  covariance /= denominator;

  const a = missionVariance;
  const c = covariance;
  const d = investmentVariance;

  const halfTrace = (a + d) / 2;
  const discriminant = Math.sqrt(((a - d) / 2) ** 2 + c ** 2);

  const lambda1 = halfTrace + discriminant;
  const lambda2 = halfTrace - discriminant;

  let eigenvector1: [number, number];

  if (Math.abs(c) > 1e-12) {
    eigenvector1 = normalizeVector([c, lambda1 - a]);
  } else {
    eigenvector1 = a >= d ? [1, 0] : [0, 1];
  }

  const eigenvector2: [number, number] = [-eigenvector1[1], eigenvector1[0]];

  return {
    covariance: [
      [missionVariance, covariance],
      [covariance, investmentVariance],
    ],
    eigenvalues: [Math.max(0, lambda1), Math.max(0, lambda2)],
    eigenvectors: [eigenvector1, eigenvector2],
  };
}

// ============================================================
// PCA STRUCTURAL PENALTY
// ============================================================

function structuralPenalty(user: WorkingUser, eigen: EigenResult): number {
  const movement: [number, number] = [
    (user.mission - user.originalMission) / 5,
    (user.investment - user.originalInvestment) / 100,
  ];

  const [eigenvector1, eigenvector2] = eigen.eigenvectors;
  const [lambda1, lambda2] = eigen.eigenvalues;

  const projection1 = dot(movement, eigenvector1);
  const projection2 = dot(movement, eigenvector2);

  const regularization = 0.05;

  return (
    projection1 ** 2 / (lambda1 + regularization) +
    projection2 ** 2 / (lambda2 + regularization)
  );
}

// ============================================================
// OBJECTIVE FUNCTION
// ============================================================

function objective(users: WorkingUser[], eigen: EigenResult): number {
  if (users.length === 0) {
    return 0;
  }

  let worstSalaryLoss = 0;
  let individualSalaryLossPenalty = 0;
  let salaryUtility = 0;
  let excellencePenalty = 0;
  let movementPenalty = 0;
  let pcaPenalty = 0;

  for (const user of users) {
    const currentSalary = salary(
      user.mission,
      user.investment,
      user.effectiveA,
      user.effectiveB,
      user.currentSalary
    );

    const originalSalary = Math.max(user.originalSalary, 0.000001);
    const retention = currentSalary / originalSalary;

    const salaryLoss = Math.max(0, 1 - retention);
    worstSalaryLoss = Math.max(worstSalaryLoss, salaryLoss);

    individualSalaryLossPenalty += Math.expm1(6 * salaryLoss);

    salaryUtility += Math.log(Math.max(retention, 0.000001));

    const missionDecrease = Math.max(0, user.originalMission - user.mission);
    const investmentDecrease = Math.max(0, user.originalInvestment - user.investment);

    excellencePenalty +=
      missionProtection(user.originalMission) * (missionDecrease / 5) ** 2;

    excellencePenalty +=
      investmentProtection(user.originalInvestment) * (investmentDecrease / 100) ** 2;

    const missionMovement = (user.mission - user.originalMission) / 5;
    const investmentMovement = (user.investment - user.originalInvestment) / 100;

    movementPenalty += missionMovement ** 2 + investmentMovement ** 2;

    pcaPenalty += structuralPenalty(user, eigen);
  }

  const worstSalaryPenalty = Math.expm1(8 * worstSalaryLoss);
  const n = users.length;

  return (
    WORST_SALARY_WEIGHT * worstSalaryPenalty +
    (INDIVIDUAL_SALARY_WEIGHT * individualSalaryLossPenalty) / n -
    (TOTAL_SALARY_WEIGHT * salaryUtility) / n +
    (EXCELLENCE_WEIGHT * excellencePenalty) / n +
    (MOVEMENT_WEIGHT * movementPenalty) / n +
    (PCA_WEIGHT * pcaPenalty) / n
  );
}

// ============================================================
// NEXT BEST LEGAL DISCRETE MOVE
// ============================================================

function findBestNextMove(
  users: WorkingUser[],
  remainingMission: number,
  remainingInvestment: number,
  eigen: EigenResult
): Move | null {
  let bestMove: Move | null = null;

  const missionDelta =
    remainingMission > 0
      ? MISSION_STEP
      : remainingMission < 0
      ? -MISSION_STEP
      : 0;

  const investmentDelta =
    remainingInvestment > 0
      ? INVESTMENT_STEP
      : remainingInvestment < 0
      ? -INVESTMENT_STEP
      : 0;

  const currentObjective = objective(users, eigen);

  for (let index = 0; index < users.length; index++) {
    const user = users[index];

    // Try Mission +/- 1
    if (missionDelta !== 0) {
      const proposed = user.mission + missionDelta;

      if (proposed >= MIN_MISSION && proposed <= MAX_MISSION) {
        user.mission = proposed;
        const candidateObjective = objective(users, eigen);
        user.mission -= missionDelta;

        const cost = candidateObjective - currentObjective;

        if (bestMove === null || cost < bestMove.cost) {
          bestMove = {
            userIndex: index,
            metric: 'mission',
            delta: missionDelta,
            cost,
          };
        }
      }
    }

    // Try Investissement +/- 10
    if (investmentDelta !== 0) {
      const proposed = user.investment + investmentDelta;

      if (proposed >= MIN_INVESTMENT && proposed <= MAX_INVESTMENT) {
        user.investment = proposed;
        const candidateObjective = objective(users, eigen);
        user.investment -= investmentDelta;

        const cost = candidateObjective - currentObjective;

        if (bestMove === null || cost < bestMove.cost) {
          bestMove = {
            userIndex: index,
            metric: 'investment',
            delta: investmentDelta,
            cost,
          };
        }
      }
    }
  }

  return bestMove;
}

// ============================================================
// LOCAL IMPROVEMENT (PAIRWISE REDISTRIBUTION)
// ============================================================

function localImprove(users: WorkingUser[], eigen: EigenResult) {
  if (users.length > 80) {
    return;
  }

  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    let currentScore = objective(users, eigen);

    // Mission transfers: -1 / +1
    for (let from = 0; from < users.length; from++) {
      for (let to = 0; to < users.length; to++) {
        if (from === to) continue;

        if (users[from].mission - MISSION_STEP < MIN_MISSION) continue;
        if (users[to].mission + MISSION_STEP > MAX_MISSION) continue;

        users[from].mission -= MISSION_STEP;
        users[to].mission += MISSION_STEP;

        const candidateScore = objective(users, eigen);

        if (candidateScore < currentScore - 1e-9) {
          currentScore = candidateScore;
          improved = true;
        } else {
          users[from].mission += MISSION_STEP;
          users[to].mission -= MISSION_STEP;
        }
      }
    }

    // Investissement transfers: -10 / +10
    for (let from = 0; from < users.length; from++) {
      for (let to = 0; to < users.length; to++) {
        if (from === to) continue;

        if (users[from].investment - INVESTMENT_STEP < MIN_INVESTMENT) continue;
        if (users[to].investment + INVESTMENT_STEP > MAX_INVESTMENT) continue;

        users[from].investment -= INVESTMENT_STEP;
        users[to].investment += INVESTMENT_STEP;

        const candidateScore = objective(users, eigen);

        if (candidateScore < currentScore - 1e-9) {
          currentScore = candidateScore;
          improved = true;
        } else {
          users[from].investment += INVESTMENT_STEP;
          users[to].investment -= INVESTMENT_STEP;
        }
      }
    }

    if (!improved) {
      break;
    }
  }
}

// ============================================================
// FULL OPTIMIZER
// ============================================================

export function optimize(
  inputUsers: OptimizerUser[],
  defaultA: number = 60000,
  defaultB: number = 45000
): OptimizationResult {
  if (inputUsers.length === 0) {
    return {
      recommendations: [],
      eigen: calculateEigenAnalysis([]),
      oldMissionMean: 0,
      newMissionMean: 0,
      oldInvestmentMean: 0,
      newInvestmentMean: 0,
      oldTotalSalary: 0,
      newTotalSalary: 0,
      worstRetention: 1,
      oldMeanM: 0,
      newMeanM: 0,
      oldMeanI: 0,
      newMeanI: 0,
      targetMissionReached: false,
      targetInvestmentReached: false,
      exactMTargetReached: false,
      exactITargetReached: false,
    };
  }

  const eigen = calculateEigenAnalysis(inputUsers);

  const users: WorkingUser[] = inputUsers.map((user) => {
    const rawM = user.mission ?? user.m ?? 98;
    const rawI = user.investment ?? user.i ?? 60;
    const m = snapMission(rawM);
    const i = snapInvestment(rawI);

    const effectiveA = user.a ?? defaultA;
    const effectiveB = user.b ?? defaultB;

    const originalSalary = salary(
      m,
      i,
      effectiveA,
      effectiveB,
      user.currentSalary
    );

    return {
      ...user,
      mission: m,
      investment: i,
      originalMission: m,
      originalInvestment: i,
      originalSalary,
      effectiveA,
      effectiveB,
    };
  });

  const oldMissionMean = mean(users.map((u) => u.originalMission));
  const oldInvestmentMean = mean(users.map((u) => u.originalInvestment));

  const targetMissionSum = TARGET_MISSION * users.length;
  const targetInvestmentSum = TARGET_INVESTMENT * users.length;

  let remainingMission = targetMissionSum - sum(users.map((u) => u.mission));
  let remainingInvestment = targetInvestmentSum - sum(users.map((u) => u.investment));

  const maximumIterations = users.length * 20 + 1000;
  let iterations = 0;

  while (
    (remainingMission !== 0 || remainingInvestment !== 0) &&
    iterations < maximumIterations
  ) {
    iterations++;

    const bestMove = findBestNextMove(
      users,
      remainingMission,
      remainingInvestment,
      eigen
    );

    if (!bestMove) {
      break;
    }

    const user = users[bestMove.userIndex];

    if (bestMove.metric === 'mission') {
      user.mission += bestMove.delta;
      remainingMission -= bestMove.delta;
    } else {
      user.investment += bestMove.delta;
      remainingInvestment -= bestMove.delta;
    }
  }

  // Pairwise local redistribution
  localImprove(users, eigen);

  const recommendations: Recommendation[] = users.map((user) => {
    const newSalary = salary(
      user.mission,
      user.investment,
      user.effectiveA,
      user.effectiveB,
      user.currentSalary
    );

    const salaryChange = newSalary - user.originalSalary;
    const salaryRetention =
      user.originalSalary > 0 ? newSalary / user.originalSalary : 1;

    const salaryChangePercent =
      user.originalSalary > 0
        ? (salaryChange / user.originalSalary) * 100
        : 0;

    const mProt = missionProtection(user.originalMission);
    const iProt = investmentProtection(user.originalInvestment);

    return {
      id: user.id,
      name: user.name,
      dossierId: user.dossierId,
      matricule: user.matricule,

      originalMission: user.originalMission,
      newMission: user.mission,
      missionChange: user.mission - user.originalMission,

      originalInvestment: user.originalInvestment,
      newInvestment: user.investment,
      investmentChange: user.investment - user.originalInvestment,

      originalSalary: user.originalSalary,
      newSalary,
      salaryChange,
      salaryChangePercent,
      salaryRetention,

      missionProtection: mProt,
      investmentProtection: iProt,

      // Compatibility aliases
      oldM: user.originalMission,
      newM: user.mission,
      deltaM: user.mission - user.originalMission,

      oldI: user.originalInvestment,
      newI: user.investment,
      deltaI: user.investment - user.originalInvestment,

      mProtection: mProt,
      iProtection: iProt,
      protectionM: mProt,
      protectionI: iProt,

      pcaAlignment: 0,
      score: salaryRetention,
      priorityScore: 1 - salaryRetention,
    };
  });

  // Sort lowest salary retention first
  recommendations.sort((a, b) => a.salaryRetention - b.salaryRetention);

  const newMissionMean = mean(users.map((u) => u.mission));
  const newInvestmentMean = mean(users.map((u) => u.investment));

  const oldTotalSalary = sum(users.map((u) => u.originalSalary));
  const newTotalSalary = sum(
    users.map((u) =>
      salary(
        u.mission,
        u.investment,
        u.effectiveA,
        u.effectiveB,
        u.currentSalary
      )
    )
  );

  const worstRetention =
    recommendations.length > 0
      ? Math.min(...recommendations.map((r) => r.salaryRetention))
      : 1;

  const targetMissionReached = Math.abs(newMissionMean - TARGET_MISSION) < 1e-9;
  const targetInvestmentReached = Math.abs(newInvestmentMean - TARGET_INVESTMENT) < 1e-9;

  return {
    recommendations,
    eigen,

    oldMissionMean,
    newMissionMean: parseFloat(newMissionMean.toFixed(2)),

    oldInvestmentMean,
    newInvestmentMean: parseFloat(newInvestmentMean.toFixed(2)),

    oldTotalSalary,
    newTotalSalary,
    worstRetention,

    // Compatibility aliases
    oldMeanM: oldMissionMean,
    newMeanM: newMissionMean,
    oldMeanI: oldInvestmentMean,
    newMeanI: newInvestmentMean,

    targetMissionReached,
    targetInvestmentReached,
    exactMTargetReached: targetMissionReached,
    exactITargetReached: targetInvestmentReached,
  };
}
