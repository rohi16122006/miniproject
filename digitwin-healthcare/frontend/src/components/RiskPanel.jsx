export default function RiskPanel({
  flags = [],
  result = null,
  patient = null,
  regimen = [],
  horizon = 24,
}) {
  const patientName = patient?.name || "Anonymous Patient";
  const patientId = patient?.patient_id || "PT-001";

  // Derive physiological statistics if simulation result exists
  const hasSeries = result?.series && result.series.length > 0;
  const last = hasSeries ? result.series[result.series.length - 1] : null;
  const baseline = result?.baseline || null;

  const minMap = hasSeries ? Math.min(...result.series.map((r) => r.map)) : null;
  const maxMap = hasSeries ? Math.max(...result.series.map((r) => r.map)) : null;
  const minSbp = hasSeries ? Math.min(...result.series.map((r) => r.sbp)) : null;
  const maxSbp = hasSeries ? Math.max(...result.series.map((r) => r.sbp)) : null;
  const minHr = hasSeries ? Math.min(...result.series.map((r) => r.hr)) : null;
  const maxHr = hasSeries ? Math.max(...result.series.map((r) => r.hr)) : null;

  const deltaSbp = last && baseline ? Number((last.sbp - baseline.sbp).toFixed(1)) : 0;
  const deltaMap = last && baseline ? Number((last.map - baseline.map).toFixed(1)) : 0;
  const deltaHr = last && baseline ? Number((last.hr - baseline.hr).toFixed(1)) : 0;

  // Evaluate individual threshold states
  const mapState =
    minMap != null && minMap < 65
      ? { status: "danger", label: "Perfusion Risk (<65 mmHg)", badge: "bg-red-100 text-red-800 border-red-300" }
      : last && last.map > 105
      ? { status: "warning", label: "Elevated MAP (>105 mmHg)", badge: "bg-amber-100 text-amber-800 border-amber-300" }
      : { status: "optimal", label: "Adequate Perfusion (≥65 mmHg)", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" };

  const bpState =
    minSbp != null && minSbp < 90
      ? { status: "danger", label: "Hypotensive (<90 mmHg)", badge: "bg-red-100 text-red-800 border-red-300" }
      : maxSbp != null && maxSbp >= 180
      ? { status: "danger", label: "Severe Hypertensive Peak", badge: "bg-red-100 text-red-800 border-red-300" }
      : last && last.sbp >= 140
      ? { status: "warning", label: "SBP Elevated (>140 mmHg)", badge: "bg-amber-100 text-amber-800 border-amber-300" }
      : deltaSbp <= -8
      ? { status: "optimal", label: "Therapeutic Drop Achieved", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" }
      : { status: "optimal", label: "Normotensive Range", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" };

  const hrState =
    minHr != null && minHr < 50
      ? { status: "danger", label: "Bradycardia Risk (<50 bpm)", badge: "bg-red-100 text-red-800 border-red-300" }
      : maxHr != null && maxHr > 100
      ? { status: "warning", label: "Tachycardia Peak (>100 bpm)", badge: "bg-amber-100 text-amber-800 border-amber-300" }
      : { status: "optimal", label: "Normal Sinus (50-100 bpm)", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" };

  const efState =
    last && last.ef < 40
      ? { status: "warning", label: "Reduced EF (<40%)", badge: "bg-amber-100 text-amber-800 border-amber-300" }
      : { status: "optimal", label: "Preserved Ejection Fraction", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" };

  // Overall status summary
  const hasHigh = flags.some((f) => f.level === "high") || mapState.status === "danger" || bpState.status === "danger" || hrState.status === "danger";
  const hasModerate = flags.some((f) => f.level === "moderate") || mapState.status === "warning" || bpState.status === "warning" || hrState.status === "warning";

  // Generate dynamic clinical summary narrative tailored to this simulation
  const getDynamicSummary = () => {
    if (!last || !baseline) {
      return "Simulation in progress. Dynamic threshold findings will update upon calculation.";
    }

    if (minMap < 65 || minSbp < 90) {
      return `Critical safety alert for ${patientName}: SBP dropped to a minimum of ${minSbp} mmHg (MAP ${minMap} mmHg), breaching the safety threshold floor. High risk of drug-induced hypotension.`;
    }
    if (minHr < 50) {
      return `Chronotropic safety flag for ${patientName}: Heart rate dipped to ${minHr} bpm (below 50 bpm baseline threshold). Close monitoring of beta-blockade or bradycardic agents advised.`;
    }
    if (maxSbp >= 180) {
      return `Severe hypertensive pressure recorded for ${patientName}: Peak SBP reached ${maxSbp} mmHg. Current modeled regimen does not adequately suppress afterload.`;
    }
    if (regimen && regimen.length > 0 && deltaSbp <= -8) {
      return `Favorable therapeutic response for ${patientName} (${patientId}): Modeled therapy lowered SBP by ${Math.abs(deltaSbp)} mmHg (${baseline.sbp} → ${last.sbp} mmHg) while preserving organ perfusion (MAP: ${last.map} mmHg) across ${horizon}h.`;
    }
    if (regimen && regimen.length > 0 && deltaMap >= 8) {
      return `Vascular resistance support confirmed for ${patientName}: Mean arterial pressure increased by +${deltaMap} mmHg to ${last.map} mmHg, maintaining critical tissue perfusion.`;
    }
    if (last.sbp >= 140) {
      return `Persistent hypertension noted for ${patientName}: SBP remains at ${last.sbp} mmHg (target <140 mmHg) at the conclusion of the ${horizon}-hour simulation window.`;
    }
    return `Hemodynamic stability maintained for ${patientName} (${patientId}): Blood pressure (${last.sbp}/${last.dbp} mmHg, MAP: ${last.map} mmHg) and heart rate (${last.hr} bpm) remained well within physiological targets throughout the ${horizon}-hour period.`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
      {/* 1. Header with Patient Identity & Assessment Status */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-100 pb-3 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800">
              Simulation Thresholds &amp; Safety Evaluation
            </h3>
            <span
              className={`text-xs font-bold uppercase px-2.5 py-0.5 rounded border ${
                hasHigh
                  ? "bg-red-50 text-red-800 border-red-300"
                  : hasModerate
                  ? "bg-amber-50 text-amber-800 border-amber-300"
                  : "bg-emerald-50 text-emerald-800 border-emerald-300"
              }`}
            >
              {hasHigh ? "Model Alert (High Risk)" : hasModerate ? "Model Caution" : "Hemodynamically Stable"}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Evaluated for: <span className="font-semibold text-gray-700">{patientName}</span>{" "}
            <span className="font-mono text-gray-400">({patientId})</span> &bull; {horizon}h horizon
          </p>
        </div>

        <span className="text-xs text-gray-500 font-medium bg-gray-50 px-2.5 py-1 rounded border border-gray-200">
          Rule-based research checks
        </span>
      </div>

      {/* 2. Real-time Vital Threshold Checklist Cards */}
      {last && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Perfusion / MAP */}
          <div className="p-3 rounded-lg border bg-gray-50/70 border-gray-200 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-600 uppercase tracking-wider text-[11px]">Perfusion (MAP)</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${mapState.badge}`}>
                {mapState.status === "optimal" ? "PASS" : "ALERT"}
              </span>
            </div>
            <div className="text-lg font-bold font-mono text-gray-900">
              {last.map} <span className="text-xs font-normal text-gray-500 font-sans">mmHg</span>
            </div>
            <p className="text-[11px] text-gray-500 leading-tight">
              Safety floor: &ge;65 mmHg &bull; Min: {minMap} mmHg
            </p>
          </div>

          {/* Card 2: Systolic & Diastolic BP */}
          <div className="p-3 rounded-lg border bg-gray-50/70 border-gray-200 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-600 uppercase tracking-wider text-[11px]">Blood Pressure</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${bpState.badge}`}>
                {bpState.status === "optimal" ? "PASS" : "ALERT"}
              </span>
            </div>
            <div className="text-lg font-bold font-mono text-gray-900">
              {last.sbp}/{last.dbp}{" "}
              <span className="text-xs font-semibold text-teal-700 font-sans">
                ({deltaSbp >= 0 ? `+${deltaSbp}` : deltaSbp} mmHg)
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-tight">
              Floor: &ge;90 &bull; Target: &lt;140 mmHg
            </p>
          </div>

          {/* Card 3: Heart Rate */}
          <div className="p-3 rounded-lg border bg-gray-50/70 border-gray-200 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-600 uppercase tracking-wider text-[11px]">Heart Rate</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${hrState.badge}`}>
                {hrState.status === "optimal" ? "PASS" : "ALERT"}
              </span>
            </div>
            <div className="text-lg font-bold font-mono text-gray-900">
              {last.hr} <span className="text-xs font-normal text-gray-500 font-sans">bpm</span>
              <span className="text-xs font-semibold text-gray-500 ml-1">
                ({deltaHr >= 0 ? `+${deltaHr}` : deltaHr})
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-tight">
              Range: {minHr} &ndash; {maxHr} bpm &bull; Safe: 50&ndash;100
            </p>
          </div>

          {/* Card 4: Cardiac Function (EF) */}
          <div className="p-3 rounded-lg border bg-gray-50/70 border-gray-200 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-gray-600 uppercase tracking-wider text-[11px]">Cardiac Efficacy</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${efState.badge}`}>
                {efState.status === "optimal" ? "PASS" : "CAUTION"}
              </span>
            </div>
            <div className="text-lg font-bold font-mono text-gray-900">
              {last.ef}% <span className="text-xs font-normal text-gray-500 font-sans">EF</span>
              <span className="text-xs font-mono text-gray-600 ml-2 font-normal">
                {last.co_lpm} L/min
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-tight">
              Reference: &ge;50% EF &bull; Baseline: {baseline?.ef}%
            </p>
          </div>
        </div>
      )}

      {/* 3. Dynamic Patient Simulation Findings Banner */}
      <div
        className={`p-4 rounded-lg text-sm border flex items-start gap-3 ${
          hasHigh
            ? "bg-red-50/90 border-red-200 text-red-900"
            : hasModerate
            ? "bg-amber-50/90 border-amber-200 text-amber-900"
            : "bg-emerald-50/90 border-emerald-200 text-emerald-900"
        }`}
      >
        <div className="mt-0.5 text-xs font-bold uppercase px-1.5 py-0.5 rounded border border-current opacity-80 shrink-0 font-mono">
          {hasHigh ? "Alert" : hasModerate ? "Caution" : "Pass"}
        </div>
        <div className="space-y-1 flex-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs uppercase tracking-wide">
              {hasHigh ? "Hemodynamic Alert Finding" : hasModerate ? "Cautionary Observation" : "Simulation Assessment Finding"}
            </span>
            <span className="text-[11px] opacity-75 font-mono">
              Patient ID: {patientId}
            </span>
          </div>
          <p className="leading-relaxed font-medium text-xs sm:text-sm">
            {getDynamicSummary()}
          </p>
        </div>
      </div>

      {/* 4. Triggered Model Flags List */}
      {flags && flags.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
            Specific Parameter Checks Triggered ({flags.length}):
          </span>
          <div className="space-y-2">
            {flags.map((f, i) => {
              const isHigh = f.level === "high";
              const isMod = f.level === "moderate";
              const isOpt = f.level === "optimal";

              return (
                <div
                  key={i}
                  className={`p-3 rounded-lg text-xs sm:text-sm border transition flex items-start justify-between gap-3 ${
                    isHigh
                      ? "bg-red-50/60 border-red-200 text-red-900"
                      : isMod
                      ? "bg-amber-50/60 border-amber-200 text-amber-900"
                      : isOpt
                      ? "bg-teal-50/60 border-teal-200 text-teal-900"
                      : "bg-blue-50/60 border-blue-200 text-blue-900"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs uppercase tracking-wider">
                        {f.category || (isHigh ? "High Priority Check" : isMod ? "Cautionary Check" : "Clinical Check")}
                      </span>
                    </div>
                    <p className="font-medium text-xs sm:text-sm leading-relaxed">{f.text}</p>
                  </div>

                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border whitespace-nowrap ${
                      isHigh
                        ? "bg-red-100 text-red-800 border-red-300"
                        : isMod
                        ? "bg-amber-100 text-amber-800 border-amber-300"
                        : isOpt
                        ? "bg-teal-100 text-teal-800 border-teal-300"
                        : "bg-blue-100 text-blue-800 border-blue-300"
                    }`}
                  >
                    {f.level}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Clinical Safety Research Disclaimer */}
      <div className="text-[11px] text-gray-500 pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <span>
          Checks evaluate mathematical thresholds in the 0D Windkessel solver (MAP floor 65 mmHg, HR 50&ndash;100 bpm, SBP target 140 mmHg).
        </span>
        <span className="italic text-gray-400">
          Research prototype; does not replace physician clinical judgment.
        </span>
      </div>
    </div>
  );
}
