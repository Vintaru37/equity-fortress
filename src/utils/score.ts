import type { Moat, StockData } from "@/types/stock";

export function calculateScore(data: StockData): number | null {
  const factors: Array<{
    weight: number;
    points: number | null;
    missingCredit?: boolean;
  }> = [
    {
      weight: 20,
      points: scoreThreshold(data.roce, [
        [40, 20],
        [30, 18],
        [20, 16],
        [15, 13],
        [10, 9],
        [0, 5],
      ]),
    },
    {
      weight: 7.5,
      points: scoreThreshold(data.grossMargin, [
        [70, 7.5],
        [60, 6],
        [45, 3.75],
        [0, 1.5],
      ]),
    },
    {
      weight: 7.5,
      points: scoreThreshold(data.operatingMargin, [
        [35, 7.5],
        [25, 6],
        [15, 3.75],
        [0, 2.25],
      ]),
    },
    {
      weight: 10,
      points: scoreThreshold(data.epsGrowth, [
        [20, 10],
        [15, 8],
        [10, 6],
        [5, 4],
        [0, 2],
      ]),
    },
    {
      weight: 10,
      points: scoreThreshold(data.fcfMargin, [
        [25, 10],
        [20, 8],
        [10, 5],
        [0, 3],
      ]),
    },
    {
      weight: 5,
      points: scoreThreshold(data.revenueGrowth, [
        [15, 5],
        [10, 4],
        [5, 3],
        [0, 1],
      ]),
    },
    { weight: 15, points: moatScore(data.moat), missingCredit: false },
    { weight: 10, points: valuationScore(data.peg, data.pe) },
    { weight: 10, points: debtScore(data.netDebtToEbitda, data.debtToEquity) },
    { weight: 5, points: analystScore(data.analystConsensus) },
  ];

  if (factors.every((factor) => factor.points === null)) {
    return null;
  }

  const rawScore = factors.reduce((sum, factor) => {
    const fallback = factor.missingCredit === false ? 0 : factor.weight * 0.3;
    return sum + (factor.points ?? fallback);
  }, 0);
  const score = rawScore - (data.scorePenalty ?? 0);

  return Math.max(0, Math.min(100, Math.round(score)));
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

function valuationScore(peg: number | null, pe: number | null): number | null {
  if (peg != null) {
    if (peg < 1) return 10;
    if (peg < 1.5) return 8;
    if (peg < 2) return 5;
    if (peg < 3) return 2;
    return 0;
  }

  if (pe != null) {
    if (pe <= 20) return 7;
    if (pe <= 30) return 5;
    if (pe <= 40) return 3;
    return 1;
  }

  return null;
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

function analystScore(consensus: string | null): number | null {
  if (!consensus) {
    return null;
  }

  const normalized = consensus.toLowerCase();
  if (normalized.includes("strong buy")) return 5;
  if (normalized.includes("buy") && !normalized.includes("sell")) return 4;
  if (normalized.includes("hold") || normalized.includes("neutral")) return 2.5;
  if (normalized.includes("strong sell")) return 0;
  if (normalized.includes("sell")) return 1;
  return null;
}

function moatScore(moat: Moat): number {
  switch (moat) {
    case "Excellent":
      return 15;
    case "Very Good":
      return 12;
    case "Good":
      return 9;
    case "Average":
      return 6;
    case "Bad":
      return 3;
    case "Very Bad":
      return 0;
    case "Unknown":
      return 3;
  }
}
