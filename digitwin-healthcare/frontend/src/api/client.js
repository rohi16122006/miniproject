const BASE =
  import.meta.env?.VITE_API_URL !== undefined && import.meta.env?.VITE_API_URL !== ""
    ? import.meta.env.VITE_API_URL
    : (typeof window !== "undefined" && window.location?.origin && !window.location.origin.includes(":5173"))
      ? ""
      : "http://localhost:8000";

async function apiFetch(path, options) {
  try {
    return await fetch(`${BASE}${path}`, options);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Cannot reach the DigiTwin backend at ${BASE}. Start it from the backend folder with: python -m uvicorn app.main:app --reload`
      );
    }
    throw error;
  }
}

export async function getDrugs() {
  const r = await apiFetch("/drugs");
  if (!r.ok) throw new Error("Could not load the drug list. Is the backend running on port 8000?");
  return r.json();
}

export async function simulate(payload) {
  const r = await apiFetch("/simulate", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(typeof e.detail === "string" ? e.detail : "Check the patient values and try again.");
  }
  return r.json();
}
export async function forecast(payload) {
  const r = await apiFetch("/forecast", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(typeof e.detail === "string" ? e.detail : "Could not compute AI forecast.");
  }
  return r.json();
}

async function formRequest(path, formData, fallback) {
  const r = await apiFetch(path, { method: "POST", body: formData });
  if (!r.ok) {
    const error = await r.json().catch(() => ({}));
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : Array.isArray(error.detail)
          ? error.detail.map((item) => item.msg).join("; ")
          : fallback
    );
  }
  return r.json();
}

export async function analyzeECG({ file, samplingRateHz, units, runId, ocrText }) {
  const formData = new FormData();
  formData.append("file", file);
  if (samplingRateHz) formData.append("sampling_rate_hz", samplingRateHz);
  if (units) formData.append("units", units);
  if (runId != null) formData.append("run_id", String(runId));
  if (ocrText) formData.append("ocr_text", ocrText);
  return formRequest("/ecg/analyze", formData, "Could not analyze the ECG file.");
}

export async function predictECG({ file, samplingRateHz, units }) {
  const formData = new FormData();
  formData.append("file", file);
  if (samplingRateHz) formData.append("sampling_rate_hz", samplingRateHz);
  if (units) formData.append("units", units);
  return formRequest("/ecg/predict", formData, "Could not run the ECG model.");
}

export async function getECGModelStatus() {
  const r = await apiFetch("/ecg/model");
  if (!r.ok) throw new Error("Could not load ECG model status.");
  return r.json();
}

export async function getHealth() {
  try {
    const r = await apiFetch("/health");
    if (!r.ok) return { status: "offline", version: "unknown", ml_model_loaded: false };
    return r.json();
  } catch {
    return { status: "offline", version: "unknown", ml_model_loaded: false };
  }
}
