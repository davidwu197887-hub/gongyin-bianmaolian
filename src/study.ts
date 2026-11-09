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
// ---- 3.0 融资安排对照：同一组情景（可按第20日历史匹配）比较多种安排 ----
export interface FinancingArrangement {
  key: string;
  label: string;
  plan: Plan;
  config: Config;
  extra: { kind: "none" | "general" | "tranche"; amount: number; from: number; to: number };
}
export interface FinancingRequest {
  kind: "financing";
  base: Plan;
  baseConfig: Config;
  arrangements: FinancingArrangement[];
  target: number;
  regime: Regime;
  paths: number;
  observedDay: number | null;
}
const extraDays = (a: FinancingArrangement["extra"], r: Result) =>
  a.kind === "none"
    ? 0
    : a.kind === "general"
      ? (a.amount / 10000) * (a.to - a.from)
      : (a.amount / 10000) *
        ((r.tranche_first_draw_day < 0
          ? a.to + 1
          : Number.isFinite(r.tranche_clear_day)
            ? r.tranche_clear_day
            : 181) -
          a.from);
export function financingStudy(
  req: FinancingRequest,
  progress?: (n: number, total: number) => void,
) {
  const pack = scenarioInputs[req.regime],
    n = Math.min(req.paths, pack.n),
    snapshotDay = req.observedDay ?? 20;
  const ref =
    req.observedDay === null
      ? null
      : simulate(req.base, req.baseConfig, deterministic(), {
          snapshotDay,
          collectPrefix: true,
        })!;
  const acc = req.arrangements.map(() => [] as any[]);
  let retained = 0,
    maximumError = 0;
  for (let i = 0; i < n; i++) {
    const s = sampleAt(req.regime, i);
    const opt = { snapshotDay, referencePrefix: ref?.prefix };
    if (ref && !simulate(req.base, req.baseConfig, s, opt)) continue;
    retained++;
    req.arrangements.forEach((a, k) => {
      const r = simulate(a.plan, a.config, s, opt);
      if (!r) throw Error(a.label + "改变了已观察历史");
      maximumError = Math.max(maximumError, r.conservation_max_abs_error);
      const o5 = r.order_days[req.target];
      acc[k].push({
        onPlan: r.pending_purchase_days === 0,
        purchase: o5 < 0 ? Infinity : o5,
        grace: r.late_finished_tonnes > 0,
        peakA: r.peak_A,
        generalA: r.general_peak_A,
        peakB: r.peak_B,
        intA: r.interest_A,
        intB: r.interest_B,
        clearA: r.settlement_day_A,
        drawn: r.tranche_draws > 1e-7,
        blocked: r.tranche_blocked_days > 0,
        overdue: r.tranche_overdue_days > 0,
        extra: extraDays(a.extra, r),
      });
    });
    if (i % 250 === 0) progress?.(i, n);
  }
  const pct = (xs: any[], k: string) =>
    xs.length ? (xs.filter((x) => x[k]).length / xs.length) * 100 : null;
  const mean = (xs: any[], k: string) =>
    xs.length ? xs.reduce((a, x) => a + x[k], 0) / xs.length : null;
  const q90 = (xs: any[], k: string) => quantile(xs.map((x) => x[k]), 0.9);
  return {
    kind: "financing",
    inputs: { regime: req.regime, paths: n, observedDay: req.observedDay },
    paths: n,
    retained,
    seed: pack.seed,
    maximumError,
    rows: req.arrangements.map((a, k) => {
      const xs = acc[k];
      return {
        key: a.key,
        label: a.label,
        on_plan_pct: pct(xs, "onPlan"),
        purchase_p90: q90(xs, "purchase"),
        late_beyond_grace_pct: pct(xs, "grace"),
        peak_A_p90: q90(xs, "peakA"),
        general_peak_A_p90: q90(xs, "generalA"),
        peak_B_p90: q90(xs, "peakB"),
        interest_A_mean: mean(xs, "intA"),
        interest_B_mean: mean(xs, "intB"),
        clear_A_p90: q90(xs, "clearA"),
        tranche_drawn_pct: a.extra.kind === "tranche" ? pct(xs, "drawn") : null,
        tranche_blocked_pct: a.extra.kind === "tranche" ? pct(xs, "blocked") : null,
        tranche_overdue_pct: a.extra.kind === "tranche" ? pct(xs, "overdue") : null,
        extra_limit_wan_days_mean: mean(xs, "extra"),
      };
    }),
    generatedAt: new Date().toISOString(),
  };
}
