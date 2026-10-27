import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { getHeartScenarioOutput, HEART_MODEL_URL, probeHeartAsset } from "../heartAsset.js";

function HeartModel({ heartRate }) {
  const group = useRef();
  const { scene } = useGLTF(HEART_MODEL_URL);
  const model = useMemo(() => scene.clone(true), [scene]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const pulse = Math.sin(clock.elapsedTime * (Math.max(heartRate, 1) / 60) * Math.PI * 2);
    group.current.scale.setScalar(1 + pulse * 0.018);
  });

  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  );
}

class ViewerErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-amber-900" role="alert">
          The local heart model could not be rendered. Check the GLB asset and browser WebGL support.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Heart3DPanel({ patient, result }) {
  const [assetState, setAssetState] = useState({ status: "checking", message: "" });
  const [scenario, setScenario] = useState("treatment");
  const [sampleIndex, setSampleIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const controls = useRef();
  const series = Array.isArray(result?.series) ? result.series : [];

  useEffect(() => {
    let active = true;
    probeHeartAsset()
      .then(() => {
        if (active) setAssetState({ status: "available", message: "" });
      })
      .catch((error) => {
        if (active) setAssetState({ status: "missing", message: error.message });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!playing || scenario !== "treatment" || series.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setSampleIndex((index) => Math.min(index + 1, series.length - 1));
    }, 500);
    return () => window.clearInterval(timer);
  }, [playing, series.length, scenario]);

  useEffect(() => {
    if (series.length && sampleIndex >= series.length - 1) setPlaying(false);
  }, [series.length, sampleIndex]);

  const selected = getHeartScenarioOutput(result, scenario, sampleIndex);
  const hasValues = [selected?.sbp, selected?.dbp, selected?.hr].every(Number.isFinite);

  function selectScenario(value) {
    setScenario(value);
    setPlaying(false);
    setSampleIndex(0);
  }

  return (
    <section id="heart-3d-panel" className="rounded-lg border border-slate-300 bg-white p-5 shadow-sm space-y-4" aria-labelledby="heart-3d-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 id="heart-3d-heading" className="text-sm font-bold uppercase tracking-wide text-slate-800">
            3D Heart Simulation
          </h2>
          <p className="mt-1 text-xs text-gray-600">
            Interactive anatomical model viewer; displayed values come only from supported simulation outputs.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
          Scenario
          <select
            value={scenario}
            onChange={(event) => selectScenario(event.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1.5"
          >
            <option value="baseline">Baseline</option>
            <option value="treatment">Hypothetical treatment simulation</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(240px,1fr)]">
        <div className="relative h-72 overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
          {assetState.status === "checking" && (
            <div className="flex h-full items-center justify-center text-sm text-slate-200" role="status">
              Checking for licensed local 3D model…
            </div>
          )}
          {assetState.status === "missing" && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-amber-100" role="status">
              <strong>3D anatomy is unavailable.</strong>
              <span>{assetState.message}</span>
              <span className="text-xs text-slate-300">
                Place the attributed GLB model at {HEART_MODEL_URL} and reload the page.
              </span>
              <a
                href="https://commons.wikimedia.org/wiki/File:3D_model_of_a_human_heart.stl"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-teal-200 underline underline-offset-2 hover:text-teal-100"
              >
                View heart model source and CC BY 4.0 license
              </a>
            </div>
          )}
          {assetState.status === "available" && (
            <>
              <ViewerErrorBoundary key={HEART_MODEL_URL}>
                <Canvas camera={{ position: [0, 0, 4], fov: 42 }} fallback={<div className="p-6 text-center text-amber-100">WebGL is unavailable in this browser.</div>}>
                  <color attach="background" args={["#020617"]} />
                  <ambientLight intensity={1.5} />
                  <directionalLight position={[3, 4, 5]} intensity={2} />
                  <Suspense fallback={<Html center className="text-sm text-white">Loading licensed heart model…</Html>}>
                    <HeartModel heartRate={selected?.hr || 0} />
                  </Suspense>
                  <OrbitControls ref={controls} makeDefault />
                </Canvas>
              </ViewerErrorBoundary>
              <button
                type="button"
                onClick={() => controls.current?.reset()}
                className="absolute bottom-3 right-3 rounded border border-slate-500 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Reset camera
              </button>
              <span className="absolute bottom-3 left-3 text-[11px] text-slate-200">Drag to rotate · scroll to zoom</span>
            </>
          )}
        </div>

        <div className="space-y-3">
          <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <div><strong>Simulation session:</strong> {result.run_id ?? "not returned by API"}</div>
            <div className="mt-1"><strong>Workspace patient:</strong> {patient?.age ?? "unknown"} years · {patient?.sex ?? "unknown"}</div>
            <div className="mt-1"><strong>Scenario:</strong> {scenario === "baseline" ? "Baseline input" : "Hypothetical model output"}</div>
          </div>

          {hasValues ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded border border-red-100 bg-red-50 p-2">
                <span className="block text-[10px] text-gray-600">Systolic (SBP)</span>
                <strong className="text-sm">{selected.sbp}<span className="ml-1 text-[10px] font-medium">mmHg</span></strong>
              </div>
              <div className="rounded border border-blue-100 bg-blue-50 p-2">
                <span className="block text-[10px] text-gray-600">Diastolic (DBP)</span>
                <strong className="text-sm">{selected.dbp}<span className="ml-1 text-[10px] font-medium">mmHg</span></strong>
              </div>
              <div className="rounded border border-rose-100 bg-rose-50 p-2">
                <span className="block text-[10px] text-gray-600">Heart rate (HR)</span>
                <strong className="text-sm">{selected.hr}<span className="ml-1 text-[10px] font-medium">bpm</span></strong>
              </div>
            </div>
          ) : (
            <p role="status" className="text-xs text-amber-800">This scenario does not include all required output values.</p>
          )}

          {scenario === "treatment" && series.length > 1 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>Simulation playback · {selected?.t_h ?? "unknown"} h</span>
                <button
                  type="button"
                  onClick={() => {
                    if (sampleIndex >= series.length - 1) setSampleIndex(0);
                    setPlaying(!playing);
                  }}
                  className="rounded border border-slate-300 px-2 py-1 font-semibold text-slate-700"
                >
                  {playing ? "Pause" : "Play"}
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={series.length - 1}
                value={sampleIndex}
                onChange={(event) => {
                  setPlaying(false);
                  setSampleIndex(Number(event.target.value));
                }}
                className="w-full accent-teal-700"
                aria-label="Simulation playback position"
              />
            </div>
          )}

          <p className="text-[11px] text-gray-600">
            Legend: pulse scale follows selected HR only; red = SBP (mmHg), blue = DBP (mmHg), rose = HR (bpm). No blood-flow field is computed.
          </p>
          <p className="text-[11px] leading-relaxed text-gray-600">
            The solver provides 0D hemodynamic values, not 3D blood flow, valve mechanics, deformation, or patient-specific anatomy. The pulse animation follows the selected heart-rate output only. Anatomical labels require a documented model asset and are not inferred.
          </p>
          <p className="text-[10px] leading-relaxed text-gray-500">
            Model: <a className="underline" href="https://commons.wikimedia.org/wiki/File:3D_model_of_a_human_heart.stl" target="_blank" rel="noreferrer">“Realistic Human Heart”</a> by neshallads, via Wikimedia Commons, licensed under <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Converted from STL to GLB, centered, scaled, and assigned a display material; no anatomical structures were added.
          </p>
        </div>
      </div>
    </section>
  );
}
