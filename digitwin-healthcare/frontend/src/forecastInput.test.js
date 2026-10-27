import assert from "node:assert/strict";
import test from "node:test";
import {
  FORECAST_CSV_HEADER,
  getForecastDisplay,
  parseForecastCsv,
  toForecastRequest,
} from "./forecastInput.js";

function makeCsv({
  count = 30,
  timestampAt = (index) => Date.parse("2026-10-26T09:00:00.000Z") + index * 10_000,
  rowAt = () => "120,80,72,0",
} = {}) {
  const rows = Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(timestampAt(index)).toISOString();
    return `${timestamp},${rowAt(index)}`;
  });
  return [FORECAST_CSV_HEADER, ...rows].join("\n");
}

test("parses a complete timestamped window into the exact forecast arrays", () => {
  const measurements = parseForecastCsv(makeCsv({
    rowAt: (index) => `${120 + index * 0.2},${80 + index * 0.1},${72 + index * 0.1},${index < 15 ? 0 : 0.1}`,
  }));
  const request = toForecastRequest(measurements, "imported_recording");

  assert.equal(measurements.length, 30);
  assert.deepEqual(Object.keys(request), ["timestamps", "sbp", "dbp", "hr", "drug_rate", "provenance"]);
  assert.equal(request.timestamps.length, 30);
  assert.equal(request.timestamps[0], measurements[0].timestamp);
  assert.equal(request.provenance, "imported_recording");
  assert.equal(request.sbp[0], 120);
  assert.equal(request.sbp[29], 125.8);
  assert.equal(request.dbp[29], 82.9);
  assert.equal(request.hr[29], 74.9);
  assert.deepEqual(request.drug_rate.slice(0, 15), Array(15).fill(0));
  assert.deepEqual(request.drug_rate.slice(15), Array(15).fill(0.1));
});

test("rejects missing measurement samples", () => {
  assert.throws(() => parseForecastCsv(makeCsv({ count: 29 })), /exactly 30/);
});

test("rejects missing timestamp and missing drug-rate fields", () => {
  const rows = makeCsv().split("\n");
  rows[1] = rows[1].replace(/^[^,]+,/, "");
  assert.throws(() => parseForecastCsv(rows.join("\n")), /timestamp and all four measured values/);

  const withoutRate = makeCsv().replace(",120,80,72,0", ",120,80,72");
  assert.throws(() => parseForecastCsv(withoutRate), /all four measured values/);
});

test("rejects timestamps without timezone or with incorrect intervals", () => {
  const rows = makeCsv().split("\n");
  rows[1] = rows[1].replace(/Z,/, ",");
  assert.throws(() => parseForecastCsv(rows.join("\n")), /ISO 8601 with a timezone/);
  rows[1] = rows[1].replace("2026-10-26", "2026-02-30").replace(",", "Z,");
  assert.throws(() => parseForecastCsv(rows.join("\n")), /invalid timestamp/);

  assert.throws(
    () => parseForecastCsv(makeCsv({ timestampAt: (index) => 1_798_129_800_000 + index * 11_000 })),
    /exactly 10 seconds apart/
  );
  assert.throws(
    () => parseForecastCsv(makeCsv({ timestampAt: (index) => 1_798_129_800_000 - index * 10_000 })),
    /chronological order/
  );
});

test("rejects missing, non-numeric, non-finite, and out-of-range values", () => {
  assert.throws(() => parseForecastCsv(makeCsv({ rowAt: () => "120,80,72," })), /all four measured values/);
  assert.throws(() => parseForecastCsv(makeCsv({ rowAt: () => "120,80,NaN,0" })), /non-numeric or non-finite/);
  assert.throws(() => parseForecastCsv(makeCsv({ rowAt: () => "120,80,251,0" })), /20 to 250 bpm/);
  assert.throws(() => parseForecastCsv(makeCsv({ rowAt: () => "70,80,72,0" })), /SBP > DBP/);
  assert.throws(() => parseForecastCsv(makeCsv({ rowAt: () => "120,80,72,-1" })), /zero or greater/);
});

test("formats model outputs as predictions at the returned forecast horizon", () => {
  const measurements = parseForecastCsv(makeCsv());
  measurements[29].timestampMs = Date.parse("2026-10-26T09:04:50.000Z");
  measurements[29].timestamp = "2026-10-26T09:04:50Z";
  const display = getForecastDisplay({
    horizon_s: 300,
    sbp: 124.5,
    dbp: 78.2,
    hr: 74,
    model_version: "xgb-0.1",
    timestamps: measurements.map((row) => row.timestamp),
    provenance: "manual_entry",
    timestamp_basis: "UTC observation time",
    predicted_at: "2026-10-26T09:09:50.000Z",
  }, measurements);

  assert.equal(display.predictedAt, "2026-10-26T09:09:50.000Z");
  assert.equal(display.model_version, "xgb-0.1");
  assert.equal(display.provenance, "manual_entry");
  assert.equal(display.timestamp_basis, "UTC observation time");
  assert.equal(display.sbp, 124.5);
});

test("rejects malformed prediction responses instead of displaying placeholders", () => {
  const measurements = parseForecastCsv(makeCsv());
  assert.throws(
    () => getForecastDisplay({
      horizon_s: 300,
      sbp: "not-a-number",
      dbp: 80,
      hr: 70,
      model_version: "xgb-0.1",
      timestamps: measurements.map((row) => row.timestamp),
      provenance: "manual_entry",
      timestamp_basis: "UTC observation time",
      predicted_at: "2026-10-26T09:09:50.000Z",
    }, measurements),
    /invalid predicted values/
  );
  assert.throws(
    () => getForecastDisplay({
      horizon_s: 300,
      sbp: 120,
      dbp: 80,
      hr: 70,
      timestamps: measurements.map((row) => row.timestamp),
      provenance: "manual_entry",
      timestamp_basis: "UTC observation time",
      predicted_at: "2026-10-26T09:09:50.000Z",
    }, measurements),
    /model version/
  );
  assert.throws(
    () => getForecastDisplay({
      horizon_s: 300,
      sbp: 120,
      dbp: 80,
      hr: 70,
      model_version: "xgb-0.1",
      timestamps: measurements.map((row) => row.timestamp).reverse(),
      provenance: "manual_entry",
      timestamp_basis: "UTC observation time",
      predicted_at: "2026-10-26T09:09:50.000Z",
    }, measurements),
    /timestamps do not match/
  );
});
