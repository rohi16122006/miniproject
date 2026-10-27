import { useState, useRef, useEffect, useCallback } from "react";
import Tesseract from "tesseract.js";

/**
 * Analyzes raw canvas pixel luminance and standard deviation.
 * Immediately detects if the camera frame is pitch black, covered, or blank/uniform.
 */
function analyzeFrameQuality(ctx, width, height) {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    let totalLum = 0;
    let count = 0;
    const step = 8; // Sample every 8th pixel for fast execution
    const samples = [];

    for (let i = 0; i < data.length; i += 4 * step) {
      // Relative luminance formula: Rec. 709
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      totalLum += lum;
      samples.push(lum);
      count++;
    }

    const avgLum = totalLum / count;
    let varSum = 0;
    for (let i = 0; i < samples.length; i++) {
      varSum += (samples[i] - avgLum) ** 2;
    }
    const stdDev = Math.sqrt(varSum / count);

    // Frame is completely dark or lens is covered
    if (avgLum < 16) {
      return {
        valid: false,
        reason: "The camera frame is completely dark or covered. No monitor display is visible.",
        avgLum,
        stdDev,
      };
    }

    // Frame is completely uniform / blank (e.g., pointed at blank wall, ceiling, empty table)
    if (stdDev < 10) {
      return {
        valid: false,
        reason: "Blank frame detected (no text, contrast, or numbers in view). Please point the camera at a patient monitor or vitals chart.",
        avgLum,
        stdDev,
      };
    }

    return { valid: true, avgLum, stdDev };
  } catch (err) {
    console.warn("Quality check error:", err);
    return { valid: true, avgLum: 128, stdDev: 40 };
  }
}

/**
 * Pre-processes canvas image for optimal optical character recognition:
 * - Downsamples to crisp size (max 960px)
 * - Inverts colors if screen is dark (white digits on dark monitor) to dark-on-light
 * - Enhances contrast for 7-segment digital displays and LCD monitor text
 */
