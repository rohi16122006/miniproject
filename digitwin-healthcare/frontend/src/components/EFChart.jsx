import Trend from "./Trend.jsx";

export default function EFChart({ data }) {
  return (
    <Trend
      title="Ejection Fraction"
      unit="%"
      data={data}
      height={260}
      lines={[
        { key: "ef", name: "Simulated EF", color: "#7C3AED", w: 2.5 },
        { key: "base_ef", name: "Baseline EF", color: "#9CA3AF", w: 1.5, dash: "4 4" },
      ]}
      refs={[
        { y: 50, text: "Normal limit (50%)", color: "#059669" },
        { y: 40, text: "Low EF threshold (40%)", color: "#DC2626" },
      ]}
    />
  );
}
