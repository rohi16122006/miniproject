import { useEffect, useRef, useState } from "react";
import { parseReportVitals } from "./reportParser.js";

export default function ECGReportCapture({ onImageSelected, onApplyVitals }) {
  const [report, setReport] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState("");
  const [error, setError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!report?.url) return undefined;
    return () => URL.revokeObjectURL(report.url);
  }, [report]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function startCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is unavailable. Use HTTPS or localhost, or choose an image from your device.");
      return;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setCameraOpen(true);
    } catch (cameraError) {
      setError(
        cameraError.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access or choose an image from your device."
          : `Could not open the camera: ${cameraError.message}`
      );
    }
  }

  async function saveImage(file) {
    setError("");
    setExtractStatus("");
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for the ECG report.");
      return;
    }

    setReport({ name: file.name, url: URL.createObjectURL(file) });
    onImageSelected?.(file);
    stopCamera();

    if (onApplyVitals) {
      setExtracting(true);
      setExtractStatus("Reading report for vitals and patient demographics...");
      let worker;
      try {
        const { createWorker } = await import("tesseract.js");
        worker = await createWorker("eng");
        const { data } = await worker.recognize(file);
        const vitals = parseReportVitals(data.text);
        const count = Object.keys(vitals).length;
        if (count > 0) {
          onApplyVitals(vitals);
          const previewList = [];
          if (vitals.name) previewList.push(`Name: ${vitals.name}`);
          if (vitals.patient_id) previewList.push(`ID: ${vitals.patient_id}`);
          if (vitals.sbp && vitals.dbp) previewList.push(`BP: ${vitals.sbp}/${vitals.dbp}`);
          if (vitals.hr) previewList.push(`HR: ${vitals.hr} bpm`);
          setExtractStatus(
            `Extracted and populated ${count} field${count > 1 ? "s" : ""} to Patient Profile (${previewList.slice(0, 3).join(", ")})`
          );
        } else {
          setExtractStatus("Image loaded for ECG analysis. No text report vitals detected on image.");
        }
      } catch {
        setExtractStatus("");
      } finally {
        await worker?.terminate();
        setExtracting(false);
      }
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError("The camera is not ready yet. Wait a moment and try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Could not capture the image. Please try again.");
      return;
    }
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Could not capture the image. Please try again.");
        return;
      }
      saveImage(new File([blob], "ecg-report.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }

  function removeReport() {
    setReport(null);
    onImageSelected?.(null);
    setError("");
    setExtractStatus("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3" aria-labelledby="ecg-report-title">
      <div>
        <h3 id="ecg-report-title" className="text-xs font-bold text-gray-800">ECG Report Image</h3>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={cameraOpen ? stopCamera : startCamera}
          className="rounded-md bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"
        >
          {cameraOpen ? "Close camera" : "Open camera"}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
        >
          Choose from gallery
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Choose ECG report image from gallery"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) saveImage(file);
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
            aria-label="Camera preview for ECG report"
            className="max-h-64 w-full rounded-md bg-black object-contain"
          />
          <button
            type="button"
            onClick={capturePhoto}
            className="rounded-md bg-gray-800 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-900"
          >
            Capture ECG report
          </button>
        </div>
      )}

      {extracting && (
        <p className="text-xs font-medium text-teal-800" role="status">{extractStatus}</p>
      )}

      {!extracting && extractStatus && (
        <div className="rounded border border-emerald-200 bg-emerald-50/80 px-2.5 py-1.5 text-xs text-emerald-900 font-medium">
          {extractStatus}
        </div>
      )}

      {report && (
        <div className="space-y-2">
          <img src={report.url} alt={`ECG report preview: ${report.name}`} className="max-h-64 w-full rounded-md border border-gray-200 bg-white object-contain" />
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-gray-700">{report.name}</span>
            <button
              type="button"
              onClick={removeReport}
              className="shrink-0 text-xs font-semibold text-red-700 hover:text-red-900"
            >
              Remove image
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs font-medium text-red-700" role="alert">{error}</p>}
    </section>
  );
}
