/**
 * Clinical formatting and display helpers for post-simulation safer drug recommendations.
 */

export function shouldMaintainCurrentDrug(drugSafety) {
  if (!drugSafety) return false;
  return Boolean(drugSafety.same_drug_is_okay);
}

export function getSaferDrugRecommendationSummary(drugSafety, patientName = "Patient") {
  if (!drugSafety) {
    return {
      status: "pending",
      headline: "Awaiting simulation results...",
      badge: "Pending",
      action: "none",
      recommendedDrug: null,
    };
  }

  const isSafe = Boolean(drugSafety.same_drug_is_okay);
  const safestLabel = drugSafety.safest_label || drugSafety.safest_drug || "Unknown";
  const safestDose = drugSafety.safest_dose;
  const safestInterval = drugSafety.safest_interval;

  if (isSafe) {
    return {
      status: "safe",
      isSafe: true,
      headline: `Current Medication Approved: ${safestLabel}`,
      badge: "Verified Safe for Next Simulation",
      badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
      action: "maintain",
      recommendedDrug: drugSafety.safest_drug,
      recommendedLabel: safestLabel,
      dose_mg: safestDose,
      interval_h: safestInterval,
      message:
        drugSafety.status_message ||
        `Current medication is safe and effective for ${patientName}. Maintain same medication for next simulation.`,
      rationale: drugSafety.safest_rationale,
      score: drugSafety.safest_score,
    };
  }

  return {
    status: "unsafe",
    isSafe: false,
    headline: drugSafety.status_headline || `Safer Drug Required for ${patientName}`,
    badge: "Safer Alternative Drug Required",
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
    action: "switch",
    recommendedDrug: drugSafety.safest_drug,
    recommendedLabel: safestLabel,
    dose_mg: safestDose,
    interval_h: safestInterval,
    message:
      drugSafety.status_message ||
      `Current medication breached safety limits or is contraindicated. Recommended safer drug: ${safestLabel}.`,
    rationale: drugSafety.safest_rationale,
    score: drugSafety.safest_score,
    switchRegimen: drugSafety.switch_regimen || [],
  };
}
