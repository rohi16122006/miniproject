const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function getDrugs() {
  const r = await fetch(`${BASE}/drugs`);
  if (!r.ok) throw new Error("Could not load the drug list. Is the backend running on port 8000?");
  return r.json();
}

export async function simulate(payload) {
  const r = await fetch(`${BASE}/simulate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(typeof e.detail === "string" ? e.detail : "Check the patient values and try again.");
  }
  return r.json();
}
export async function forecast(payload) {
  const r = await fetch(`${BASE}/forecast`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(typeof e.detail === "string" ? e.detail : "Could not compute AI forecast.");
  }
  return r.json();
}

export async function getHealth() {
  try {
    const r = await fetch(`${BASE}/health`);
    if (!r.ok) return { status: "offline", version: "unknown", ml_model_loaded: false };
    return r.json();
  } catch {
    return { status: "offline", version: "unknown", ml_model_loaded: false };
  }
}

export async function getHistory(limit = 50) {
  const r = await fetch(`${BASE}/history?limit=${limit}`);
  if (!r.ok) throw new Error("Could not load simulation history.");
  return r.json();
}

export async function getHistoryItem(runId) {
  const r = await fetch(`${BASE}/history/${runId}`);
  if (!r.ok) throw new Error("Could not load historical simulation record.");
  return r.json();
}

export async function optimizeDrug(patient, horizon_h = 24) {
  const r = await fetch(`${BASE}/optimize_drug?horizon_h=${horizon_h}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patient),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(typeof e.detail === "string" ? e.detail : "Could not optimize drug regimen.");
  }
  return r.json();
}

export async function getFuturePrognosis(payload) {
  const r = await fetch(`${BASE}/future_prognosis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(typeof e.detail === "string" ? e.detail : "Could not calculate future prognosis.");
  }
  return r.json();
}