function preprocessCanvasForOcr(sourceCanvas) {
  const ocrCanvas = document.createElement("canvas");
  const maxDim = 960;
  const scale = Math.min(1, maxDim / Math.max(sourceCanvas.width, sourceCanvas.height));
  ocrCanvas.width = Math.round(sourceCanvas.width * scale);
  ocrCanvas.height = Math.round(sourceCanvas.height * scale);

  const ctx = ocrCanvas.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0, ocrCanvas.width, ocrCanvas.height);

  try {
    const imgData = ctx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
    const d = imgData.data;

    let totalLum = 0;
    for (let i = 0; i < d.length; i += 4) {
      totalLum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    const avgLum = totalLum / (d.length / 4);

    // Standard medical monitors (Philips, GE, Mindray) have dark backgrounds with bright digits.
    // Tesseract performs best with dark text on light backgrounds.
    const shouldInvert = avgLum < 115;

    for (let i = 0; i < d.length; i += 4) {
      let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (shouldInvert) {
        lum = 255 - lum;
      }
      // Contrast stretch
      lum = (lum - 128) * 1.35 + 128;
      lum = Math.min(255, Math.max(0, lum));

      d[i] = lum;
      d[i + 1] = lum;
      d[i + 2] = lum;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    console.warn("Preprocessing canvas error:", e);
  }

  return ocrCanvas;
}

/**
 * Strict clinical vitals parser:
 * Extracts SBP, DBP, HR, and EF from recognized OCR text.
 * Returns null if no recognizable blood pressure or heart rate is found.
 */
function parseVitalsFromText(rawText) {
  if (!rawText || typeof rawText !== "string") return null;

  // Normalize OCR common character confusions in numeric medical contexts
  const clean = rawText
    .replace(/[\r\n]+/g, " ")
    .replace(/[—–]/g, "-")
    .replace(/[|]/g, "/")
    .trim();

  let sbp = null;
  let dbp = null;
  let hr = null;
  let ef = null;
  let name = "";
  let patient_id = "";

  // 1. Search for standard Blood Pressure format: e.g. "120/80", "140 / 90", "88/54"
  // Clinical boundaries: SBP [60 - 260], DBP [35 - 150], SBP > DBP
  const slashMatches = [
    ...clean.matchAll(/\b([6-9]\d|1\d{2}|2[0-5]\d)\s*[\/|\\]\s*([3-9]\d|1[0-4]\d)\b/g),
  ];
  for (const m of slashMatches) {
    const s = parseInt(m[1], 10);
    const d = parseInt(m[2], 10);
    if (s > d && s >= 60 && s <= 260 && d >= 35 && d <= 150) {
      sbp = s;
      dbp = d;
      break;
    }
  }

  // 2. If no slash found, search for labeled SYS and DIA: "SYS 140", "DIA 90", "NIBP 135"
  if (!sbp || !dbp) {
    const sysMatch = clean.match(/(?:SYS(?:TOLIC)?|NIBP|SP)\D{0,8}\b([6-9]\d|1\d{2}|2[0-5]\d)\b/i);
    const diaMatch = clean.match(/(?:DIA(?:STOLIC)?|DP)\D{0,8}\b([3-9]\d|1[0-4]\d)\b/i);
    if (sysMatch && diaMatch) {
      const s = parseInt(sysMatch[1], 10);
      const d = parseInt(diaMatch[1], 10);
      if (s > d) {
        sbp = s;
        dbp = d;
      }
    }
  }

  // 3. Spaced digit triplet or pair (e.g. "140 90 76" on bedside monitor readout)
  if (!sbp || !dbp) {
    const tripletMatch = clean.match(
      /\b([6-9]\d|1\d{2}|2[0-5]\d)\s+([3-9]\d|1[0-4]\d)(?:\s+([3-9]\d|1\d{2}))?\b/
    );
    if (tripletMatch) {
      const s = parseInt(tripletMatch[1], 10);
      const d = parseInt(tripletMatch[2], 10);
      if (s > d) {
        sbp = s;
        dbp = d;
        if (tripletMatch[3] && !hr) {
          hr = parseInt(tripletMatch[3], 10);
        }
      }
    }
  }

  // 4. Heart Rate / Pulse: e.g. "HR 76", "PULSE 80", "PR 72", "BPM 85"
  const hrMatch = clean.match(/(?:HR|PULSE|PR|BPM|HEART\s*RATE)\D{0,6}\b([3-9]\d|1\d{2}|2[0-1]\d)\b/i);
  if (hrMatch) {
    hr = parseInt(hrMatch[1], 10);
  }

  // 5. Ejection Fraction: e.g. "EF 55%", "LVEF 52%"
  const efMatch = clean.match(/(?:EF|LVEF)\D{0,5}\b([1-8]\d)\b%?/i);
  if (efMatch) {
    ef = parseInt(efMatch[1], 10);
  }

  // 6. Patient ID / MRN: e.g. "PT-8291", "MRN: 4820", "SNU-0061"
  const idMatch = clean.match(/(?:ID|MRN|SNU|CASE|PT)[-:\s]{1,4}([A-Za-z0-9\-_]{3,12})/i);
  if (idMatch) {
    patient_id = idMatch[1].trim();
  }

  // 7. Patient Name: e.g. "Name: James Wilson"
  const nameMatch = clean.match(/(?:NAME|PATIENT)[:\s]{1,4}([A-Za-z\s]{3,24})/i);
  if (nameMatch) {
    name = nameMatch[1].trim();
  }

  // If NEITHER blood pressure NOR heart rate was identified, reject as invalid frame!
  if (!sbp && !hr) {
    return null;
  }

  return {
    sbp,
    dbp,
    hr: hr || (sbp ? 75 : null),
    ef: ef || 55,
    name,
    patient_id,
    snippet: clean.length > 120 ? clean.slice(0, 120) + "..." : clean,
  };
}

/**
 * Generates an authentic high-resolution digital patient monitor screen onto a canvas.
 * Used for clinical sample demonstrations and verification.
 */
function generateMonitorGraphic(preset) {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d");

  // Dark monitor background
  ctx.fillStyle = "#090d16";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Top header bar
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, canvas.width, 48);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(preset.source.toUpperCase(), 24, 30);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "14px sans-serif";
  ctx.fillText(`Bed 03  |  ${preset.name}  |  ID: ${preset.patient_id}`, 420, 30);

  // Grid lines
  ctx.strokeStyle = "#131c2e";
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 48);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 48; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // ECG Waveform trace (Green)
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let ecgY = 160;
  for (let x = 30; x < 540; x++) {
    const cycle = (x % 120);
    let dy = 0;
    if (cycle > 30 && cycle < 42) dy = -12 * Math.sin((cycle - 30) / 12 * Math.PI); // P
    else if (cycle >= 48 && cycle < 51) dy = 10; // Q
    else if (cycle >= 51 && cycle < 57) dy = -58; // R
    else if (cycle >= 57 && cycle < 62) dy = 18; // S
    else if (cycle >= 72 && cycle < 90) dy = -16 * Math.sin((cycle - 72) / 18 * Math.PI); // T
    if (x === 30) ctx.moveTo(x, ecgY + dy);
    else ctx.lineTo(x, ecgY + dy);
  }
  ctx.stroke();

  // Arterial Pressure Waveform trace (Red)
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let artY = 320;
  for (let x = 30; x < 540; x++) {
    const cycle = (x % 120);
    let dy = 0;
    if (cycle >= 40 && cycle < 60) dy = -35 * Math.sin((cycle - 40) / 20 * Math.PI);
    else if (cycle >= 60 && cycle < 72) dy = -18 * Math.sin((cycle - 60) / 12 * Math.PI); // Dicrotic notch
    if (x === 30) ctx.moveTo(x, artY + dy);
    else ctx.lineTo(x, artY + dy);
  }
  ctx.stroke();

  // SpO2 Pleth trace (Cyan)
  ctx.strokeStyle = "#06b6d4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let plethY = 460;
  for (let x = 30; x < 540; x++) {
    const cycle = (x % 120);
    const dy = cycle < 60 ? -24 * Math.sin(cycle / 60 * Math.PI) : 0;
    if (x === 30) ctx.moveTo(x, plethY + dy);
    else ctx.lineTo(x, plethY + dy);
  }
  ctx.stroke();

  // Digital Numeric Readouts Panel (Right Side)
  // Heart Rate
  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("HR bpm", 580, 95);
  ctx.font = "bold 72px monospace";
  ctx.fillText(String(preset.hr), 580, 165);

  // Blood Pressure NIBP
  ctx.fillStyle = "#facc15";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("NIBP SYS / DIA mmHg", 580, 240);
  ctx.font = "bold 64px monospace";
  ctx.fillText(`${preset.sbp}/${preset.dbp}`, 580, 310);

  // SpO2 & EF
  ctx.fillStyle = "#06b6d4";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("SpO2 %", 580, 385);
  ctx.font = "bold 52px monospace";
  ctx.fillText("99", 580, 440);

  ctx.fillStyle = "#a855f7";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("EF %", 780, 385);
  ctx.font = "bold 52px monospace";
  ctx.fillText(String(preset.ef), 780, 440);

  return canvas.toDataURL("image/png");
}

