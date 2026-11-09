import fs from "node:fs";
import { build } from "esbuild";
import assert from "node:assert/strict";
await build({
  entryPoints: ["src/engine.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "verification/engine.mjs",
});
const { simulate } = await import("../verification/engine.mjs?" + Date.now());
const fixtures = JSON.parse(fs.readFileSync("tests/reference.json", "utf8"));
let checks = 0;
function compare(actual, expected, name) {
  if (expected === null) {
    assert.ok(
      actual === null || actual === Infinity || Number.isNaN(actual),
      name,
    );
    checks++;
    return;
  }
  if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, name);
    expected.forEach((v, i) => compare(actual[i], v, name + "[" + i + "]"));
    return;
  }
  if (typeof expected === "boolean") {
    assert.equal(actual, expected, name);
    checks++;
    return;
  }
  assert.ok(
    Math.abs(actual - expected) < 0.00002,
    `${name}: ${actual} / ${expected}`,
  );
  checks++;
}
for (const f of fixtures) {
  const r = simulate(f.plan, f.config, f.scenario, { trace: true });
  for (const [key, v] of Object.entries(f.expected))
    compare(r[key], v, f.name + "." + key);
  for (const row of f.trace) {
    const day = r.days.find((x) => x.day === row.day);
    for (const [key, v] of Object.entries(row))
      if (key !== "phase")
        compare(day[key], v, f.name + ".day" + row.day + "." + key);
  }
  assert.ok(
    r.conservation_max_abs_error < 0.00002,
    f.name + " funds conservation",
  );
}
fs.writeFileSync(
  "verification/model-checks.json",
  JSON.stringify(
    { referenceCases: fixtures.length, scalarChecks: checks, status: "PASS" },
    null,
    2,
  ),
);
console.log(
  `PASS: ${fixtures.length} reference paths, ${checks} numerical checks`,
);
