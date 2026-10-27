import Trend from "./Trend.jsx";

export default function HRChart({ data }) {
  return (
    <Trend
      title="Heart Rate"
      unit="bpm"
      data={data}
      height={260}
      lines={[
        { key: "hr", name: "Simulated Heart Rate", color: "#E11D48", w: 2.5 },
        { key: "base_hr", name: "Baseline Heart Rate", color: "#9CA3AF", w: 1.5, dash: "4 4" },
      ]}
      refs={[
        { y: 50, text: "Low HR (50 bpm)", color: "#DC2626" },
        { y: 100, text: "High HR (100 bpm)", color: "#D97706" },
      ]}
    />
  );
}