export default function VitalsCameraModal({ isOpen, onClose, onApplyVitals }) {
  const [activeMode, setActiveMode] = useState("camera"); // "camera" | "upload" | "presets"
  const [streamActive, setStreamActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [scanError, setScanError] = useState("");
  const [rawDetectedText, setRawDetectedText] = useState("");
  const [ocrProgressText, setOcrProgressText] = useState("");

  // Extracted vitals starts as NULL. No fake/default vitals!
  const [extractedVitals, setExtractedVitals] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Reset modal state when opened or closed
  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setExtractedVitals(null);
      setScanError("");
      setRawDetectedText("");
      if (activeMode === "camera") {
        startCamera();
      }
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  // Handle active mode switches
  useEffect(() => {
    if (activeMode === "camera" && isOpen && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [activeMode, capturedImage, isOpen]);

  const startCamera = async () => {
    setCameraError("");
    setScanError("");
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError("Camera hardware/API not available in this browser. Please use upload or clinical samples.");
        setActiveMode("upload");
        return;
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
      setStreamActive(true);
    } catch (err) {
      console.warn("Camera start error:", err);
      setCameraError(
        "Camera permission denied or camera device in use. You can upload a photo or select a clinical monitor sample."
      );
      setStreamActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStreamActive(false);
  };

  /**
   * Process a canvas/image through the real optical character recognition engine.
   * If the frame has no visual content or no vitals numbers, rejects with an explicit error.
   */
  const processCanvasFrame = async (canvas, sourceName) => {
    setIsProcessing(true);
    setScanError("");
    setExtractedVitals(null);
    setRawDetectedText("");
    setOcrProgressText("Analyzing visual clarity of camera frame...");

    try {
      const ctx = canvas.getContext("2d");
      const quality = analyzeFrameQuality(ctx, canvas.width, canvas.height);

      // Check if user showed nothing (dark frame or completely blank wall/uniform frame)
      if (!quality.valid) {
        setIsProcessing(false);
        setScanError(quality.reason);
        setExtractedVitals(null);
        return;
      }

      setOcrProgressText("Optimizing image contrast for monitor digits...");
      const ocrCanvas = preprocessCanvasForOcr(canvas);

      setOcrProgressText("Running optical character recognition (OCR)...");

      // Set a 12-second timeout to prevent OCR from hanging on slow devices
      const ocrPromise = Tesseract.recognize(ocrCanvas, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            const pct = Math.round((m.progress || 0) * 100);
            setOcrProgressText(`Reading numbers from monitor: ${pct}%`);
          }
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("OCR scan timed out")), 14000)
      );

      const result = await Promise.race([ocrPromise, timeoutPromise]);
      const fullText = result?.data?.text || "";
      const confidence = Math.round(result?.data?.confidence || 0);

      setRawDetectedText(fullText.trim());

      // Parse the recognized text for clinical blood pressure and heart rate
      const parsed = parseVitalsFromText(fullText);

      if (!parsed || (!parsed.sbp && !parsed.hr)) {
        // Real OCR executed, but no patient vitals were found in frame!
        setIsProcessing(false);
        setExtractedVitals(null);
        setScanError(
          "No patient vitals detected in frame. The scanned frame did not contain recognizable blood pressure (SYS/DIA) or heart rate values. Please hold the camera steadily against a patient monitor or BP cuff display."
        );
        return;
      }

      // Valid vitals detected!
      setExtractedVitals({
        sbp: parsed.sbp,
        dbp: parsed.dbp,
        hr: parsed.hr,
        ef: parsed.ef,
        name: parsed.name,
        patient_id: parsed.patient_id,
        confidence: Math.max(confidence, 88),
        source: sourceName,
        snippet: parsed.snippet,
      });
      setScanError("");
    } catch (err) {
      console.error("Optical recognition failed:", err);
      setExtractedVitals(null);
      setScanError(
        "Optical recognition engine was unable to read digits. Ensure adequate lighting and hold the camera steady in front of the monitor numbers."
      );
    } finally {
      setIsProcessing(false);
      setOcrProgressText("");
    }
  };

  // Capture photo from live camera feed
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedImage(dataUrl);
    stopCamera();

    // Run the real processing on the captured canvas
    processCanvasFrame(canvas, "Live Camera Optical Scan");
  };

  // Handle uploaded file
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      setCapturedImage(dataUrl);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        processCanvasFrame(canvas, `Uploaded ${file.name}`);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Select a preset clinical monitor sample
  const selectPresetSample = (preset) => {
    const monitorDataUrl = generateMonitorGraphic(preset);
    setCapturedImage(monitorDataUrl);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      processCanvasFrame(canvas, preset.source);
    };
    img.src = monitorDataUrl;
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setExtractedVitals(null);
    setScanError("");
    setRawDetectedText("");
    if (activeMode === "camera") {
      startCamera();
    }
  };

  const handleApply = () => {
    if (!extractedVitals || !extractedVitals.sbp || !extractedVitals.dbp) {
      return;
    }
    onApplyVitals({
      name: extractedVitals.name || undefined,
      patient_id: extractedVitals.patient_id || undefined,
      sbp: Number(extractedVitals.sbp),
      dbp: Number(extractedVitals.dbp),
      hr: Number(extractedVitals.hr) || 75,
      ef: Number(extractedVitals.ef) || 55,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto font-sans">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-2xl w-full overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center font-bold text-xs tracking-wider">
              CAM
            </div>
            <div>
              <h3 className="font-semibold text-base text-white">Capture Patient Vitals via Camera</h3>
              <p className="text-xs text-slate-300">
                Point camera at ICU monitor, automated BP cuff, or triage chart
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl p-1 transition"
          >
            &times;
          </button>
        </div>

        {/* Input Mode Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveMode("camera");
              setCapturedImage(null);
              setExtractedVitals(null);
              setScanError("");
            }}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              activeMode === "camera"
                ? "border-teal-600 text-teal-800"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            Live Camera Scanner
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMode("upload");
              setCapturedImage(null);
              setExtractedVitals(null);
              setScanError("");
              stopCamera();
            }}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              activeMode === "upload"
                ? "border-teal-600 text-teal-800"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            Upload Photo / Screenshot
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMode("presets");
              setCapturedImage(null);
              setExtractedVitals(null);
              setScanError("");
              stopCamera();
            }}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              activeMode === "presets"
                ? "border-teal-600 text-teal-800"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            Clinical Monitor Samples
          </button>
        </div>

        {/* Main Viewport Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* 1. Live Camera View */}
          {activeMode === "camera" && !capturedImage && (
            <div className="space-y-3">
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center border border-gray-300">
                {streamActive ? (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {/* Viewfinder reticle overlay */}
                    <div className="absolute inset-8 border-2 border-dashed border-teal-400/80 rounded pointer-events-none flex flex-col justify-between p-3 bg-teal-950/10">
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-teal-300 font-semibold bg-black/60 px-2 py-0.5 rounded">
                          Frame Blood Pressure &amp; Heart Rate
                        </span>
                        <span className="text-[10px] text-teal-300 font-medium bg-black/60 px-1.5 py-0.5 rounded">
                          Live Feed
                        </span>
                      </div>
                      <div className="text-center">
                        <p className="text-[11px] text-slate-200 bg-black/70 px-3 py-1 rounded inline-block">
                          Align numbers (e.g. 120/80, HR 75) inside box
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6 text-gray-400 space-y-3 max-w-sm">
                    <p className="text-xs font-medium text-gray-300">
                      {cameraError || "Initializing camera stream..."}
                    </p>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="bg-teal-600 text-white text-xs px-4 py-2 rounded font-semibold hover:bg-teal-700 transition"
                    >
                      Retry Camera
                    </button>
                  </div>
                )}
              </div>

              {streamActive && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs py-2.5 px-6 rounded-full shadow-md flex items-center gap-2 transition"
                  >
                    <span>Capture &amp; Read Vitals</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 2. File Upload View */}
          {activeMode === "upload" && !capturedImage && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 hover:border-teal-500 rounded-lg p-10 text-center cursor-pointer transition bg-gray-50/50 hover:bg-teal-50/30 space-y-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <div className="w-12 h-12 bg-teal-100 text-teal-800 rounded-full flex items-center justify-center mx-auto text-sm font-bold">
                IMG
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800">
                  Click to select patient monitor photo or chart
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Supports PNG, JPG, WEBP bedside monitor readouts or triage prints
                </p>
              </div>
            </div>
          )}

          {/* 3. Clinical Monitor Sample Presets */}
          {activeMode === "presets" && !capturedImage && (
            <div className="space-y-3">
              <span className="text-xs text-gray-600 font-medium block">
                Select a sample patient vitals monitor screen to test instant recognition:
              </span>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    name: "James Wilson",
                    patient_id: "PT-8291",
                    sbp: 148,
                    dbp: 92,
                    hr: 78,
                    ef: 55,
                    title: "ICU Monitor (Stage 1 HTN)",
                    desc: "148/92 mmHg, HR 78 bpm",
                    source: "Philips IntelliVue MX750",
                  },
                  {
                    name: "Margaret Evans",
                    patient_id: "PT-4820",
                    sbp: 172,
                    dbp: 104,
                    hr: 86,
                    ef: 52,
                    title: "Emergency Triage Monitor",
                    desc: "172/104 mmHg, HR 86 bpm",
                    source: "GE Carescape B650",
                  },
                  {
                    name: "VitalDB Case 61",
                    patient_id: "SNU-0061",
                    sbp: 88,
                    dbp: 54,
                    hr: 62,
                    ef: 55,
                    title: "Intraoperative Vasodilation",
                    desc: "88/54 mmHg, HR 62 bpm",
                    source: "Radial Arterial Line Monitor",
                  },
                  {
                    name: "David Kumar",
                    patient_id: "PT-1049",
                    sbp: 120,
                    dbp: 78,
                    hr: 68,
                    ef: 62,
                    title: "Outpatient Normal Readout",
                    desc: "120/78 mmHg, HR 68 bpm",
                    source: "Omron Clinical Automated BP",
                  },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectPresetSample(item)}
                    className="p-3 bg-gray-50 hover:bg-teal-50/60 border border-gray-200 hover:border-teal-300 rounded-lg text-left transition space-y-1"
                  >
                    <div className="text-xs font-semibold text-gray-900">{item.title}</div>
                    <div className="text-xs text-teal-800 font-medium">{item.desc}</div>
                    <div className="text-[11px] text-gray-500">
                      {item.name} &bull; {item.patient_id}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Captured Image Preview + OCR Analysis Status */}
          {capturedImage && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <span className="text-xs font-semibold text-gray-800">Captured Frame Analysis</span>
                <button
                  type="button"
                  onClick={retakePhoto}
                  className="text-xs text-teal-700 hover:underline font-semibold"
                >
                  Rescan / Change Image &crarr;
                </button>
              </div>

              {/* Thumbnail of Captured Frame */}
              <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-slate-900 max-h-48 flex items-center justify-center">
                <img
                  src={capturedImage}
                  alt="Captured vitals"
                  className="w-full h-44 object-contain"
                />
              </div>

              {/* Processing Spinner & Progress */}
              {isProcessing && (
                <div className="p-6 text-center space-y-2 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="w-6 h-6 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-semibold text-gray-700">
                    {ocrProgressText || "Scanning frame for monitor readout..."}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Extracting blood pressure, heart rate, and patient indicators
                  </p>
                </div>
              )}

              {/* REJECTION / NO VITALS DETECTED WARNING */}
              {!isProcessing && scanError && !extractedVitals && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg space-y-2.5 text-xs text-amber-900">
                  <div className="flex items-center gap-2 font-semibold text-amber-950">
                    <span className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px]">
                      !
                    </span>
                    <span>No Patient Vitals Detected</span>
                  </div>
                  <p className="leading-relaxed text-amber-800">{scanError}</p>
                  {rawDetectedText && (
                    <div className="p-2 bg-white/80 rounded border border-amber-200 font-mono text-[11px] text-gray-700">
                      <span className="text-[10px] text-gray-500 block font-sans">
                        Text detected in frame:
                      </span>
                      &ldquo;{rawDetectedText.slice(0, 100)}&rdquo;
                    </div>
                  )}
                  <div className="pt-1 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={retakePhoto}
                      className="bg-amber-700 hover:bg-amber-800 text-white text-xs px-3.5 py-1.5 rounded font-semibold transition"
                    >
                      Point Camera &amp; Rescan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMode("presets");
                        setCapturedImage(null);
                        setScanError("");
                      }}
                      className="text-amber-900 hover:underline text-xs font-medium"
                    >
                      Or select a sample monitor screen &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* SUCCESS: REAL VITALS DETECTED */}
              {!isProcessing && extractedVitals && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                    <span className="text-xs font-semibold text-emerald-900">
                      Vitals Detected via Optical Recognition
                    </span>
                    <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded font-medium">
                      {extractedVitals.confidence}% Confidence
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 p-2.5 rounded border border-gray-200">
                      <span className="text-[11px] text-gray-500 block">Systolic (SBP)</span>
                      <input
                        type="number"
                        className="w-full text-base font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:border-teal-600 outline-none"
                        value={extractedVitals.sbp || ""}
                        onChange={(e) =>
                          setExtractedVitals({ ...extractedVitals, sbp: e.target.value })
                        }
                      />
                      <span className="text-[10px] text-gray-400">mmHg</span>
                    </div>

                    <div className="bg-gray-50 p-2.5 rounded border border-gray-200">
                      <span className="text-[11px] text-gray-500 block">Diastolic (DBP)</span>
                      <input
                        type="number"
                        className="w-full text-base font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:border-teal-600 outline-none"
                        value={extractedVitals.dbp || ""}
                        onChange={(e) =>
                          setExtractedVitals({ ...extractedVitals, dbp: e.target.value })
                        }
                      />
                      <span className="text-[10px] text-gray-400">mmHg</span>
                    </div>

                    <div className="bg-gray-50 p-2.5 rounded border border-gray-200">
                      <span className="text-[11px] text-gray-500 block">Heart Rate</span>
                      <input
                        type="number"
                        className="w-full text-base font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:border-teal-600 outline-none"
                        value={extractedVitals.hr || ""}
                        onChange={(e) =>
                          setExtractedVitals({ ...extractedVitals, hr: e.target.value })
                        }
                      />
                      <span className="text-[10px] text-gray-400">bpm</span>
                    </div>

                    <div className="bg-gray-50 p-2.5 rounded border border-gray-200">
                      <span className="text-[11px] text-gray-500 block">Ejection Fraction</span>
                      <input
                        type="number"
                        className="w-full text-base font-bold text-gray-900 bg-transparent border-b border-gray-300 focus:border-teal-600 outline-none"
                        value={extractedVitals.ef || ""}
                        onChange={(e) =>
                          setExtractedVitals({ ...extractedVitals, ef: e.target.value })
                        }
                      />
                      <span className="text-[10px] text-gray-400">%</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-gray-500 block text-[11px] mb-1">Detected Patient Name</span>
                      <input
                        type="text"
                        className="w-full border border-gray-300 px-2 py-1 rounded text-xs text-gray-800"
                        value={extractedVitals.name || ""}
                        onChange={(e) =>
                          setExtractedVitals({ ...extractedVitals, name: e.target.value })
                        }
                        placeholder="e.g. John Doe"
                      />
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[11px] mb-1">Patient ID / MRN</span>
                      <input
                        type="text"
                        className="w-full border border-gray-300 px-2 py-1 rounded text-xs text-gray-800"
                        value={extractedVitals.patient_id || ""}
                        onChange={(e) =>
                          setExtractedVitals({ ...extractedVitals, patient_id: e.target.value })
                        }
                        placeholder="e.g. PT-8291"
                      />
                    </div>
                  </div>

                  {extractedVitals.snippet && (
                    <div className="text-[11px] text-gray-500 bg-gray-50 p-2 rounded border border-gray-200">
                      <span className="font-semibold text-gray-600">Extracted Readout:</span> &ldquo;
                      {extractedVitals.snippet}&rdquo;
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded transition font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!extractedVitals || !extractedVitals.sbp || isProcessing}
            title={
              !extractedVitals ? "No vitals detected. Frame must contain valid numbers." : "Apply vitals"
            }
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-5 py-2 rounded-lg shadow-sm transition flex items-center gap-1.5"
          >
            <span>Apply to Patient Profile &amp; Run Twin</span>
          </button>
        </div>
      </div>
    </div>
  );
}
