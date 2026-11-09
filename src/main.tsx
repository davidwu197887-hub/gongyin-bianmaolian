import React, { useState, useMemo, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  defaultConfig,
  Config,
  Plan,
  plans,
  planOf,
  simulate,
  planningConfig,
  deterministic,
  QUANTITIES,
  PURCHASE_DAYS,
  Result,
} from "./engine";
import * as wf from "./workflow";
import { WORKER_CODE } from "./workerCode";
import "./styles.css";

const NAV = [
  "联合测算",
  "方案对比",
  "共同规则",
  "履约台账",
  "变化重算",
  "金融转译与核查",
  "成员明白账",
  "版本与留痕",
];
const ROLES = {
  COOP: "合作组织甲",
  FACTORY: "加工企业乙",
  BANK: "客户经理",
  MEMBER: "边民成员",
};
const STATUS = {
  PENDING_BANK_REVIEW: "等待银行核查",
  NEEDS_MATERIAL: "待补充材料",
  APPROVED: "已批准（模拟）",
  NOT_APPROVED: "未获批准（模拟）",
  REVIEW_COMPLETED: "核查完成",
  EXECUTED: "办理回执已回填",
};
const money = (n: any, digits = 2) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "待确认"
    : (n / 10000).toFixed(digits);
const date = (n: any) =>
  Number.isFinite(n) && n >= 0 && n < 10000
    ? "第" + n + "日"
    : "观察期内未完成";
const num = (n: any, d = 2) =>
  n === null || !Number.isFinite(n) ? "—" : Number(n).toFixed(d);
