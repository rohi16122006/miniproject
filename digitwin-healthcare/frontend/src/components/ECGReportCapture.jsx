import { useEffect, useRef, useState } from "react";

export default function ECGReportCapture({ onImageSelected }) {
  const [report, setReport] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
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

  function saveImage(file) {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for the ECG report.");
      return;
    }

    setReport({ name: file.name, url: URL.createObjectURL(file) });
    onImageSelected?.(file);
    stopCamera();
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
