import assert from "node:assert/strict";
import test from "node:test";
import { analyzeECG, forecast, getECGModelStatus, predictECG } from "./client.js";
import { FORECAST_CSV_HEADER, parseForecastCsv, toForecastRequest } from "../forecastInput.js";

const originalFetch = globalThis.fetch;
const startTime = Date.parse("2026-10-26T09:00:00.000Z");
const csvRows = Array.from({ length: 30 }, (_, index) =>
  `${new Date(startTime + index * 10_000).toISOString()},120,80,72,0`
);
const measurements = parseForecastCsv([FORECAST_CSV_HEADER, ...csvRows].join("\n"));
const validRequest = toForecastRequest(measurements, "imported_recording");

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("posts measured arrays to the existing forecast API and returns the prediction", async () => {
  let requestUrl;
  let requestOptions;
  const responseBody = {
    horizon_s: 300,
    sbp: 124.5,
    dbp: 78.2,
    hr: 74,
    persistence: { sbp: 120, dbp: 80, hr: 72 },
    model_version: "xgb-0.1",
    timestamps: measurements.map((row) => row.timestamp),
    provenance: "imported_recording",
    timestamp_basis: "UTC-normalized observation timestamps",
    predicted_at: "2026-10-26T09:09:50.000Z",
  };
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  assert.deepEqual(await forecast(validRequest), responseBody);
  assert.equal(requestUrl, "http://localhost:8000/forecast");
  assert.equal(requestOptions.method, "POST");
  assert.deepEqual(JSON.parse(requestOptions.body), validRequest);
});

test("surfaces forecast API errors to the caller", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: "No trained model found." }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });

  await assert.rejects(forecast(validRequest), /No trained model found/);
});

test("surfaces backend connection failures to the caller", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("network unavailable");
  };

  await assert.rejects(forecast(validRequest), /Cannot reach the DigiTwin backend/);
});

test("uploads ECG report and signal metadata as multipart form data", async () => {
  let requestUrl;
  let requestOptions;
  const result = { analysis_id: 8, detected_format: "CSV waveform" };
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const file = new Blob(["time_s,Lead II\n0,0\n"], { type: "text/csv" });
  const response = await analyzeECG({
    file: new File([file], "ecg.csv", { type: "text/csv" }),
    samplingRateHz: "500",
    units: "mV",
    runId: 12,
    ocrText: "HR: 72",
  });
  assert.deepEqual(response, result);
  assert.equal(requestUrl, "http://localhost:8000/ecg/analyze");
  assert.equal(requestOptions.method, "POST");
  assert.equal(requestOptions.headers, undefined);
  assert.equal(requestOptions.body.get("file").name, "ecg.csv");
  assert.equal(requestOptions.body.get("sampling_rate_hz"), "500");
  assert.equal(requestOptions.body.get("units"), "mV");
  assert.equal(requestOptions.body.get("run_id"), "12");
  assert.equal(requestOptions.body.get("ocr_text"), "HR: 72");
});

test("uploads supported waveform for optional model inference", async () => {
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = url;
    return new Response(JSON.stringify({ available: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const file = new File(["signal"], "ecg.csv", { type: "text/csv" });
  await predictECG({ file, samplingRateHz: "100", units: "mV" });
  assert.equal(requestUrl, "http://localhost:8000/ecg/predict");

  globalThis.fetch = async () => new Response(JSON.stringify({ available: false }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  assert.deepEqual(await getECGModelStatus(), { available: false });
});

test("surfaces ECG endpoint errors to the caller", async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ detail: "Unsupported file type." }),
    { status: 422, headers: { "Content-Type": "application/json" } }
  );
  await assert.rejects(
    analyzeECG({ file: new File(["data"], "bad.bin") }),
    /Unsupported file type/
  );
});
