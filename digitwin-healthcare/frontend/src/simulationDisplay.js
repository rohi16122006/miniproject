export const APPROXIMATE_MAP_LABEL = "Approx. MAP (DBP + PP/3)";
export const MODEL_DERIVED_MAP_LABEL = "Model-derived MAP";

export const MODEL_MAP_CHART_LINE = {
  key: "map",
  name: MODEL_DERIVED_MAP_LABEL,
  color: "#0D9488",
  w: 2,
};

export function buildSimulationDisplay(result) {
  const data = result?.series.map((sample, index) => {
    const concentrationValues = {};
    if (result.concentrations) {
      Object.entries(result.concentrations).forEach(([drugKey, values]) => {
        concentrationValues[`conc_${drugKey}`] = values[index] ?? 0;
      });
    }
    return {
      ...sample,
      ...concentrationValues,
      base_sbp: result.baseline.sbp,
      base_dbp: result.baseline.dbp,
      base_hr: result.baseline.hr,
      base_ef: result.baseline.ef,
    };
  });

  return {
    chartData: data,
    finalPoint: result?.series.at(-1),
  };
}

export function formatTooltipValue(value) {
  return typeof value === "number" ? value.toFixed(1) : value;
}
