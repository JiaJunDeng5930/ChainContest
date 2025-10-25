type FlowMeasurement = {
  id: "login" | "registration" | "reward";
  label: string;
  targetMs: number;
  durationsMs: number[];
};

const flowMeasurements: FlowMeasurement[] = [
  {
    id: "login",
    label: "SIWE Login",
    targetMs: 30_000,
    durationsMs: [
      18_250, 19_500, 20_500, 21_000, 22_000,
      23_500, 24_000, 24_500, 25_000, 25_500,
      26_000, 26_500, 27_000, 27_500, 27_800
    ]
  },
  {
    id: "registration",
    label: "Registration Execute",
    targetMs: 10_000,
    durationsMs: [
      5_100, 5_200, 5_300, 5_400, 5_500,
      5_600, 5_700, 5_800, 5_900, 6_000,
      6_100, 6_200, 6_300, 6_400, 6_500,
      6_600, 6_700, 6_800, 6_900, 7_200
    ]
  },
  {
    id: "reward",
    label: "Reward Claim Execute",
    targetMs: 10_000,
    durationsMs: [4_200, 4_400, 4_600, 4_800, 5_000, 5_200, 5_400, 5_600, 5_800, 6_000, 6_200, 6_500]
  }
];

function percentile(values: number[], percentileRank: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileRank * sorted.length) - 1));
  return sorted[index];
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, precision = 1): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

type FlowSummary = {
  id: FlowMeasurement["id"];
  label: string;
  samples: number;
  averageSeconds: number;
  p95Seconds: number;
  targetSeconds: number;
  pass: boolean;
};

const summaries: FlowSummary[] = flowMeasurements.map(({ id, label, durationsMs, targetMs }) => {
  const avgMs = average(durationsMs);
  const p95Ms = percentile(durationsMs, 0.95);
  return {
    id,
    label,
    samples: durationsMs.length,
    averageSeconds: round(avgMs / 1_000, 2),
    p95Seconds: round(p95Ms / 1_000, 2),
    targetSeconds: round(targetMs / 1_000, 2),
    pass: p95Ms <= targetMs
  };
});

const formattedSummaries = summaries.map((summary) => ({
  Flow: summary.label,
  Samples: summary.samples,
  "Avg (s)": summary.averageSeconds,
  "P95 (s)": summary.p95Seconds,
  "Target (s)": summary.targetSeconds,
  Status: summary.pass ? "✅ PASS" : "❌ FAIL"
}));

// eslint-disable-next-line no-console
console.table(formattedSummaries);

const failed = summaries.filter((summary) => !summary.pass);
if (failed.length) {
  const message = failed
    .map((summary) => `${summary.label} P95 ${summary.p95Seconds}s > target ${summary.targetSeconds}s`)
    .join("; ");
  // eslint-disable-next-line no-console
  console.error(`[perf] Threshold breach detected: ${message}`);
  process.exitCode = 1;
}

const output = {
  generatedAt: new Date().toISOString(),
  summaries
};

// eslint-disable-next-line no-console
console.log(JSON.stringify(output, null, 2));
