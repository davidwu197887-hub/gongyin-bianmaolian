import {
  Config,
  Plan,
  Scenario,
  simulate,
  planningConfig,
  deterministic,
  Result,
} from "./engine";
import { scenarioInputs } from "./scenarios";
export type Regime = keyof typeof scenarioInputs;
const cache = new Map<string, any>();
function bytes(x: string) {
  return Uint8Array.from(atob(x), (c) => c.charCodeAt(0));
}
export function sampleAt(regime: Regime, i: number, variation = 0): Scenario {
  let v = cache.get(regime);
  const pack = scenarioInputs[regime];
  if (!v) {
    v = {};
    for (const k of [
      "border",
      "downstream",
      "individual_border",
      "individual_down",
    ] as const)
      v[k] = bytes(pack[k]);
    cache.set(regime, v);
  }
  const q = [32, 44, 36, 48, 40];
  if (variation) {
    let seed = (20261108 + i * 7919) >>> 0;
    for (let j = 0; j < 5; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      q[j] *= 1 + ((seed / 4294967296) * 2 - 1) * variation;
    }
    const total = q.reduce((a, b) => a + b);
    for (let j = 0; j < 5; j++) q[j] *= 200 / total;
  }
  return {
    q,
    border: Array.from(v.border.slice(i * 21, (i + 1) * 21)),
    downstream: Array.from(v.downstream.slice(i * 21, (i + 1) * 21)),
    individual_border: Array.from(
      v.individual_border.slice(i * 5, (i + 1) * 5),
    ),
    individual_down: Array.from(v.individual_down.slice(i * 5, (i + 1) * 5)),
    freeze_downstream: Array(5).fill(false),
  };
}
export const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const a = xs.slice().sort((x, y) => x - y);
  return a[Math.max(0, Math.ceil(q * a.length) - 1)];
};
export interface StudyRequest {
  plan: Plan;
  draft: Plan | null;
  config: Config;
  regime: Regime;
  paths: number;
  mode: "plan" | "execute";
  observedDay: number | null;
  variation: number;
}
export function study(
  req: StudyRequest,
  progress?: (n: number, total: number) => void,
) {
  const pack = scenarioInputs[req.regime],
    n = Math.min(req.paths, pack.n),
    config = req.mode === "plan" ? planningConfig(req.config) : req.config;
  const ref =
    req.observedDay === null
      ? null
      : simulate(req.plan, req.config, deterministic(), {
          snapshotDay: req.observedDay,
          collectPrefix: true,
        })!;
  const original: Result[] = [],
    changed: Result[] = [];
  let maximumError = 0;
  const compact = (r: Result) =>
    Object.fromEntries(
      [
        "peak_A",
        "peak_B",
        "peak_joint",
        "settlement_day_A",
        "settlement_day_B",
        "complete",
      ].map((k) => [k, r[k]]),
    ) as Result;
  for (let i = 0; i < n; i++) {
    const s = sampleAt(req.regime, i, req.variation);
    const r = simulate(req.plan, config, s, {
      snapshotDay: req.observedDay ?? 20,
      referencePrefix: ref?.prefix,
    });
    if (r) {
      original.push(compact(r));
      maximumError = Math.max(maximumError, r.conservation_max_abs_error);
      if (req.draft) {
        const d = simulate(req.draft, config, s, {
          snapshotDay: req.observedDay ?? 20,
          referencePrefix: ref?.prefix,
        });
        if (!d) throw Error("草案改变了已观察历史，请重新选择变更批次");
        changed.push(compact(d));
        maximumError = Math.max(maximumError, d.conservation_max_abs_error);
      }
    }
    if (i % 250 === 0) progress?.(i, n);
  }
  const stats = (rs: Result[]) => {
    const field = (k: string) => rs.map((r) => r[k] as number),
      p = (k: string, q: number) => quantile(field(k), q);
    return {
      n: rs.length,
      A50: p("peak_A", 0.5),
      A90: p("peak_A", 0.9),
      A95: p("peak_A", 0.95),
      B50: p("peak_B", 0.5),
      B90: p("peak_B", 0.9),
      B95: p("peak_B", 0.95),
      joint90: p("peak_joint", 0.9),
      clearA90: p("settlement_day_A", 0.9),
      clearB90: p("settlement_day_B", 0.9),
      coverage: rs.length
        ? (rs.filter(
            (r) =>
              r.peak_A <= (req.config.limit_A ?? Infinity) &&
              r.peak_B <= (req.config.limit_B ?? Infinity) &&
              r.settlement_day_A <= 90 &&
              r.settlement_day_B <= 90,
          ).length /
            rs.length) *
          100
        : null,
      completed: rs.length
        ? (rs.filter((r) => r.complete).length / rs.length) * 100
        : null,
      Avalues: field("peak_A"),
      Bvalues: field("peak_B"),
    };
  };
  return {
    inputs: req,
    paths: n,
    retained: original.length,
    seed: pack.seed,
    original: stats(original),
    changed: changed.length ? stats(changed) : null,
    maximumError,
    generatedAt: new Date().toISOString(),
  };
}
