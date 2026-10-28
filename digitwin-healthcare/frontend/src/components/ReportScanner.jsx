import { useEffect, useRef, useState } from "react";
import { parseReportVitals, reportFields } from "./reportParser.js";

export default function ReportScanner({ onApply }) {
  const [open, setOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [captured, setCaptured] = useState({});
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function startCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not available. Use HTTPS or localhost, or choose a report image.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (cameraError) {
      setError(
        cameraError.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access or choose a report image."
          : `Could not open the camera: ${cameraError.message}`
      );
    }
  }

  async function scanImage(image) {
    setError("");
    setCaptured({});
    setScanning(true);
    setStatus("Loading OCR and reading the report...");
    let worker;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng");
      const { data } = await worker.recognize(image);
      const found = parseReportVitals(data.text);
      setCaptured(found);
      const count = Object.keys(found).length;
      if (count > 0) {
        onApply?.(found);
        setStatus(
          `Extracted ${count} field${count > 1 ? "s" : ""} and applied to Patient Profile. Review or adjust values below if needed.`
        );
      } else {
        setStatus("No supported values were recognized. Try a clearer image or enter the values manually.");
      }
    } catch (scanError) {
      setError(`Could not read the report image: ${scanError.message}`);
      setStatus("");
    } finally {
      await worker?.terminate();
      setScanning(false);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("The camera is not ready yet. Wait a moment and try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((image) => {
      if (image) {
        stopCamera();
        scanImage(image);
      } else {
        setError("Could not capture the image. Please try again.");
      }
    }, "image/jpeg", 0.92);
  }

  function updateCaptured(key, value) {
    setCaptured((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="border-b border-gray-100 pb-3">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          setError("");
        }}
        className="text-xs font-semibold text-teal-700 hover:text-teal-900"
        aria-expanded={open}
      >
        {open ? "Close report scanner" : "Scan patient report"}
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/50 p-3 space-y-3">
          <p className="text-xs text-gray-600">
            The report image is processed in this browser and is not uploaded. The English OCR model downloads when you scan for the first time. Review all extracted values before applying them.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={cameraOpen ? stopCamera : startCamera}
              disabled={scanning}
              className="rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {cameraOpen ? "Close camera" : "Open camera"}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={scanning}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Choose report image
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const image = event.target.files?.[0];
                if (image) scanImage(image);
                event.target.value = "";
              }}
            />
          </div>

          {cameraOpen && (
            <div className="space-y-2">
              <video
                ref={(element) => {
                  videoRef.current = element;
                  if (element && streamRef.current) element.srcObject = streamRef.current;
                }}
                autoPlay
                playsInline
                className="max-h-64 w-full rounded-md bg-black object-contain"
              />
              <button
                type="button"
                onClick={capturePhoto}
                className="rounded-md bg-gray-800 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-900"
              >
                Capture and scan
              </button>
            </div>
          )}

          {scanning && (
            <p className="text-xs font-medium text-teal-800" role="status">{status}</p>
          )}
          {!scanning && status && (
            <p className="text-xs text-gray-700" role="status">{status}</p>
          )}
          {error && (
            <p className="text-xs font-medium text-red-700" role="alert">{error}</p>
          )}

          {Object.keys(captured).length > 0 && (
            <div className="space-y-3 border-t border-teal-100 pt-3">
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(captured).map(([key, value]) => {
                  const config = reportFields[key];
                  if (!config) return null;
                  return (
                    <label key={key} className="block text-xs font-semibold text-gray-700">
                      <span className="mb-1 block">{config.label}{config.unit ? ` (${config.unit})` : ""}</span>
                      {key === "sex" ? (
                        <select
                          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5"
                          value={value}
                          onChange={(event) => updateCaptured(key, event.target.value)}
                        >
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                      ) : key === "name" || key === "patient_id" ? (
                        <input
                          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5"
                          type="text"
                          value={value ?? ""}
                          onChange={(event) => updateCaptured(key, event.target.value)}
                        />
                      ) : (
                        <input
                          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5"
                          type="number"
                          min={config.min}
                          max={config.max}
                          value={value}
                          onChange={(event) =>
                            updateCaptured(key, event.target.value === "" ? "" : Number(event.target.value))
                          }
                        />
                      )}
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  const values = Object.fromEntries(
                    Object.entries(captured).filter(([key, value]) => {
                      if (key === "name" || key === "patient_id") {
                        return typeof value === "string" && value.trim().length > 0;
                      }
                      if (key === "sex") {
                        return value === "male" || value === "female";
                      }
                      return (
                        reportFields[key] &&
                        Number.isFinite(value) &&
                        value >= reportFields[key].min &&
                        value <= reportFields[key].max
                      );
                    })
                  );
                  onApply(values);
                  setStatus("Reviewed values applied to the patient form.");
                }}
                className="w-full rounded-md bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800"
              >
                Apply reviewed values
              </button>
              <p className="text-[11px] text-gray-500">
                Only recognized fields are applied to your workspace session. Source documents are not retained.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
