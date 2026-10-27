import Trend from "./Trend.jsx";
import { MODEL_MAP_CHART_LINE } from "../simulationDisplay.js";

export default function BPChart({ data }) {
  return (
    <Trend
      title="Blood Pressure"
      unit="mmHg"
      data={data}
      height={340}
      lines={[
        { key: "sbp", name: "Systolic (Simulated)", color: "#DC2626", w: 2.5 },
        MODEL_MAP_CHART_LINE,
        { key: "dbp", name: "Diastolic (Simulated)", color: "#2563EB", w: 2 },
        { key: "base_sbp", name: "Baseline Systolic", color: "#9CA3AF", w: 1.5, dash: "5 4" },
        { key: "base_dbp", name: "Baseline Diastolic", color: "#9CA3AF", w: 1.5, dash: "3 3" },
      ]}
      refs={[
        { y: 90, text: "Low BP limit (90 mmHg)", color: "#DC2626" },
        { y: 140, text: "High BP threshold (140 mmHg)", color: "#D97706" },
      ]}
    />
  );
}