const clone = <T,>(x: T): T => structuredClone(x);
// 3.0 本地存储（schema 3，增加批次专项与应付确认）；不读取 2.0 的 bianmao.v2 记录。
const STORE = "bianmao.v3";
const PREVIEW = simulate(plans[0], defaultConfig, deterministic(), {
  trace: true,
})!;
function download(name: string, value: any, type = "application/json") {
  const url = URL.createObjectURL(
    new Blob(
      [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
      { type },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function seeded(
  config = defaultConfig,
  plan = plans[0],
  freeze = false,
  withDraft = false,
) {
  let s = wf.emptyState();
  s = wf.createRule(s, plan, config, freeze);
  s = wf.confirmRule(s, "initial");
  s = { ...s, role: "FACTORY" };
  s = wf.confirmRule(s, "initial");
  s = wf.activate(s, "initial");
  s = { ...s, role: "COOP" };
  s = wf.loadHistory(s, 20);
  if (withDraft) {
    s = { ...s, role: "FACTORY" };
    s = wf.propose(s, 15, [2, 3, 4]);
    s = { ...s, role: "COOP" };
  }
  return s;
}
function initial() {
  const query = new URLSearchParams(location.search),
    scene = query.get("scene");
  // 3.0：下游持续拖欠压力下的专项演示（第20日草案已提出）。
  if (scene === "financing-stress")
    return seeded(defaultConfig, plans[0], true, true);
  if (["recalculate", "translate", "risk", "financing"].includes(scene ?? ""))
    return seeded(defaultConfig, plans[0], false, scene !== "risk");
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.schema === 3 && data.state?.audit && data.state?.facilityChanges)
        return { tranche: null, confirmations: [], ...data.state };
    }
  } catch {}
  return wf.emptyState();
}
function Tag({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"tag " + tone}>{children}</span>;
}
function Metric({
  label,
  value,
  unit = "万元",
  hint,
  tone = "",
}: {
  label: string;
  value: any;
  unit?: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className={"metric " + tone}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      {hint && <div className="muted">{hint}</div>}
    </div>
  );
}
function Panel({
  title,
  children,
  subtitle,
  action,
}: {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((x, i) => (
              <th key={i}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((x, j) => (
                <td key={j}>{x}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Chart({
  r,
  limitA,
  limitB,
}: {
  r: Result;
  limitA: number | null;
  limitB: number | null;
}) {
  const points = r.days.filter((_: any, i: number) => i % 2 === 0),
    w = 1040,
    h = 260,
    left = 58,
    top = 20,
    max = Math.max(
      1,
      ...points.map((d: any) => Math.max(d.A_debt, d.B_debt)),
      limitA ?? 0,
      limitB ?? 0,
    ),
    x = (d: number) => left + (d / 180) * (w - left - 25),
    y = (v: number) => h - 34 - (v / max) * (h - 65);
  const path = (k: string) =>
    points
      .map(
        (d: any, i: number) =>
          (i ? "L" : "M") + x(d.day).toFixed(1) + "," + y(d[k]).toFixed(1),
      )
      .join(" ");
  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="甲乙借款余额与额度的时间曲线"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((a) => (
          <g key={a}>
            <line
              x1={left}
              x2={w - 25}
              y1={y(a * max)}
              y2={y(a * max)}
              stroke="#e8edf2"
            />
            <text x={left - 8} y={y(a * max) + 4} textAnchor="end">
              {money(a * max)}
            </text>
          </g>
        ))}
        {[0, 20, 40, 60, 90, 120, 150, 180].map((d) => (
          <text key={d} x={x(d)} y={h - 10} textAnchor="middle">
            {d}日
          </text>
        ))}
        {limitA !== null && (
          <line
            x1={left}
            x2={w - 25}
            y1={y(limitA)}
            y2={y(limitA)}
            stroke="#bf2e3c"
            strokeDasharray="5 5"
          />
        )}
        <path
          d={path("A_debt")}
          stroke="#ba1a2c"
          fill="none"
          strokeWidth="2.5"
        />
        <path
          d={path("B_debt")}
          stroke="#2e648f"
          fill="none"
          strokeWidth="2.5"
        />
      </svg>
      <div className="legend">
        <span className="red-dot">甲借款余额</span>
        <span className="blue-dot">乙借款余额</span>
        <span>虚线：甲额度；金额单位：万元</span>
      </div>
    </div>
  );
}

function App() {
  const scene = new URLSearchParams(location.search).get("scene");
  const [s, setS] = useState<wf.State>(initial),
    [page, setPage] = useState(
      s.role === "MEMBER"
        ? 6
        : scene === "compare"
          ? 1
          : scene === "recalculate"
            ? 4
            : scene === "translate" || scene?.startsWith("financing")
              ? 5
              : scene === "risk"
                ? 1
                : 0,
    );
  const [config, setConfig] = useState<Config>(clone(defaultConfig)),
    [selected, setSelected] = useState(0),
    [candidate, setCandidate] = useState<Plan>(clone(plans[0])),
    [freeze, setFreeze] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [term, setTerm] = useState(15),
    [batchMask, setBatchMask] = useState([2, 3, 4]),
    [subject, setSubject] = useState<"A" | "B">("A"),
    [kind, setKind] = useState<wf.BankCase["kind"]>("FINANCING"),
    [memberBatch, setMemberBatch] = useState(0),
    [question, setQuestion] = useState(""),
    [reply, setReply] = useState(""),
    [feedback, setFeedback] = useState(""),
    [materials, setMaterials] = useState(""),
    [approvedLimit, setApprovedLimit] = useState(31),
    [structure, setStructure] = useState<wf.Structure>(
      scene?.startsWith("financing") ? "TRANCHE" : "GENERAL",
    ),
    [terms, setTerms] = useState<wf.TrancheTerms | null>(null),
    [finRisk, setFinRisk] = useState<any>(null),
    [finProgress, setFinProgress] = useState<{ done: number; total: number } | null>(null),
    [caseFocus, setCaseFocus] = useState<string | null>(null);
  const [regime, setRegime] = useState<"base" | "mild" | "severe">("base"),
    [paths, setPaths] = useState(12000),
    [riskMode, setRiskMode] = useState<"plan" | "execute">("plan"),
    [rolling, setRolling] = useState(false),
    [variation, setVariation] = useState(false),
    [risk, setRisk] = useState<any>(null),
    [progress, setProgress] = useState<{ done: number; total: number } | null>(
      null,
    );
  const worker = useRef<Worker | null>(null),
    job = useRef(0);
  const candidatePlan = { ...candidate, price: candidate.price },
    planning = useMemo(
      () =>
        simulate(candidatePlan, planningConfig(config), deterministic(freeze), {
          trace: true,
        })!,
      [candidate, config, freeze],
    );
  const projection = useMemo(
    () =>
      s.effective
        ? wf.execution(s)
        : simulate(candidatePlan, config, deterministic(freeze), {
            trace: true,
          })!,
    [s.effective, s.facilityChanges, s.tranche, candidate, config, freeze],
  );
  const current = projection.days[s.day] ?? projection.days[0],
    schedule = useMemo(
      () =>
        s.effective
          ? wf.evidenceSchedule(s.effective, s.facilityChanges, s.tranche)
          : [],
      [s.effective, s.facilityChanges, s.tranche],
    );
  const actuals = s.evidence.filter(
      (x) => x.status === "已核验" && x.day <= s.day,
    ),
    hasClose = actuals.some((x) => x.id === "close-" + s.day);
  const need = useMemo(
    () => (s.effective ? wf.translateNeed(s, subject, kind) : null),
    [s, subject, kind],
  );
  // 3.0 融资支持方案（模拟）：方案说明、安排对照、复核提示均由同一引擎计算。
  const fplan = useMemo(
    () => (s.effective && subject === "A" ? wf.financingPlan(s) : null),
    [s, subject],
  );
  const arrangementRows = useMemo(() => {
    if (!fplan) return [];
    return wf.arrangements(s, fplan).map((a) => {
      const r = simulate(a.plan, a.config, deterministic(s.effective!.freeze))!;
      return { a, r, extra: wf.extraLimitDays(a.extra, r) };
    });
  }, [s.effective, s.draft, s.facilityChanges, s.day, fplan]);
  const signals = useMemo(() => wf.reviewSignals(s), [s]);
  useEffect(() => {
    if (fplan?.applicable)
      setTerms((t) =>
        t ?? {
          limit: fplan.upper,
          closeDay: fplan.closeDay,
          maturityDay: fplan.maturityDay,
        },
      );
    else setTerms(null);
  }, [fplan?.applicable, fplan?.ruleHash]);
  function runFinancing() {
    try {
      if (!fplan?.applicable || !s.effective) throw Error("当前没有可对照的专项方案");
      if (s.effective.freeze)
        throw Error("持续拖欠使用单独的确定性压力情景，请在基准业务下运行情景对照");
      const rolling = actuals.some((x) => x.id === "close-20");
      const request = {
        kind: "financing",
        base: s.effective.plan,
        baseConfig: { ...s.effective.config, facility_changes: [], tranche: null },
        arrangements: wf.arrangements(s, fplan),
        target: fplan.targetBatch,
        regime: "base",
        paths: 12000,
        observedDay: rolling ? 20 : null,
      };
      worker.current?.terminate();
      const url = URL.createObjectURL(
        new Blob([WORKER_CODE], { type: "text/javascript" }),
      );
      worker.current = new Worker(url);
      URL.revokeObjectURL(url);
      const id = ++job.current;
      setFinProgress({ done: 0, total: 12000 });
      setError("");
      worker.current.onmessage = (e) => {
        if (e.data.id !== job.current) return;
        if (e.data.progress) setFinProgress(e.data.progress);
        if (e.data.error) {
          setError(e.data.error);
          setFinProgress(null);
        }
        if (e.data.result) {
          setFinRisk({ ...e.data.result, ruleHash: fplan.ruleHash });
          setFinProgress(null);
        }
      };
      worker.current.onerror = (e) => {
        setError(e.message || "情景计算未完成，请重试");
        setFinProgress(null);
      };
      worker.current.postMessage({ id, request });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const m = wf.memberView(s, memberBatch),
    focused =
      s.cases.find((x) => x.id === caseFocus) ?? s.cases[s.cases.length - 1];
  useEffect(() => {
    setFeedback(focused?.feedback ?? "");
    setMaterials(focused?.materials ?? "");
  }, [focused?.id]);
  const draftResults = useMemo(
    () =>
      s.effective && s.draft
        ? {
            before: simulate(
              s.effective.plan,
              planningConfig(s.effective.config),
              deterministic(s.effective.freeze),
              { trace: true },
            )!,
            after: simulate(
              s.draft.plan,
              planningConfig(s.effective.config),
              deterministic(s.effective.freeze),
              { trace: true },
            )!,
            beforeExec: wf.execution(s),
            afterExec: simulate(
              s.draft.plan,
              wf.execConfig(s, s.draft),
              deterministic(s.effective.freeze),
              { trace: true },
            )!,
          }
        : null,
    [s.effective, s.draft, s.facilityChanges, s.tranche],
  );
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ schema: 3, state: s }));
    } catch {}
  }, [s]);
  useEffect(
    () => () => {
      worker.current?.terminate();
    },
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  function action(fn: () => wf.State, message = "已更新业务记录") {
    try {
      const next = fn();
      setS(next);
      setError("");
      setToast(message);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function role(role: wf.Role) {
    setS((x) => ({ ...x, role }));
    if (role === "MEMBER") setPage(6);
    else if (page === 6 && role === "BANK") setPage(5);
  }
  function inputConfig(key: keyof Config, value: number) {
    try {
      const next = { ...config, [key]: value };
      simulate(candidatePlan, next);
      setConfig(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function inputPlan(key: keyof Plan, value: any) {
    try {
      const next = { ...candidate, [key]: value };
      simulate(next, config);
      setCandidate(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function pick(i: number) {
    setSelected(i);
    setCandidate(clone(plans[i]));
  }
  function loadCase(withDraft = false, stress = false) {
    try {
      setS(seeded(config, candidatePlan, stress, withDraft));
      setPage(withDraft ? 4 : 3);
      setError("");
      setToast("已载入明确标识的模拟合同、确认及履约记录");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function reset() {
    worker.current?.terminate();
    worker.current = null;
    job.current++;
    setProgress(null);
    setRisk(null);
    setFinRisk(null);
    setFinProgress(null);
    setTerms(null);
    setS(wf.emptyState());
    setConfig(clone(defaultConfig));
    setCandidate(clone(plans[0]));
    setSelected(0);
    setFreeze(false);
    setPage(0);
    setError("");
    setToast("演示数据已重置");
    try {
      localStorage.removeItem(STORE);
    } catch {}
  }
  function runRisk() {
    try {
      if (rolling && !actuals.some((x) => x.id === "close-20"))
        throw Error("请先在履约台账载入并核验第20日历史");
      const rconfig = rolling ? s.effective!.config : config,
        rplan = rolling ? s.effective!.plan : candidatePlan;
      if ((rolling && s.effective?.freeze) || freeze)
        throw Error(
          "持续拖欠使用单独的确定性压力情景，请在基准业务下运行随机情景分析",
        );
      const request = {
        plan: rplan,
        draft: s.draft?.plan ?? null,
        config: rconfig,
        regime,
        paths,
        mode: riskMode,
        observedDay: rolling ? 20 : null,
        variation: variation ? 0.01 : 0,
      };
      worker.current?.terminate();
      const url = URL.createObjectURL(
        new Blob([WORKER_CODE], { type: "text/javascript" }),
      );
      worker.current = new Worker(url);
      URL.revokeObjectURL(url);
      const id = ++job.current;
      setProgress({ done: 0, total: paths });
      setError("");
      worker.current.onmessage = (e) => {
        if (e.data.id !== job.current) return;
        if (e.data.progress) setProgress(e.data.progress);
        if (e.data.error) {
          setError(e.data.error);
          setProgress(null);
        }
        if (e.data.result) {
          setRisk(e.data.result);
          setProgress(null);
        }
      };
      worker.current.onerror = (e) => {
        setError(e.message || "情景计算未完成，请重试");
        setProgress(null);
      };
      worker.current.postMessage({ id, request });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const yearRate = (key: "annual_rate_A" | "annual_rate_B", label: string) => (
    <label>
      {label}
      <div className="number-unit">
        <input
          type="number"
          min="0"
          max="30"
          step="0.1"
          value={config[key] * 100}
          onChange={(e) => inputConfig(key, Number(e.target.value) / 100)}
        />
        <span>%</span>
      </div>
    </label>
  );
  const cfgInput = (key: keyof Config, label: string, scale = 1, unit = "") => (
    <label>
      {label}
      <div className="number-unit">
        <input
          type="number"
          min="0"
          step={scale === 10000 ? 0.5 : 1}
          value={Number(config[key]) / scale}
          onChange={(e) => inputConfig(key, Number(e.target.value) * scale)}
        />
        <span>{unit}</span>
      </div>
    </label>
  );
  const batchRows = (r: Result) =>
    QUANTITIES.map((q, j) => [
      <strong>第{j + 1}批</strong>,
      q + "吨",
      date(r.order_days[j]),
      date(r.accept_days[j]),
      date(r.production_finish[j]),
      date(r.internal_due[j]),
      date(r.external_receipt_days[j]),
    ]);
  const empty = (
    <div className="empty">
      <div className="empty-icon">◎</div>
      <h3>先建立共同执行依据</h3>
      <p>可从方案对比选择方案并按责确认，或载入第20日模拟案例。</p>
      <button onClick={() => loadCase()}>载入已确认模拟案例</button>
      <button className="secondary" onClick={() => setPage(1)}>
        前往方案对比
      </button>
    </div>
  );
  const riskRequestMatches =
    risk &&
    JSON.stringify(risk.inputs.plan) ===
      JSON.stringify(rolling ? s.effective?.plan : candidatePlan) &&
    JSON.stringify(risk.inputs.config) ===
      JSON.stringify(rolling ? s.effective?.config : config) &&
    risk.inputs.regime === regime &&
    risk.inputs.variation === (variation ? 0.01 : 0) &&
    risk.inputs.mode === riskMode &&
    risk.inputs.observedDay === (rolling ? 20 : null) &&
    JSON.stringify(risk.inputs.draft) === JSON.stringify(s.draft?.plan ?? null);
  return (
    <>
      <div className="prototype-bar">
        竞赛原型 · 模拟业务与银行回执{" "}
        <span>融资审批与实际支付由银行独立办理</span>
      </div>
      <header>
        <div className="brand">
          <div className="brand-mark">工</div>
          <div>
            <h1>工银边贸智链</h1>
            <p>边民互市经营协同与融资需求联动平台</p>
          </div>
        </div>
        <div className="header-controls">
          <Tag tone="red">珲春俄豆 · 五批连续业务</Tag>
          <label className="role">
            <span>演示角色</span>
            <select
              aria-label="演示角色"
              value={s.role}
              onChange={(e) => role(e.target.value as wf.Role)}
            >
              {Object.entries(ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary small" onClick={reset}>
            重置演示
          </button>
        </div>
      </header>
      <nav>
        {NAV.map((name, i) => (
          <button
            key={name}
            className={page === i ? "active" : ""}
            disabled={
              (s.role === "MEMBER" && i !== 6) || (s.role === "BANK" && i === 6)
            }
            onClick={() => {
              setPage(i);
              setError("");
            }}
          >
            <span>{i + 1}</span>
            {name}
          </button>
        ))}
      </nav>
      <main>
        <div className="page-top">
          <div>
            <span className="eyebrow">
              {
                [
                  "测算与协商",
                  "方案与取舍",
                  "规则与责任",
                  "事实与回执",
                  "变化与影响",
                  "需求与风控",
                  "参与与款项",
                  "记录与追溯",
                ][page]
              }
            </span>
            <h2>{NAV[page]}</h2>
          </div>
          <div className="context">
            {s.effective ? (
              <>
                <Tag tone="green">{s.effective.version} 有效</Tag>
                <Tag>观察时点 D{s.day}</Tag>
                {s.draft && <Tag tone="amber">{s.draft.version} 待确认</Tag>}
              </>
            ) : (
              <Tag>方案测算阶段</Tag>
            )}
          </div>
        </div>
        {error && (
          <div className="notice danger" role="alert">
            {error}
            <button className="text-button" onClick={() => setError("")}>
              关闭
            </button>
          </div>
        )}
        {page === 0 && (
          <>
            <div className="hero">
              <div>
                <h3>先看清各方取舍，再安排连续经营</h3>
                <p>
                  把五批采购、加工与回款放在同一条时间线上，同时观察甲、乙的收益、资金需要和履约压力。
                </p>
              </div>
              <button onClick={() => loadCase()}>载入第20日模拟案例 →</button>
            </div>
            <div className="split">
              <Panel
                title="经营参数"
                subtitle="测算参数独立保存；已有有效规则通过变更流程调整。"
              >
                <div className="form-grid">
                  <label>
                    谈判候选
                    <select
                      aria-label="谈判候选"
                      value={selected}
                      onChange={(e) => pick(Number(e.target.value))}
                    >
                      {plans.map((p, i) => (
                        <option key={i} value={i}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    甲向乙销售单价
                    <div className="number-unit">
                      <input
                        aria-label="销售单价"
                        type="number"
                        min="1"
                        value={candidate.price}
                        onChange={(e) =>
                          inputPlan("price", Number(e.target.value))
                        }
                      />
                      <span>元/吨</span>
                    </div>
                  </label>
                  <label>
                    验收后账期
                    <div className="number-unit">
                      <input
                        aria-label="验收后账期"
                        type="number"
                        min="0"
                        max="90"
                        value={candidate.term}
                        onChange={(e) =>
                          inputPlan("term", Number(e.target.value))
                        }
                      />
                      <span>日</span>
                    </div>
                  </label>
                  <label>
                    乙贸易预付款比例
                    <div className="number-unit">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={candidate.prepay_fraction * 100}
                        onChange={(e) =>
                          inputPlan(
                            "prepay_fraction",
                            Number(e.target.value) / 100,
                          )
                        }
                      />
                      <span>%</span>
                    </div>
                  </label>
                  {cfgInput(
                    "own_A",
                    "甲自有资金（含付息准备金）",
                    10000,
                    "万元",
                  )}
                  {cfgInput(
                    "own_B",
                    "乙自有资金（含付息准备金）",
                    10000,
                    "万元",
                  )}
                  {cfgInput("limit_A", "甲假定获批额度", 10000, "万元")}
                  {cfgInput("limit_B", "乙假定获批额度", 10000, "万元")}
                  {yearRate("annual_rate_A", "甲示例年利率")}
                  {yearRate("annual_rate_B", "乙示例年利率")}
                  <label>
                    本金到期与停止提款日
                    <select
                      value={config.limit_expiry}
                      onChange={(e) =>
                        inputConfig("limit_expiry", Number(e.target.value))
                      }
                    >
                      {[60, 90, 120, 150, 180].map((d) => (
                        <option key={d} value={d}>
                          第{d}日
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    确定性压力场景
                    <select
                      value={String(freeze)}
                      onChange={(e) => setFreeze(e.target.value === "true")}
                    >
                      <option value="false">基准履约</option>
                      <option value="true">下游持续拖欠</option>
                    </select>
                  </label>
                </div>
                <details>
                  <summary>费用与资源参数</summary>
                  <div className="form-grid">
                    {cfgInput("logistics_per_tonne", "物流费", 1, "元/吨")}
                    {cfgInput("setup_per_purchase", "每笔组织费", 1, "元")}
                    {cfgInput("processing_cost", "加工费", 1, "元/吨")}
                    {cfgInput(
                      "downstream_cash_per_raw_tonne",
                      "每吨原料对应成品销售额",
                      1,
                      "元",
                    )}
                    {cfgInput("acceptance_capacity", "验收能力", 1, "吨/日")}
                    {cfgInput("processing_capacity", "加工能力", 1, "吨/日")}
                  </div>
                </details>
                <p className="footnote">
                  总量200吨；甲、乙自有资金各含0.5万元付息准备金。合同、费率、产能与额度均为模拟参数。
                </p>
              </Panel>
              <div>
                <Panel
                  title="规划资金需要"
                  subtitle="维持采购计划所需资金；与获批额度分别展示。"
                >
                  <div className="metrics two">
                    <Metric
                      label="甲资金需要峰值"
                      value={money(planning.peak_A)}
                    />
                    <Metric
                      label="乙资金需要峰值"
                      value={money(planning.peak_B)}
                    />
                    <Metric
                      label="双方同步借款峰值"
                      value={money(planning.peak_joint)}
                      hint="同一时点合计，不等于两个主体峰值之和"
                    />
                    <Metric
                      label="甲列明成本后结余"
                      value={money(planning.profit_A)}
                      hint={
                        planning.complete
                          ? "按本例成本与利息计算"
                          : "存在未结事项，结余待核对"
                      }
                    />
                  </div>
                </Panel>
                <Panel
                  title="资金约束下的执行投影"
                  subtitle={
                    s.effective
                      ? "依据当前有效规则与已回填银行条件"
                      : "依据当前测算方案与假定获批条件"
                  }
                >
                  <div className="metrics two">
                    <Metric
                      label="甲实际使用峰值"
                      value={money(projection.peak_A)}
                    />
                    <Metric
                      label="乙实际使用峰值"
                      value={money(projection.peak_B)}
                    />
                    <Metric
                      label="晚于原加工目标的数量"
                      value={num(projection.late_target_tonnes, 0)}
                      unit="吨"
                      tone={projection.late_target_tonnes ? "amber" : ""}
                    />
                    <Metric
                      label="末批成品回款"
                      value={date(projection.external_receipt_days[4])}
                      unit=""
                    />
                  </div>
                  <button className="secondary" onClick={() => setPage(1)}>
                    查看谈判方案与情景区间 →
                  </button>
                </Panel>
              </div>
            </div>
            <Panel
              title="双方借款余额随业务滚动"
              subtitle="额度不足时顺延采购或付款，相关加工与回款同步后移。"
            >
              <Chart
                r={projection}
                limitA={s.effective?.config.limit_A ?? config.limit_A}
                limitB={s.effective?.config.limit_B ?? config.limit_B}
              />
            </Panel>
            <Panel title="五批执行日历">
              <Table
                headers={[
                  "批次",
                  "数量",
                  "采购启动",
                  "验收完成",
                  "加工完成",
                  "甲销售回款",
                  "乙成品回款",
                ]}
                rows={batchRows(projection)}
              />
            </Panel>
          </>
        )}
        {page === 1 && (
          <>
            <p className="lead">
              同一条件对双方可能产生不同影响。平台呈现收益、周转与履约取舍，由交易各方协商选择。
            </p>
            <Panel
              title="三组谈判候选"
              subtitle="同一组资金、费用和资源参数；金额单位：万元。"
            >
              <Table
                headers={["比较指标", ...plans.map((p) => p.name)]}
                rows={(() => {
                  const r = plans.map(
                      (p) =>
                        simulate(
                          p,
                          planningConfig(config),
                          deterministic(freeze),
                        )!,
                    ),
                    e = plans.map(
                      (p) => simulate(p, config, deterministic(freeze))!,
                    );
                  return [
                    ["销售单价（元/吨）", ...plans.map((p) => p.price)],
                    ["验收后付款", ...plans.map((p) => p.term + "日")],
                    ["甲资金需要峰值", ...r.map((x) => money(x.peak_A))],
                    ["乙资金需要峰值", ...r.map((x) => money(x.peak_B))],
                    ["双方同步借款峰值", ...r.map((x) => money(x.peak_joint))],
                    ["甲列明成本后结余", ...r.map((x) => money(x.profit_A))],
                    ["乙列明成本后结余", ...r.map((x) => money(x.profit_B))],
                    [
                      "当前额度下末批回款",
                      ...e.map((x) => date(x.external_receipt_days[4])),
                    ],
                    [
                      "自主选择",
                      ...plans.map((p, i) => (
                        <button
                          key={i}
                          disabled={
                            !!s.effective ||
                            s.role === "BANK" ||
                            s.role === "MEMBER"
                          }
                          onClick={() =>
                            action(
                              () => wf.createRule(s, p, config, freeze),
                              "已形成待确认规则，请进入共同规则工作区",
                            )
                          }
                        >
                          选择此方案
                        </button>
                      )),
                    ],
                  ];
                })()}
              />
            </Panel>
            <Panel
              title="分批价值来自采购与回款两端衔接"
              subtitle="固定3800元/吨、5日账期与相同物流日历，分解两端安排的影响。"
            >
              <Table
                headers={[
                  "采购付款",
                  "销售结算",
                  "甲资金需要峰值",
                  "乙资金需要峰值",
                  "双方同步峰值",
                ]}
                rows={[true, false].flatMap((bulk) =>
                  [true, false].map((collection) => {
                    const r = simulate(
                      planOf("分批对照", {
                        price: 3800,
                        bulk_purchase: bulk,
                        bulk_collection: collection,
                      }),
                      planningConfig(config),
                    )!;
                    return [
                      bulk ? "集中付款锁货" : "分批采购付款",
                      collection ? "末批后整批收款" : "逐批验收收款",
                      money(r.peak_A),
                      money(r.peak_B),
                      money(r.peak_joint),
                    ];
                  }),
                )}
              />
            </Panel>
            <Panel
              title="未来情景与滚动区间"
              subtitle="在相同随机情景下比较，观察经营条件如何转移资金压力。"
            >
              <div className="toolbar">
                <label>
                  环境假设
                  <select
                    value={regime}
                    onChange={(e) => setRegime(e.target.value as any)}
                  >
                    <option value="base">基准</option>
                    <option value="mild">温和</option>
                    <option value="severe">严峻</option>
                  </select>
                </label>
                <label>
                  样本数
                  <select
                    value={paths}
                    onChange={(e) => setPaths(Number(e.target.value))}
                  >
                    {[1000, 3000, 6000, 12000].map((n) => (
                      <option value={n} key={n}>
                        {n.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  计算口径
                  <select
                    value={riskMode}
                    onChange={(e) => setRiskMode(e.target.value as any)}
                  >
                    <option value="plan">维持计划的资金需要</option>
                    <option value="execute">当前额度下执行</option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={rolling}
                    onChange={(e) => setRolling(e.target.checked)}
                  />
                  按第20日已核验历史匹配
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={variation}
                    onChange={(e) => setVariation(e.target.checked)}
                  />
                  批量±1%扰动，合计仍为200吨
                </label>
                <button disabled={!!progress} onClick={runRisk}>
                  {progress ? "计算中…" : "运行情景分析"}
                </button>
                {progress && (
                  <button
                    className="secondary"
                    onClick={() => {
                      worker.current?.terminate();
                      job.current++;
                      setProgress(null);
                    }}
                  >
                    停止计算
                  </button>
                )}
              </div>
              {progress && (
                <div className="progress">
                  <div
                    style={{
                      width: (progress.done / progress.total) * 100 + "%",
                    }}
                  />
                  <span>
                    {Math.round((progress.done / progress.total) * 100)}%
                  </span>
                </div>
              )}
              {risk && (
                <>
                  <div
                    className={
                      "notice " + (riskRequestMatches ? "success" : "warning")
                    }
                  >
                    {riskRequestMatches
                      ? "结果对应当前分析设置。"
                      : "参数或草案已变化，下方保留上一版结果，请重新计算。"}{" "}
                    共{risk.paths.toLocaleString()}条先验路径
                    {risk.inputs.observedDay !== null
                      ? `，匹配后保留${risk.retained.toLocaleString()}条`
                      : "。"}
                    {risk.paths < paths
                      ? "当前环境假设提供最多6000条固定样本。"
                      : ""}
                  </div>
                  {risk.retained > 0 ? (
                    <>
                      <Table
                        headers={[
                          "情景结果",
                          risk.inputs.plan.name,
                          ...(risk.changed ? ["账期草案"] : []),
                        ]}
                        rows={[
                          "A50",
                          "A90",
                          "A95",
                          "B90",
                          "B95",
                          "joint90",
                          "clearA90",
                          "coverage",
                        ].map((key) => [
                          {
                            A50: "甲需求峰值P50（万元）",
                            A90: "甲需求峰值P90（万元）",
                            A95: "甲需求峰值P95（万元）",
                            B90: "乙需求峰值P90（万元）",
                            B95: "乙需求峰值P95（万元）",
                            joint90: "双方同步峰值P90（万元）",
                            clearA90: "甲清偿日P90",
                            coverage: "双方额度及第90日清偿联合覆盖（%）",
                          }[key]!,
                          ...[
                            risk.original,
                            ...(risk.changed ? [risk.changed] : []),
                          ].map((x) =>
                            key === "coverage"
                              ? num(x[key])
                              : key === "clearA90"
                                ? date(x[key])
                                : money(x[key]),
                          ),
                        ])}
                      />
                      <button
                        className="text-button"
                        onClick={() => download("情景分析结果.json", risk)}
                      >
                        导出本次结果与参数
                      </button>
                    </>
                  ) : (
                    <div className="notice warning">
                      当前样本与观测历史不兼容，请增加样本或重新核对情景和已观察事实。
                    </div>
                  )}
                </>
              )}
              <p className="footnote">
                口岸与下游延迟采用带持续性的情景假设；采用共同样本比较。P90表示该情景模型下90%路径的资金需要位于此值及以下；覆盖比例属于条件情景统计。风险判断还需结合真实历史与企业整体资料。
              </p>
            </Panel>
          </>
        )}
        {page === 2 && (
          <>
            <p className="lead">
              共同确认解决合同与经营安排的一致性；银行依据各自流程独立审核资金条件。
            </p>
            {s.initial ? (
              <Panel title="Rule-V1 待确认">
                <Table
                  headers={["事项", "当前安排"]}
                  rows={[
                    ["销售单价", s.initial.plan.price + "元/吨"],
                    ["批次", "32 / 44 / 36 / 48 / 40吨"],
                    ["账期", s.initial.plan.term + "日"],
                    ["贸易预付款", s.initial.plan.prepay_fraction * 100 + "%"],
                    [
                      "甲、乙模拟既有额度",
                      money(s.initial.config.limit_A) +
                        " / " +
                        money(s.initial.config.limit_B) +
                        "万元",
                    ],
                    ["规则摘要", s.initial.hash],
                  ]}
                />
                <div className="confirmation-row">
                  {["甲", "乙"].map((x) => (
                    <div key={x}>
                      <strong>
                        {x === "甲" ? "合作组织甲" : "加工企业乙"}
                      </strong>
                      <Tag
                        tone={
                          s.initial!.confirmed.includes(x) ? "green" : "amber"
                        }
                      >
                        {s.initial!.confirmed.includes(x) ? "已确认" : "待确认"}
                      </Tag>
                    </div>
                  ))}
                </div>
                <div className="toolbar">
                  <button
                    disabled={s.role === "BANK" || s.role === "MEMBER"}
                    onClick={() => action(() => wf.confirmRule(s, "initial"))}
                  >
                    以{ROLES[s.role]}身份确认
                  </button>
                  <button
                    className="secondary"
                    disabled={s.initial.confirmed.length < 2}
                    onClick={() => action(() => wf.activate(s, "initial"))}
                  >
                    使已确认规则生效
                  </button>
                </div>
              </Panel>
            ) : s.effective ? (
              <Panel
                title="当前共同执行依据"
                subtitle="规则版本与银行办理状态分别保存。"
              >
                <div className="rule-summary">
                  <Tag tone="green">{s.effective.version} 有效</Tag>
                  <strong>{s.effective.plan.name}</strong>
                  <span>
                    {s.effective.plan.price}元/吨 · 各批账期{" "}
                    {(
                      s.effective.plan.terms ??
                      Array(5).fill(s.effective.plan.term)
                    ).join(" / ")}
                    日
                  </span>
                  <code>{s.effective.hash}</code>
                </div>
                <Table
                  headers={[
                    "批次",
                    "数量",
                    "采购启动",
                    "验收完成",
                    "加工完成",
                    "甲销售回款",
                    "乙成品回款",
                  ]}
                  rows={batchRows(projection)}
                />
                <p className="footnote">
                  案例中的既有授信条件为独立导入的模拟银行资料；共同确认保留双方各自的经营责任。
                </p>
                <button onClick={() => setPage(3)}>进入履约台账 →</button>
              </Panel>
            ) : (
              empty
            )}
          </>
        )}
        {page === 3 &&
          (s.effective ? (
            <>
              <div className="toolbar day-controls">
                <label>
                  观察日期
                  <input
                    aria-label="观察日期"
                    type="range"
                    min="0"
                    max="180"
                    value={s.day}
                    onChange={(e) => setS(wf.setDay(s, Number(e.target.value)))}
                  />
                </label>
                <strong>第{s.day}日</strong>
                {[0, 8, 20, 40, 42, 54, 65, 120, 180].map((d) => (
                  <button
                    className="secondary small"
                    key={d}
                    onClick={() => setS(wf.setDay(s, d))}
                  >
                    D{d}
                  </button>
                ))}
                <button
                  disabled={s.role === "MEMBER"}
                  onClick={() =>
                    action(
                      () => wf.loadHistory(s, s.day),
                      "已分别载入模拟业务单据及支付回执",
                    )
                  }
                >
                  载入截至本日模拟履约记录
                </button>
              </div>
              <div className="notice">
                “执行投影”根据有效规则与资金条件计算；“已核验记录”来自下方单据和回执。登记验收后，再分别登记和核验支付回执。
              </div>
              <div className="metrics four">
                <Metric
                  label="投影：已验收"
                  value={num(current.accepted_tonnes, 0)}
                  unit="吨"
                />
                <Metric
                  label="记录：已核验验收"
                  value={num(
                    actuals
                      .filter((x) => x.kind === "ACCEPT")
                      .reduce((a, b) => a + b.amount, 0),
                    0,
                  )}
                  unit="吨"
                />
                <Metric
                  label="已核验企业货款回执"
                  value={money(
                    actuals
                      .filter((x) => x.kind === "TRADE_PAY")
                      .reduce((a, b) => a + b.amount, 0),
                  )}
                />
                <Metric
                  label="已核验成员尾款回执"
                  value={money(
                    actuals
                      .filter((x) => x.kind === "MEMBER_PAY")
                      .reduce((a, b) => a + b.amount, 0),
                  )}
                />
              </div>
              <Panel
                title="当前资金与偿付状态"
                subtitle={
                  hasClose
                    ? "本日模拟银行对账已核验，显示对应执行台账余额。"
                    : "以下为执行投影；本日日终银行记录尚待核验。"
                }
              >
                <div className="metrics four">
                  <Metric label="甲日终本金" value={money(current.A_debt)} />
                  <Metric label="乙日终本金" value={money(current.B_debt)} />
                  <Metric
                    label="已验收成员尾款未付"
                    value={money(current.tail_unpaid)}
                  />
                  <Metric
                    label="企业往来未结"
                    value={money(current.invoice_unpaid)}
                  />
                </div>
                <Chart
                  r={projection}
                  limitA={s.effective.config.limit_A}
                  limitB={s.effective.config.limit_B}
                />
              </Panel>
              <Panel
                title="单据与回执核验"
                subtitle="可逐项登记，也可载入案例记录。存在差异的材料保留原记录及处理说明。"
              >
                <Table
                  headers={[
                    "日期",
                    "批次",
                    "材料或事件",
                    "数量 / 金额",
                    "状态与来源",
                    "操作",
                  ]}
                  rows={schedule
                    .filter(
                      (x) =>
                        x.day <= s.day &&
                        (x.kind !== "BANK_CLOSE" || x.day === s.day),
                    )
                    .map((ev) => {
                      const stored = s.evidence.find((x) => x.id === ev.id);
                      return [
                        date(ev.day),
                        ev.batch === null
                          ? "日终对账"
                          : "第" + (ev.batch + 1) + "批",
                        ev.label,
                        ev.kind === "ACCEPT"
                          ? num(ev.amount, 0) + "吨"
                          : ev.kind === "BANK_CLOSE"
                            ? money(ev.balances?.A_debt) +
                              " / " +
                              money(ev.balances?.B_debt) +
                              "万元"
                            : money(ev.amount) + "万元",
                        <>
                          <Tag
                            tone={
                              stored?.status === "已核验"
                                ? "green"
                                : stored?.status === "存在差异"
                                  ? "amber"
                                  : ""
                            }
                          >
                            {stored?.status ?? "待登记"}
                          </Tag>
                          <small className="source">{ev.source}</small>
                        </>,
                        !stored ? (
                          <button
                            className="secondary small"
                            onClick={() =>
                              action(() => wf.submitEvidence(s, ev.id))
                            }
                          >
                            登记材料
                          </button>
                        ) : stored.status !== "已核验" ? (
                          <div className="button-stack">
                            <button
                              className="small"
                              disabled={
                                ev.kind === "BANK_CLOSE" && s.role !== "BANK"
                              }
                              onClick={() =>
                                action(() =>
                                  wf.verifyEvidence(
                                    s,
                                    ev.id,
                                    "已核验",
                                    "依据模拟原始记录完成核验",
                                  ),
                                )
                              }
                            >
                              核验通过
                            </button>
                            <button
                              className="secondary small"
                              onClick={() =>
                                action(() =>
                                  wf.verifyEvidence(
                                    s,
                                    ev.id,
                                    "存在差异",
                                    "字段与当前材料不一致，待责任方补充",
                                  ),
                                )
                              }
                            >
                              标记差异
                            </button>
                          </div>
                        ) : (
                          <span className="muted">已保留核验依据</span>
                        ),
                      ];
                    })}
                />
              </Panel>
              <Panel title="五批当前执行安排">
                <Table
                  headers={[
                    "批次",
                    "数量",
                    "采购启动",
                    "验收完成",
                    "加工完成",
                    "甲销售回款",
                    "乙成品回款",
                  ]}
                  rows={batchRows(projection)}
                />
              </Panel>
            </>
          ) : (
            empty
          ))}
        {page === 4 &&
          (s.effective ? (
            <>
              <p className="lead">
                先保留已发生事实，再分析拟议条件。变化影响到哪个批次和主体，就核对相应事项。
              </p>
              <Panel
                title="提出账期调整"
                subtitle="默认演示第20日将第三至第五批账期由5日改为15日。"
              >
                <div className="toolbar">
                  <label>
                    拟议账期
                    <input
                      aria-label="拟议账期"
                      type="number"
                      min="0"
                      max="90"
                      value={term}
                      onChange={(e) => setTerm(Number(e.target.value))}
                    />
                  </label>
                  {QUANTITIES.map((q, j) => (
                    <label className="check" key={j}>
                      <input
                        type="checkbox"
                        checked={batchMask.includes(j)}
                        disabled={projection.internal_due[j] <= s.day}
                        onChange={(e) =>
                          setBatchMask(
                            e.target.checked
                              ? [...batchMask, j]
                              : batchMask.filter((x) => x !== j),
                          )
                        }
                      />
                      第{j + 1}批 · {q}吨
                    </label>
                  ))}
                  <button
                    disabled={
                      !!s.draft || s.role === "BANK" || s.role === "MEMBER"
                    }
                    onClick={() => action(() => wf.propose(s, term, batchMask))}
                  >
                    生成变更草案并重算
                  </button>
                </div>
              </Panel>
              {draftResults && s.draft ? (
                <>
                  <div className="compare-cards">
                    <div>
                      <span>当前有效安排</span>
                      <h3>
                        {money(draftResults.before.peak_A, 3)}
                        <small>万元</small>
                      </h3>
                      <p>甲维持采购计划所需峰值</p>
                      <Tag>{s.effective.version}</Tag>
                    </div>
                    <div className="accent">
                      <span>草案条件下</span>
                      <h3>
                        {money(draftResults.after.peak_A, 3)}
                        <small>万元</small>
                      </h3>
                      <p>甲维持采购计划所需峰值</p>
                      <Tag tone="amber">{s.draft.version} 待确认</Tag>
                    </div>
                  </div>
                  <Panel title="变化沿采购、加工和回款传导">
                    <Table
                      headers={["比较项目", "当前有效安排", "拟议草案"]}
                      rows={[
                        [
                          "甲资金需要峰值",
                          money(draftResults.before.peak_A, 3),
                          money(draftResults.after.peak_A, 3),
                        ],
                        [
                          "乙资金需要峰值",
                          money(draftResults.before.peak_B),
                          money(draftResults.after.peak_B),
                        ],
                        [
                          "甲对照额度的待筹峰值",
                          money(
                            Math.max(
                              0,
                              draftResults.before.peak_A -
                                (s.effective.config.limit_A ?? Infinity),
                            ),
                            3,
                          ),
                          money(
                            Math.max(
                              0,
                              draftResults.after.peak_A -
                                (s.effective.config.limit_A ?? Infinity),
                            ),
                            3,
                          ),
                        ],
                        [
                          "第五批采购日",
                          date(draftResults.beforeExec.order_days[4]),
                          date(draftResults.afterExec.order_days[4]),
                        ],
                        [
                          "第五批成品回款",
                          date(
                            draftResults.beforeExec.external_receipt_days[4],
                          ),
                          date(draftResults.afterExec.external_receipt_days[4]),
                        ],
                        [
                          "甲本组借款最终清偿",
                          date(draftResults.beforeExec.settlement_day_A),
                          date(draftResults.afterExec.settlement_day_A),
                        ],
                        [
                          "本金到期日",
                          date(s.effective.config.limit_expiry),
                          date(s.draft.config.limit_expiry),
                        ],
                      ]}
                    />
                    <div className="notice">
                      待筹金额用于说明维持原计划的经营压力。借款是否到期、能否按约清偿，需要结合有效融资条件分别核查。
                    </div>
                    <div className="confirmation-row">
                      {["甲", "乙"].map((x) => (
                        <div key={x}>
                          <strong>{x}</strong>
                          <Tag
                            tone={
                              s.draft!.confirmed.includes(x) ? "green" : "amber"
                            }
                          >
                            {s.draft!.confirmed.includes(x)
                              ? "已确认"
                              : "待确认"}
                          </Tag>
                        </div>
                      ))}
                    </div>
                    <div className="toolbar">
                      <button
                        disabled={s.role === "BANK" || s.role === "MEMBER"}
                        onClick={() => action(() => wf.confirmRule(s, "draft"))}
                      >
                        以{ROLES[s.role]}身份确认草案
                      </button>
                      <button
                        className="secondary"
                        disabled={s.draft.confirmed.length < 2}
                        onClick={() => action(() => wf.activate(s, "draft"))}
                      >
                        使已确认草案生效
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          action(
                            () => wf.withdraw(s),
                            "已维持原有约定，相关银行记录继续保留",
                          )
                        }
                      >
                        维持原约定
                      </button>
                      <button onClick={() => setPage(5)}>
                        查看金融需求与核查说明 →
                      </button>
                    </div>
                  </Panel>
                </>
              ) : (
                <div className="notice">
                  当前无待确认草案。可选择尚未到期批次并提出条件变更。
                </div>
              )}
            </>
          ) : (
            empty
          ))}
        {page === 5 &&
          (s.effective ? (
            <>
              <div className="toolbar">
                <label>
                  需求主体
                  <select
                    aria-label="需求主体"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value as any)}
                  >
                    <option value="A">合作组织甲</option>
                    <option value="B">加工企业乙</option>
                  </select>
                </label>
                <label>
                  办理类型
                  <select
                    aria-label="办理类型"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as any)}
                  >
                    <option value="FINANCING">新增融资需求</option>
                    <option value="RISK_REVIEW">
                      风险核查（支持零新增融资）
                    </option>
                  </select>
                </label>
                {kind === "FINANCING" && subject === "A" && (
                  <label>
                    融资结构
                    <select
                      aria-label="融资结构"
                      value={structure}
                      onChange={(e) => setStructure(e.target.value as wf.Structure)}
                    >
                      <option value="GENERAL">一般额度调整</option>
                      <option value="TRANCHE">批次专项提款</option>
                    </select>
                  </label>
                )}
                <button
                  disabled={s.role === "MEMBER"}
                  onClick={() =>
                    action(
                      () =>
                        wf.submitBank(
                          s,
                          subject,
                          kind,
                          kind === "FINANCING" && subject === "A"
                            ? structure
                            : "GENERAL",
                        ),
                      "已提交模拟银行办理；合同确认状态独立保留",
                    )
                  }
                >
                  {kind === "RISK_REVIEW"
                    ? "发起风险核查"
                    : structure === "TRANCHE" && subject === "A"
                      ? "提交专项提款方案"
                      : "提交融资需求包"}
                </button>
              </div>
              {need && (
                <>
                  <div className="translate-steps">
                    {[
                      [
                        "经营变化",
                        s.draft
                          ? `${s.effective.version}有效；${s.draft.version}拟调整付款条件`
                          : "按有效合同跟踪履约及还款安排",
                      ],
                      [
                        "现金流影响",
                        `${need.subject}资金需要峰值 ${money(need.originalPeak, 3)} → ${money(need.proposedPeak, 3)} 万元`,
                      ],
                      [
                        "资金与偿付",
                        `待筹峰值 ${money(need.waiting, 3)} 万元；本组本金 ${money(need.existingDebt, 3)} 万元；本金${date(need.maturityDay)}到期`,
                      ],
                      [
                        "银行核查",
                        kind === "FINANCING"
                          ? "按授权提交主体、金额、用途、回款及证据"
                          : "保留零新增融资的核查事项，核对回款、既有借款及补充材料",
                      ],
                    ].map(([a, b], i) => (
                      <div key={a}>
                        <span>0{i + 1}</span>
                        <strong>{a}</strong>
                        <p>{b}</p>
                      </div>
                    ))}
                  </div>
                  <Panel
                    title="结构化金融需求与风险影响说明"
                    subtitle="金融需求、经营确认及银行结果分别记录；未来回款保持预测状态。"
                  >
                    <Table
                      headers={["字段", "业务说明"]}
                      rows={[
                        ["需求主体", need.subject],
                        [
                          "当前业务依据",
                          `${need.rule}有效${need.draft ? "；" + need.draft + "待确认" : ""} · 观察时点第${need.observedDay}日`,
                        ],
                        [
                          "原安排 / 草案资金峰值",
                          `${money(need.originalPeak, 3)} / ${money(need.proposedPeak, 3)}万元`,
                        ],
                        [
                          "资金需要增量 / 对照额度待筹峰值",
                          `${money(need.increment, 3)} / ${money(need.waiting, 3)}万元`,
                        ],
                        [
                          "提交的新增融资金额",
                          kind === "RISK_REVIEW"
                            ? "0元，提交风险核查事项"
                            : need.party === "A" && s.tranche && s.day < s.tranche.maturityDay
                              ? `${money(need.amount, 3)}万元缺口已由获批专项${money(s.tranche.limit, 3)}万元覆盖（${s.tranche.receiptId}），不再重复申请`
                              : money(need.amount, 3) + "万元（需求说明）",
                        ],
                        ["用款环节", need.purpose],
                        [
                          "预计压力窗口",
                          need.waiting > 0
                            ? `${date(need.startDay)}${need.endDay !== null ? "至" + date(need.endDay) : "，结束时点待核实"}`
                            : "当前测算未形成新增待筹窗口，按有效融资条件跟踪",
                        ],
                        [
                          "预计回款依据",
                          need.receiptBatch
                            ? `第${need.receiptBatch}批，${date(need.receiptDay)}预计回款${money(need.receiptAmount, 3)}万元；核查已有融资占用和实际到账`
                            : "需补充可核验的回款来源",
                        ],
                        [
                          "已有本金及合同到期",
                          `${need.existingConfirmed ? "已核验记录" : "待核验投影"}：${money(need.existingDebt, 3)}万元；${date(need.maturityDay)}到期`,
                        ],
                        [
                          "模拟最终清偿时间",
                          `${date(need.clearBefore)} → ${date(need.clearAfter)}`,
                        ],
                        [
                          "合同到期时的投影剩余本金",
                          money(need.duePrincipal) + "万元（本组业务台账范围）",
                        ],
                        [
                          "证据状态",
                          `已登记${need.evidenceCount}项，已核验${need.verifiedCount}项；未来验收和回款待发生`,
                        ],
                        ["待核查事项", need.needs.join("；")],
                      ]}
                    />
                  </Panel>
                </>
              )}
              {fplan && kind === "FINANCING" && (
                <Panel
                  title="融资支持方案说明（批次专项提款·模拟）"
                  subtitle="平台整理缺口形态、可核验的还款来源和提款条件；额度、期限、产品形式与是否批准由银行决定。"
                  action={
                    fplan.applicable && s.role === "FACTORY" ? (
                      <button
                        className="small"
                        onClick={() =>
                          action(
                            () => wf.confirmReceivable(s),
                            "乙已确认还款来源批次的应付金额与付款日",
                          )
                        }
                      >
                        确认第{fplan.sourceBatch! + 1}批应付
                      </button>
                    ) : null
                  }
                >
                  {fplan.applicable ? (
                    <>
                      <Table
                        headers={["项目", "方案说明"]}
                        rows={[
                          ["适用主体", "合作组织甲（须为依法登记、可作借款人的主体；互助组和边民个人不在本安排内）"],
                          [
                            "缺口形态",
                            `${fplan.version}下，现有额度使第${fplan.targetBatch! + 1}批采购由${date(fplan.plannedDay)}顺延至${date(fplan.delayedDay)}；对照现有额度待筹峰值${money(fplan.lower, 3)}万元`,
                          ],
                          [
                            "借款用途",
                            `第${fplan.targetBatch! + 1}批收购预付款、物流与组织费，以及该批验收后的成员尾款；受托支付至收款方（${money(fplan.purposeAmount, 3)}万元）`,
                          ],
                          [
                            "还款来源",
                            `第${fplan.sourceBatch! + 1}批${date(fplan.sourceAcceptDay)}验收，乙应于${date(fplan.sourceDueDay)}付甲${money(fplan.receivable, 3)}万元；进入回笼账户后优先归还专项`,
                          ],
                          [
                            "额度区间",
                            `下限${money(fplan.lower, 3)}万元（确定性待筹峰值）至上限${money(fplan.upper, 3)}万元（还款来源与用途的较小者）；银行另按企业整体经营测算`,
                          ],
                          [
                            "期限与提款",
                            `回执次日（${date(fplan.openDay)}）起可提，${date(fplan.closeDay)}提款截止，${date(fplan.maturityDay)}到期；不循环；先用现金和一般额度，不足部分才动用专项`,
                          ],
                        ]}
                      />
                      <h4 className="subhead">提款前条件</h4>
                      <Table
                        headers={["条件", "状态", "说明"]}
                        rows={fplan.conditions.map((c) => [
                          c.label + (c.daily ? "（提款日逐日判定）" : ""),
                          <Tag tone={c.status === "满足" ? "green" : c.status === "待满足" ? "amber" : "red"}>
                            {c.status}
                          </Tag>,
                          c.note,
                        ])}
                      />
                    </>
                  ) : (
                    <p className="footnote">{fplan.reason}</p>
                  )}
                  {fplan.applicable && (
                    <>
                      <h4 className="subhead">融资安排对照（确定性基准，受限执行）</h4>
                      <Table
                        headers={["安排", "第" + (fplan.targetBatch! + 1) + "批采购", "成品回款", "甲借款峰值", "其中专项", "甲利息（元）", "甲清偿", "额外承诺（万元·日）"]}
                        rows={arrangementRows.map(({ a, r, extra }) => [
                          a.label,
                          date(r.order_days[fplan.targetBatch!]),
                          date(r.external_receipt_days[fplan.targetBatch!]),
                          money(r.peak_A, 3),
                          a.extra.kind === "tranche" ? money(r.tranche_peak, 3) : "—",
                          num(r.interest_A),
                          date(r.settlement_day_A),
                          num(extra, 1),
                        ])}
                      />
                      <div className="toolbar">
                        <button
                          className="secondary"
                          disabled={!!finProgress}
                          onClick={runFinancing}
                        >
                          {actuals.some((x) => x.id === "close-20")
                            ? "在第20日历史匹配情景中对照"
                            : "在12000条情景中对照"}
                        </button>
                        {finProgress && (
                          <span className="muted">
                            计算中 {finProgress.done.toLocaleString()} / {finProgress.total.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {finRisk && finRisk.ruleHash === fplan.ruleHash && (
                        <>
                          <p className="muted">
                            共{finRisk.paths.toLocaleString()}条情景路径
                            {finRisk.inputs.observedDay !== null
                              ? `，按第${finRisk.inputs.observedDay}日已核验历史匹配后保留${finRisk.retained.toLocaleString()}条`
                              : ""}
                            ；各安排使用同一组路径。
                          </p>
                          <Table
                            headers={["安排", "五批按计划采购", "超宽限交付", "甲峰值P90", "其中一般额度P90", "甲平均利息（元）", "乙平均利息（元）", "专项被提用", "专项条件受阻", "额外承诺（万元·日）"]}
                            rows={finRisk.rows.map((x: any) => [
                              x.label,
                              num(x.on_plan_pct, 1) + "%",
                              num(x.late_beyond_grace_pct, 1) + "%",
                              money(x.peak_A_p90),
                              money(x.general_peak_A_p90),
                              num(x.interest_A_mean, 1),
                              num(x.interest_B_mean, 1),
                              x.tranche_drawn_pct === null ? "—" : num(x.tranche_drawn_pct, 1) + "%",
                              x.tranche_blocked_pct === null ? "—" : num(x.tranche_blocked_pct, 1) + "%",
                              num(x.extra_limit_wan_days_mean, 0),
                            ])}
                          />
                        </>
                      )}
                      <p className="footnote">
                        改善与代价同时列示：提额或专项让采购按计划进行，同时增加甲的借款与利息；专项受还款来源条件约束，第3批未按时验收的路径不能提用。情景分布为演示假设，结果是给定模型下的模拟表现，不代表真实融资效果或违约概率。额外承诺用于比较银行额度占用期，不等于资本成本。
                      </p>
                    </>
                  )}
                </Panel>
              )}
              <Panel
                title="银行办理与反馈"
                subtitle="切换客户经理视图处理模拟核查；客户补充材料后重新提交。"
                action={
                  s.role !== "BANK" ? (
                    <button
                      className="secondary small"
                      onClick={() => role("BANK")}
                    >
                      进入客户经理视图
                    </button>
                  ) : null
                }
              >
                {s.cases.length ? (
                  <>
                    <div className="case-selector">
                      {s.cases.map((x) => (
                        <button
                          className={
                            focused?.id === x.id ? "selected-case" : "secondary"
                          }
                          key={x.id}
                          onClick={() => setCaseFocus(x.id)}
                        >
                          {x.kind === "FINANCING"
                            ? x.structure === "TRANCHE"
                              ? "专项"
                              : "融资"
                            : "核查"}{" "}
                          ·{" "}
                          {x.party === "A" ? "甲" : "乙"} · {STATUS[x.status]}
                        </button>
                      ))}
                    </div>
                    {focused && (
                      <>
                        <Table
                          headers={["办理项目", "当前记录"]}
                          rows={[
                            ["办理编号", focused.id],
                            [
                              "提交依据",
                              `${focused.need.rule}${focused.need.draft ? " / " + focused.need.draft : ""}；观察时点D${focused.need.observedDay}`,
                            ],
                            [
                              "办理状态",
                              <Tag
                                tone={
                                  ["REVIEW_COMPLETED", "EXECUTED"].includes(
                                    focused.status,
                                  )
                                    ? "green"
                                    : "amber"
                                }
                              >
                                {STATUS[focused.status]}
                              </Tag>,
                            ],
                            ["核查意见", focused.feedback || "等待银行核查"],
                            ["已补充材料", focused.materials || "尚无补充记录"],
                            focused.structure === "TRANCHE"
                              ? [
                                  "模拟获批专项",
                                  focused.terms
                                    ? `${money(focused.terms.limit, 3)}万元；${date(focused.plan?.openDay)}起可提，${date(focused.terms.closeDay)}截止，${date(focused.terms.maturityDay)}到期；只用于第${(focused.plan?.targetBatch ?? 0) + 1}批采购及尾款`
                                    : "—",
                                ]
                              : [
                                  "模拟获批总额度",
                                  focused.approvedLimit === null
                                    ? "—"
                                    : money(focused.approvedLimit) + "万元",
                                ],
                            [
                              "后续跟踪日",
                              focused.followUpDay === null
                                ? "待银行反馈"
                                : date(focused.followUpDay),
                            ],
                            ["办理回执（模拟）", focused.receiptId ?? "等待回填"],
                          ]}
                        />
                        {s.role === "BANK" ? (
                          <div className="review-form">
                            <label>
                              核查意见 / 办理说明
                              <textarea
                                aria-label="核查意见"
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                                placeholder="记录延期原因、回款核验、企业其他债务和后续跟踪安排"
                              />
                            </label>
                            <div className="toolbar">
                              <button
                                className="secondary"
                                disabled={
                                  ![
                                    "PENDING_BANK_REVIEW",
                                    "NEEDS_MATERIAL",
                                  ].includes(focused.status)
                                }
                                onClick={() =>
                                  action(() =>
                                    wf.bankDecision(
                                      s,
                                      focused.id,
                                      "NEEDS_MATERIAL",
                                      feedback,
                                    ),
                                  )
                                }
                              >
                                要求补充材料
                              </button>
                              {focused.kind === "FINANCING" ? (
                                <>
                                  {focused.structure === "TRANCHE" ? (
                                    <>
                                      <label>
                                        专项额度（万元）
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.001"
                                          aria-label="专项额度"
                                          value={terms ? +(terms.limit / 10000).toFixed(3) : ""}
                                          onChange={(e) =>
                                            setTerms((t) => t && { ...t, limit: Math.round(Number(e.target.value) * 10000) })
                                          }
                                        />
                                      </label>
                                      <label>
                                        提款截止日
                                        <input
                                          type="number"
                                          aria-label="提款截止日"
                                          value={terms?.closeDay ?? ""}
                                          onChange={(e) =>
                                            setTerms((t) => t && { ...t, closeDay: Number(e.target.value) })
                                          }
                                        />
                                      </label>
                                      <label>
                                        到期日
                                        <input
                                          type="number"
                                          aria-label="专项到期日"
                                          value={terms?.maturityDay ?? ""}
                                          onChange={(e) =>
                                            setTerms((t) => t && { ...t, maturityDay: Number(e.target.value) })
                                          }
                                        />
                                      </label>
                                    </>
                                  ) : (
                                    <label>
                                      拟回填获批总额度（万元）
                                      <input
                                        type="number"
                                        min="0"
                                        value={approvedLimit}
                                        onChange={(e) =>
                                          setApprovedLimit(Number(e.target.value))
                                        }
                                      />
                                    </label>
                                  )}
                                  <button
                                    disabled={
                                      ![
                                        "PENDING_BANK_REVIEW",
                                        "NEEDS_MATERIAL",
                                      ].includes(focused.status)
                                    }
                                    onClick={() =>
                                      action(() =>
                                        wf.bankDecision(
                                          s,
                                          focused.id,
                                          "APPROVED",
                                          feedback,
                                          focused.structure === "TRANCHE" ? null : approvedLimit * 10000,
                                          focused.structure === "TRANCHE" ? terms : null,
                                        ),
                                      )
                                    }
                                  >
                                    记录批准结果（模拟）
                                  </button>
                                  <button
                                    className="secondary"
                                    disabled={
                                      ![
                                        "PENDING_BANK_REVIEW",
                                        "NEEDS_MATERIAL",
                                      ].includes(focused.status)
                                    }
                                    onClick={() =>
                                      action(() =>
                                        wf.bankDecision(
                                          s,
                                          focused.id,
                                          "NOT_APPROVED",
                                          feedback,
                                        ),
                                      )
                                    }
                                  >
                                    记录未批准结果
                                  </button>
                                </>
                              ) : (
                                <button
                                  disabled={
                                    ![
                                      "PENDING_BANK_REVIEW",
                                      "NEEDS_MATERIAL",
                                    ].includes(focused.status)
                                  }
                                  onClick={() =>
                                    action(() =>
                                      wf.bankDecision(
                                        s,
                                        focused.id,
                                        "REVIEW_COMPLETED",
                                        feedback,
                                      ),
                                    )
                                  }
                                >
                                  记录核查完成
                                </button>
                              )}
                              <button
                                className="secondary"
                                disabled={
                                  !["APPROVED", "REVIEW_COMPLETED"].includes(
                                    focused.status,
                                  ) || !!focused.receiptId
                                }
                                onClick={() =>
                                  action(
                                    () => wf.acknowledgeBank(s, focused.id),
                                    focused.structure === "TRANCHE"
                                      ? "回执已回填；专项自下一日可提，相关规则生效后进入执行投影"
                                      : focused.kind === "FINANCING"
                                      ? "回执已回填；获批条件用于下一日及之后的执行投影"
                                      : "核查意见、办理回执和后续跟踪事项已记录",
                                  )
                                }
                              >
                                回填办理回执
                              </button>
                            </div>
                          </div>
                        ) : focused.status === "NEEDS_MATERIAL" ? (
                          <div className="review-form">
                            <label>
                              补充材料说明
                              <textarea
                                value={materials}
                                onChange={(e) => setMaterials(e.target.value)}
                                placeholder="填写补充材料名称、来源与核对说明"
                              />
                            </label>
                            <button
                              onClick={() =>
                                action(() =>
                                  wf.supplement(s, focused.id, materials),
                                )
                              }
                            >
                              提交补充材料
                            </button>
                          </div>
                        ) : (
                          <p className="footnote">
                            客户经理负责核查和办理；经营主体继续按有效合同履约。
                          </p>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <div className="empty compact">
                    <p>选择主体及办理类型，提交模拟融资需求或风险核查。</p>
                  </div>
                )}
              </Panel>
              {(s.tranche || signals.length > 0) && (
                <Panel
                  title="按获批条件执行与复核提示"
                  subtitle="提款、归还按执行投影生成模拟凭证；复核提示只供客户经理判断，不改变额度、借款或审批状态。"
                  action={
                    s.role === "BANK" && signals.length ? (
                      <button
                        className="secondary small"
                        onClick={() =>
                          action(
                            () => wf.submitBank(s, "A", "RISK_REVIEW"),
                            "已依据复核提示发起风险核查",
                          )
                        }
                      >
                        依据提示发起风险核查
                      </button>
                    ) : null
                  }
                >
                  {s.tranche && (() => {
                    const live = s.tranche.ruleHash === s.effective!.hash,
                      before = simulate(
                        (s.draft ?? s.effective!).plan,
                        { ...s.effective!.config, facility_changes: s.facilityChanges, tranche: null },
                        deterministic(s.effective!.freeze),
                      )!,
                      after = live ? projection : draftResults?.afterExec ?? projection,
                      j = s.tranche.batches[0];
                    return (
                      <>
                        <Table
                          headers={["项目", "获批前（现有额度）", "按获批条件"]}
                          rows={[
                            ["专项状态", "—", live ? `已进入执行投影；${date(s.tranche.openDay)}起可提，${date(s.tranche.closeDay)}截止，${date(s.tranche.maturityDay)}到期` : "已回填回执；相关规则生效后进入执行投影"],
                            [`第${j + 1}批采购`, date(before.order_days[j]), date(after.order_days[j])],
                            [`第${j + 1}批成品回款`, date(before.external_receipt_days[j]), date(after.external_receipt_days[j])],
                            ["专项提款 / 归还", "—", after.tranche_first_draw_day >= 0 ? `${date(after.tranche_first_draw_day)}提用${money(after.tranche_draws, 3)}万元；${date(after.tranche_clear_day)}归还` : "投影内未提用"],
                            ["甲借款峰值（一般 / 合计）", `${money(before.general_peak_A, 3)} / ${money(before.peak_A, 3)}万元`, `${money(after.general_peak_A, 3)} / ${money(after.peak_A, 3)}万元`],
                            ["甲利息", num(before.interest_A) + "元", num(after.interest_A) + "元"],
                            ["甲清偿 / 业务结清", `${date(before.settlement_day_A)} / ${date(before.business_settlement_day)}`, `${date(after.settlement_day_A)} / ${date(after.business_settlement_day)}`],
                            ["专项到期余额", "—", money(after.tranche_due_at_maturity, 3) + "万元"],
                          ]}
                        />
                      </>
                    );
                  })()}
                  {signals.length ? (
                    <ul className="signal-list">
                      {signals.map((g) => (
                        <li key={g.key}>
                          <Tag tone={g.level === "关注" ? "red" : "amber"}>{g.level}</Tag> {g.text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="footnote">当前执行投影与已登记材料未出现需要复核的情形。</p>
                  )}
                </Panel>
              )}
            </>
          ) : (
            empty
          ))}
        {page === 6 &&
          (s.effective && m ? (
            <>
              <div className="toolbar">
                <label>
                  示例成员
                  <select
                    aria-label="示例成员"
                    value={memberBatch}
                    onChange={(e) => setMemberBatch(Number(e.target.value))}
                  >
                    {[0, 2, 4].map((j) => (
                      <option value={j} key={j}>
                        M0{j === 0 ? 1 : j === 2 ? 2 : 3} · 第{j + 1}批1吨
                      </option>
                    ))}
                  </select>
                </label>
                <Tag>本人参与 · 有效合同 · 实际履约 · 支付回执</Tag>
              </div>
              <div className="split">
                <Panel
                  title="本人款项卡"
                  subtitle="按本人对应批次及有效收购合同核对，金额单位：元。"
                >
                  <Table
                    headers={["核对项目", "本人记录"]}
                    rows={[
                      ["参与批次", `第${m.batch}批，1吨（模拟参与及授权记录）`],
                      ["合同收购价款", m.contractTotal.toLocaleString() + "元"],
                      ["已核验预付款", m.prepay.toLocaleString() + "元"],
                      ["已形成应付尾款", m.tail.toLocaleString() + "元"],
                      ["已核验实付尾款", num(m.paid) + "元"],
                      ["尾款未付", num(m.outstanding) + "元"],
                      [
                        "状态",
                        <Tag
                          tone={
                            m.status.startsWith("已支付") ? "green" : "amber"
                          }
                        >
                          {m.status}
                        </Tag>,
                      ],
                      [
                        "验收依据",
                        m.acceptDay === null
                          ? "等待本人批次验收记录"
                          : date(m.acceptDay) + "验收记录已核验",
                      ],
                      [
                        "支付依据",
                        m.receiptIds.join("、") || "等待银行支付回执核验",
                      ],
                    ]}
                  />
                  <p className="footnote">
                    本例同批成员按约定每吨比例核对尾款。验收形成应付，银行支付回执核验后记录实付。
                  </p>
                </Panel>
                <Panel title="款项性质与核对反馈">
                  <div className="notice">
                    商品货款按收购合同核对；实际服务报酬按有效服务约定处理；经营结余经核算后，符合条件的盈余分配另行记录。
                  </div>
                  <p>
                    本例成员未承担服务事项，当前未形成服务报酬及盈余分配应付款。组织的经营结余和乙的成品回款分别保留自身依据。
                  </p>
                  <label>
                    需要核对的事项
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="例如：本人批次已验收，尾款支付记录仍需核对"
                    />
                  </label>
                  <button
                    disabled={s.role !== "MEMBER"}
                    onClick={() =>
                      action(() =>
                        wf.addDispute(s, question, "第" + m.batch + "批成员"),
                      )
                    }
                  >
                    以成员身份提出核对
                  </button>
                  {s.role !== "MEMBER" && (
                    <button
                      className="text-button"
                      onClick={() => role("MEMBER")}
                    >
                      切换成员视图
                    </button>
                  )}
                </Panel>
              </div>
              <Panel title="核对事项与处理结果">
                {s.disputes.length ? (
                  s.disputes.map((x) => (
                    <div className="dispute" key={x.id}>
                      <div>
                        <strong>{x.member}</strong>
                        <Tag tone={x.closed ? "green" : "amber"}>
                          {x.closed ? "已反馈" : "待核对"}
                        </Tag>
                      </div>
                      <p>{x.message}</p>
                      <p className="muted">
                        {x.reply || "等待合作组织核对依据并反馈"}
                      </p>
                      {s.role === "COOP" && !x.closed && (
                        <div className="toolbar">
                          <input
                            aria-label="成员核对回复"
                            value={reply}
                            onChange={(e) => setReply(e.target.value)}
                            placeholder="填写依据及处理说明"
                          />
                          <button
                            onClick={() =>
                              action(() => wf.replyDispute(s, x.id, reply))
                            }
                          >
                            反馈核对结果
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="muted">暂无待核对事项。</p>
                )}
              </Panel>
            </>
          ) : (
            empty
          ))}
        {page === 7 && (
          <>
            <div className="toolbar">
              <button
                onClick={() =>
                  download("工银边贸智链_业务档案.json", {
                    schema: 2,
                    state: s,
                  })
                }
              >
                导出业务档案
              </button>
              <Tag>仅保存本机模拟业务</Tag>
            </div>
            <Panel title="规则与确认版本">
              <Table
                headers={["版本", "状态", "摘要", "确认主体", "依据"]}
                rows={[
                  ...(s.effective
                    ? [
                        [
                          s.effective.version,
                          "当前有效",
                          s.effective.hash,
                          s.effective.confirmed.join("、"),
                          "有效合同及模拟确认记录",
                        ],
                      ]
                    : []),
                  ...(s.draft
                    ? [
                        [
                          s.draft.version,
                          "待确认草案",
                          s.draft.hash,
                          s.draft.confirmed.join("、"),
                          s.draft.basedOn,
                        ],
                      ]
                    : []),
                  ...s.history.map((x) => [
                    x.version,
                    "历史版本",
                    x.hash,
                    x.confirmed.join("、"),
                    "保留历史履约依据",
                  ]),
                ]}
              />
            </Panel>
            <Panel
              title="连续业务留痕"
              subtitle="记录主体、时点、业务动作与处理说明。"
            >
              <Table
                headers={["序号", "业务时点", "操作角色", "事项", "记录"]}
                rows={s.audit
                  .slice()
                  .reverse()
                  .map((x) => [
                    x.seq,
                    "第" + x.day + "日",
                    ROLES[x.actor],
                    x.action,
                    x.detail,
                  ])}
              />
            </Panel>
            <Panel title="运行范围">
              <p>
                当前原型在浏览器本机保存模拟经营、材料核验与银行反馈。现金流与情景分析由确定性程序计算，规则摘要用于版本比对。真实身份认证、外部平台接口、跨机构联盟链及真实银行审批支付按试点条件建设。
              </p>
              <p className="footnote">
                模型台账覆盖本组业务。企业整体负债、其他收支及偿债能力由银行结合完整资料核查。
              </p>
            </Panel>
          </>
        )}
        <footer>
          <span>数字化联合测算 → 共同规则执行 → 金融需求转译</span>
          <span>模拟数据 · 授权视图 · 独立审核</span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
