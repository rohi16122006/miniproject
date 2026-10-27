export const FORECAST_SAMPLE_COUNT = 30;
export const FORECAST_INTERVAL_MS = 10_000;
export const FORECAST_CSV_HEADER =
  "timestamp,sbp_mmhg,dbp_mmhg,hr_bpm,drug_rate_ml_h";

const HEADERS = FORECAST_CSV_HEADER.split(",");

export function parseForecastCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length || lines[0] !== FORECAST_CSV_HEADER) {
    throw new Error(`CSV header must be exactly: ${FORECAST_CSV_HEADER}`);
  }

  const rows = lines.slice(1);
  if (rows.length !== FORECAST_SAMPLE_COUNT) {
    throw new Error(`Provide exactly 30 measurement rows; found ${rows.length}.`);
  }

  const measurements = rows.map((line, index) => {
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells.length !== HEADERS.length || cells.some((cell) => !cell)) {
      throw new Error(`Row ${index + 1} must contain timestamp and all four measured values.`);
    }

    const [timestamp, sbpText, dbpText, hrText, drugRateText] = cells;
    const timestampParts = timestamp.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/
    );
    if (!timestampParts) {
      throw new Error(`Row ${index + 1} timestamp must be ISO 8601 with a timezone, e.g. 2026-10-26T09:00:00Z.`);
    }
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHour, offsetMinute] = timestampParts;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const daysInMonth = month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 0;
    if (
      day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59 ||
      (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))
    ) {
      throw new Error(`Row ${index + 1} has an invalid timestamp.`);
    }
    const timestampMs = Date.parse(timestamp);
    if (!Number.isFinite(timestampMs)) {
      throw new Error(`Row ${index + 1} has an invalid timestamp.`);
    }

    const values = [sbpText, dbpText, hrText, drugRateText].map(Number);
    if (!values.every(Number.isFinite)) {
      throw new Error(`Row ${index + 1} contains a non-numeric or non-finite measurement.`);
    }
    const [sbp, dbp, hr, drug_rate] = values;
    if (sbp < 40 || sbp > 300 || dbp < 40 || dbp > 300 || sbp <= dbp) {
      throw new Error(`Row ${index + 1} has invalid blood pressure; require SBP > DBP and both values from 40 to 300 mmHg.`);
    }
    if (hr < 20 || hr > 250) {
      throw new Error(`Row ${index + 1} heart rate must be from 20 to 250 bpm.`);
    }
    if (drug_rate < 0) {
      throw new Error(`Row ${index + 1} drug infusion rate must be zero or greater in mL/hour.`);
    }

    return { timestamp, timestampMs, sbp, dbp, hr, drug_rate };
  });

  for (let index = 1; index < measurements.length; index += 1) {
    const interval = measurements[index].timestampMs - measurements[index - 1].timestampMs;
    if (interval !== FORECAST_INTERVAL_MS) {
      throw new Error(`Rows ${index} and ${index + 1} must be exactly 10 seconds apart and in chronological order.`);
    }
  }

  return measurements;
}

export function toForecastRequest(measurements, provenance) {
  if (!["manual_entry", "imported_recording", "synthetic_demo"].includes(provenance)) {
    throw new Error("Select a valid data provenance before requesting a forecast.");
  }
  return {
    timestamps: measurements.map((row) => row.timestamp),
    sbp: measurements.map((row) => row.sbp),
    dbp: measurements.map((row) => row.dbp),
    hr: measurements.map((row) => row.hr),
    drug_rate: measurements.map((row) => row.drug_rate),
    provenance,
  };
}

export function getForecastDisplay(result, measurements) {
  const horizonSeconds = Number(result?.horizon_s);
  if (!Number.isFinite(horizonSeconds) || horizonSeconds <= 0) {
    throw new Error("The forecast response did not include a valid horizon.");
  }
  if (!Array.isArray(measurements) || measurements.length !== 30 ||
    !Number.isFinite(measurements[measurements.length - 1]?.timestampMs)) {
    throw new Error("The complete timestamped observation window is required.");
  }
  if (typeof result.model_version !== "string" || !result.model_version.trim()) {
    throw new Error("The forecast response did not include a model version.");
  }
  if (!Array.isArray(result.timestamps) || result.timestamps.length !== measurements.length ||
    result.timestamps.some((timestamp, index) =>
      Date.parse(timestamp) !== measurements[index].timestampMs
    )) {
    throw new Error("The forecast response timestamps do not match the submitted observations.");
  }
  if (result.provenance !== "manual_entry" &&
    result.provenance !== "imported_recording" &&
    result.provenance !== "synthetic_demo") {
    throw new Error("The forecast response did not include a valid data provenance.");
  }
  if (typeof result.timestamp_basis !== "string" || !result.timestamp_basis.trim()) {
    throw new Error("The forecast response did not include a timestamp basis.");
  }
  const values = [result.sbp, result.dbp, result.hr].map(Number);
  if (!values.every(Number.isFinite)) {
    throw new Error("The forecast response contains invalid predicted values.");
  }

  const predictedAtMs = measurements[measurements.length - 1].timestampMs + horizonSeconds * 1000;
  if (Date.parse(result.predicted_at) !== predictedAtMs) {
    throw new Error("The forecast response prediction timestamp does not match its horizon.");
  }
  return {
    ...result,
    sbp: values[0],
    dbp: values[1],
    hr: values[2],
    predictedAt: result.predicted_at,
  };
}
