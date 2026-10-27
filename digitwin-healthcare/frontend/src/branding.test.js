import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("./pages/Dashboard.jsx", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const logo = readFileSync(new URL("../public/assets/digitwin-logo.svg", import.meta.url), "utf8");
const favicon = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");

test("removed dashboard notice does not appear", () => {
  assert.ok(!dashboard.includes(
    "Simulations are hypothetical, not prescribing or safety advice. Runs are saved locally; use synthetic or de-identified inputs and do not enter patient names or other identifiers."
  ));
  assert.ok(!dashboard.includes("Academic research prototype only."));
});

test("header uses the custom accessible DigiTwin wordmark", () => {
  assert.ok(dashboard.includes('src="/assets/digitwin-logo.svg"'));
  assert.ok(dashboard.includes('alt="DigiTwin — Cardiovascular Simulation Platform"'));
  assert.match(logo, /<svg[^>]+viewBox="0 0 228 48"/);
  assert.ok(logo.includes("DigiTwin"));
  assert.ok(logo.includes("<path"));
  assert.ok(logo.includes("<circle"));
});

test("browser tab references a local vector favicon", () => {
  assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'));
  assert.match(favicon, /<svg[^>]+viewBox="0 0 48 48"/);
  assert.ok(favicon.includes("<path"));
});

test("ECG analysis has a workspace tab independent of simulation results", () => {
  assert.ok(dashboard.includes('aria-label="DigiTwin workspace"'));
  assert.ok(dashboard.includes('aria-selected={workspaceTab === "ecg"}'));
  assert.ok(dashboard.includes('id="ecg-analysis-workspace"'));
  assert.ok(dashboard.includes("onFileSelected={setECGReportFile}"));
});
