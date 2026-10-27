import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROXIMATE_MAP_LABEL,
  buildSimulationDisplay,
  formatTooltipValue,
  MODEL_DERIVED_MAP_LABEL,
  MODEL_MAP_CHART_LINE,
} from "./simulationDisplay.js";

test("MAP labels distinguish the input estimate from the model output", () => {
  assert.equal(APPROXIMATE_MAP_LABEL, "Approx. MAP (DBP + PP/3)");
  assert.equal(MODEL_DERIVED_MAP_LABEL, "Model-derived MAP");
  assert.equal(MODEL_MAP_CHART_LINE.key, "map");
  assert.equal(MODEL_MAP_CHART_LINE.name, MODEL_DERIVED_MAP_LABEL);
});

test("chart tooltip uses its selected timepoint while the summary uses the final point", () => {
  const result = {
    baseline: { sbp: 120, dbp: 80, map: 98.6, hr: 70, ef: 60 },
    series: [
      { t_h: 0, sbp: 120, dbp: 80, map: 98.6, hr: 70, ef: 60 },
      { t_h: 1.417, sbp: 115.4, dbp: 75.3, map: 93.9, hr: 70, ef: 60 },
      { t_h: 2, sbp: 114.3, dbp: 74.3, map: 92.9, hr: 70, ef: 60 },
    ],
  };
  const { chartData, finalPoint } = buildSimulationDisplay(result);
  const selectedTimepoint = chartData.find((sample) => sample.t_h === 1.417);
  const tooltipPayload = [{ name: MODEL_MAP_CHART_LINE.name, value: selectedTimepoint.map }];

  assert.equal(selectedTimepoint.sbp, 115.4);
  assert.equal(selectedTimepoint.dbp, 75.3);
  assert.equal(formatTooltipValue(tooltipPayload[0].value), "93.9");
  assert.equal(finalPoint.t_h, 2);
  assert.equal(finalPoint.sbp, 114.3);
  assert.equal(finalPoint.dbp, 74.3);
  assert.equal(finalPoint.map, 92.9);
});
