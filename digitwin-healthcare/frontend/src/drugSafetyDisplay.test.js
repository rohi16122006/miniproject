import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldMaintainCurrentDrug,
  getSaferDrugRecommendationSummary,
} from "./drugSafetyDisplay.js";

test("identifies when current drug is verified safe and should be maintained for next simulation", () => {
  const drugSafety = {
    same_drug_is_okay: true,
    suggested_action: "maintain",
    status_headline: "Current Medication (Amlodipine) is Safe & Indicated",
    status_message: "Current medication is verified safe. Continue current medication.",
    safest_drug: "amlodipine",
    safest_label: "Amlodipine (calcium channel blocker)",
    safest_score: 96,
    safest_dose: 5,
    safest_interval: 24,
    safest_rationale: "Therapeutically indicated and maintains safe hemodynamics.",
  };

  assert.equal(shouldMaintainCurrentDrug(drugSafety), true);
  const summary = getSaferDrugRecommendationSummary(drugSafety, "John Doe");
  assert.equal(summary.isSafe, true);
  assert.equal(summary.action, "maintain");
  assert.equal(summary.recommendedDrug, "amlodipine");
  assert.equal(summary.badge, "Verified Safe for Next Simulation");
});

test("identifies when current drug is unsafe and displays required safer alternative", () => {
  const drugSafety = {
    same_drug_is_okay: false,
    suggested_action: "switch",
    status_headline: "Current Drug (Phenylephrine) Unsafe / Contraindicated",
    status_message: "Phenylephrine is contraindicated in hypertension.",
    safest_drug: "amlodipine",
    safest_label: "Amlodipine (calcium channel blocker)",
    safest_score: 95,
    safest_dose: 5,
    safest_interval: 24,
    safest_rationale: "First-line dihydropyridine CCB provides steady 24h pressure control.",
    switch_regimen: [{ drug: "amlodipine", dose_mg: 5, interval_h: 24, n_doses: 1 }],
  };

  assert.equal(shouldMaintainCurrentDrug(drugSafety), false);
  const summary = getSaferDrugRecommendationSummary(drugSafety, "John Doe");
  assert.equal(summary.isSafe, false);
  assert.equal(summary.action, "switch");
  assert.equal(summary.recommendedDrug, "amlodipine");
  assert.equal(summary.badge, "Safer Alternative Drug Required");
  assert.equal(summary.switchRegimen[0].drug, "amlodipine");
});
