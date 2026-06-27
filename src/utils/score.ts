import {
  MANUAL_SCORE_LIMITS,
  type ManualScoreKey,
  type Moat,
  type StockData,
} from "@/types/stock";

export function calculateScore(data: StockData): number | null {
  if (!hasScoreEvidence(data)) {
    return null;
  }

  const score =
    (roceScore(data.roce) ?? 0) +
    (grossMarginScore(data.grossMargin) ?? 0) +
    (growthAndFcfScore(data.revenueGrowth, data.fcfMargin) ?? 0) +
    (debtAndDependenceScore(
      data.netDebtToEbitda,
      data.debtToEquity,
      data.customerDependenceScore,
    ) ?? 0) +
    moatScore(data.moat) +
    (forwardPeValuationScore(data.pe, data.forwardPe) ?? 0) +
    manualScore("smartMoneyScore", data.smartMoneyScore) +
    manualScore("backlogScore", data.backlogScore) +
    manualScore("buybacksScore", data.buybacksScore);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function hasScoreEvidence(data: StockData): boolean {
  return (
    [
      data.roce,
      data.grossMargin,
      data.revenueGrowth,
      data.fcfMargin,
      data.netDebtToEbitda,
      data.debtToEquity,
      data.pe,
      data.forwardPe,
      data.customerDependenceScore,
      data.smartMoneyScore,
      data.backlogScore,
      data.buybacksScore,
    ].some((value) => value !== null && value !== undefined) ||
    data.moat !== "Unknown"
  );
}

function roceScore(value: number | null): number | null {
  return scoreThreshold(value, [
    [30, 20],
    [25, 18],
    [20, 16],
    [15, 13],
    [10, 8],
    [0, 4],
  ]);
}

function grossMarginScore(value: number | null): number | null {
  return scoreThreshold(value, [
    [60, 10],
    [50, 8],
    [40, 6],
    [30, 4],
    [20, 2],
    [0, 1],
  ]);
}

function growthAndFcfScore(
  revenueGrowth: number | null,
  fcfMargin: number | null,
): number | null {
  const growth = scoreThreshold(revenueGrowth, [
    [20, 5],
    [15, 4],
    [10, 3],
    [5, 2],
    [0, 1],
  ]);
  const fcf = scoreThreshold(fcfMargin, [
    [20, 5],
    [15, 4],
    [10, 3],
    [5, 2],
    [0, 1],
  ]);

  return growth === null && fcf === null ? null : (growth ?? 0) + (fcf ?? 0);
}

function scoreThreshold(
  value: number | null,
  thresholds: Array<[minimum: number, points: number]>,
): number | null {
  if (value == null) {
    return null;
  }

  for (const [minimum, points] of thresholds) {
    if (value >= minimum) {
      return points;
    }
  }

  return 0;
}

function debtAndDependenceScore(
  netDebtToEbitda: number | null,
  debtToEquity: number | null,
  customerDependenceScore: number | null,
): number | null {
  const debt = debtScore(netDebtToEbitda, debtToEquity);
  const dependence = manualScoreOrNull(
    "customerDependenceScore",
    customerDependenceScore,
  );

  return debt === null && dependence === null
    ? null
    : (debt ?? 0) + (dependence ?? 0);
}

function debtScore(
  netDebtToEbitda: number | null,
  debtToEquity: number | null,
): number | null {
  if (netDebtToEbitda != null) {
    if (netDebtToEbitda < 0) return 10;
    if (netDebtToEbitda <= 1) return 9;
    if (netDebtToEbitda <= 2) return 7;
    if (netDebtToEbitda <= 3) return 5;
    if (netDebtToEbitda <= 4) return 2;
    return 0;
  }

  if (debtToEquity == null) {
    return null;
  }

  if (debtToEquity < 0.3) return 10;
  if (debtToEquity < 0.5) return 8;
  if (debtToEquity < 1) return 6;
  if (debtToEquity < 1.5) return 3;
  return 0;
}

function forwardPeValuationScore(
  pe: number | null,
  forwardPe: number | null,
): number | null {
  if (pe == null || forwardPe == null || pe <= 0 || forwardPe <= 0) {
    return null;
  }

  const ratio = forwardPe / pe;
  if (ratio <= 0.5) return 5;
  if (ratio <= 0.65) return 4;
  if (ratio <= 0.8) return 3;
  if (ratio <= 0.9) return 2;
  if (ratio < 1) return 1;
  return 0;
}

function manualScore(key: ManualScoreKey, value: number | null): number {
  return manualScoreOrNull(key, value) ?? 0;
}

function manualScoreOrNull(
  key: ManualScoreKey,
  value: number | null,
): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(MANUAL_SCORE_LIMITS[key], Math.round(value)));
}

function moatScore(moat: Moat): number {
  switch (moat) {
    case "Excellent":
      return 10;
    case "Very Good":
      return 8;
    case "Good":
      return 6;
    case "Average":
      return 4;
    case "Bad":
      return 2;
    case "Very Bad":
    case "Unknown":
      return 0;
  }
}
