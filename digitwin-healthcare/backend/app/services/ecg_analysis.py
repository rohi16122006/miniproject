"""Safe local parsing and signal checks for user-supplied ECG files."""
import csv
import io
import math
import re
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

import numpy as np
from pypdf import PdfReader
from scipy.signal import butter, sosfiltfilt

from ..ml.ecg_model import EXPECTED_LEADS, extract_ptbxl_features

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_SAMPLE_COUNT = 600_000
MAX_PREVIEW_POINTS = 1_500
MIN_SAMPLE_RATE_HZ = 100.0
MAX_SAMPLE_RATE_HZ = 2_000.0
LEAD_NAMES = ("I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6")
UNIT_TO_MV = {"mv": 1.0, "uv": 0.001, "µv": 0.001, "v": 1000.0}


class ECGInputError(ValueError):
    """A supported ECG input failed format or data validation."""


def analyze_file(
    filename: str,
    content: bytes,
    sampling_rate_hz: float | None = None,
    units: str | None = None,
    ocr_text: str | None = None,
) -> dict:
    suffix = Path(filename).suffix.lower()
    if not content:
        raise ECGInputError("The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise ECGInputError("The uploaded file exceeds the 10 MiB limit.")

    if suffix == ".csv":
        if not units:
            raise ECGInputError("Specify the signal amplitude units for a CSV waveform.")
        return _analyze_waveform(
            filename, "CSV waveform", *_read_csv(content, sampling_rate_hz), units
        )
    if suffix == ".zip":
        signal, record_fs, leads, record_units = _read_wfdb_zip(content)
        if sampling_rate_hz is not None and not math.isclose(
            sampling_rate_hz, record_fs, rel_tol=0.01
        ):
            raise ECGInputError("The supplied sampling rate does not match the WFDB header.")
        if not record_units or any(unit.lower() not in UNIT_TO_MV for unit in record_units):
            raise ECGInputError("WFDB signal units must be mV, uV, or V.")
        if len(set(unit.lower() for unit in record_units)) != 1:
            raise ECGInputError("WFDB leads use mixed units. Convert them to a common unit before upload.")
        header_units = record_units[0]
        if units and units.lower() != header_units.lower():
            raise ECGInputError("The supplied units do not match the WFDB header.")
        return _analyze_waveform(
            filename, "WFDB ZIP waveform", signal, record_fs, leads, header_units
        )
    if suffix == ".pdf":
        return _analyze_report(filename, "PDF report", _pdf_text(content))
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        signatures = {
            ".png": content.startswith(b"\x89PNG\r\n\x1a\n"),
            ".jpg": content.startswith(b"\xff\xd8\xff"),
            ".jpeg": content.startswith(b"\xff\xd8\xff"),
            ".webp": len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP",
        }
        if not signatures[suffix]:
            raise ECGInputError("The image content does not match its file extension or is corrupted.")
        if not ocr_text or not ocr_text.strip():
            raise ECGInputError(
                "Image reports require browser OCR text. Enable JavaScript and retry the upload."
            )
        return _analyze_report(filename, "Image report (browser OCR)", ocr_text[:100_000])
    if suffix == ".txt":
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise ECGInputError("Text reports must use UTF-8 encoding.") from None
        return _analyze_report(filename, "Text report", text[:100_000])
    raise ECGInputError(
        "Unsupported file type. Supported: CSV waveform, WFDB ZIP, PDF, PNG/JPG/WEBP image, or TXT report."
    )


def _read_csv(content: bytes, sampling_rate_hz: float | None):
    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        headers = reader.fieldnames or []
        if not headers:
            raise ECGInputError("The CSV must have a header row naming each ECG lead.")
        time_header = next((h for h in headers if h.strip().lower() in {"time_s", "time_sec", "seconds"}), None)
        lead_headers = [
            h for h in headers
            if _normalize_lead_name(h) is not None
        ]
        if not lead_headers:
            raise ECGInputError(
                "No ECG lead columns found. Name columns Lead I, Lead II, Lead III, aVR, aVL, aVF, V1-V6, or ECG."
            )
        normalized_leads = [_normalize_lead_name(header) for header in lead_headers]
        if len(normalized_leads) != len(set(normalized_leads)):
            raise ECGInputError("The CSV contains duplicate ECG lead columns.")

        rows = []
        for row in reader:
            if len(rows) >= MAX_SAMPLE_COUNT:
                raise ECGInputError("The CSV exceeds the 600,000-sample limit.")
            try:
                rows.append([float(row[h]) for h in lead_headers])
            except (TypeError, ValueError):
                raise ECGInputError("CSV lead columns contain missing or non-numeric samples.") from None
        signal = np.asarray(rows, dtype=float)
        if not len(signal):
            raise ECGInputError("The CSV contains no waveform samples.")
        if not np.isfinite(signal).all():
            raise ECGInputError("CSV lead columns contain missing or non-finite samples.")

        sample_times = None
        if time_header:
            try:
                sample_times = np.asarray(
                    [float(row[time_header]) for row in csv.DictReader(io.StringIO(text))],
                    dtype=float,
                )
            except (TypeError, ValueError):
                raise ECGInputError("The CSV time column contains missing or invalid values.") from None
            if len(sample_times) != len(signal) or not np.isfinite(sample_times).all():
                raise ECGInputError("The CSV time column must align with every waveform sample.")
            differences = np.diff(sample_times)
            if len(differences) == 0 or np.any(differences <= 0):
                raise ECGInputError("CSV timestamps must be strictly increasing.")
            median_interval = float(np.median(differences))
            if np.max(np.abs(differences - median_interval)) > median_interval * 0.02:
                raise ECGInputError("CSV timestamps have irregular sample intervals.")
            inferred_fs = 1 / median_interval
            if sampling_rate_hz is not None:
                sampling_rate_hz = _validate_sample_rate(sampling_rate_hz)
                if not math.isclose(sampling_rate_hz, inferred_fs, rel_tol=0.01):
                    raise ECGInputError("The supplied sampling rate conflicts with the CSV time column.")
            sampling_rate_hz = inferred_fs
        if sampling_rate_hz is None:
            raise ECGInputError(
                "Provide the CSV sampling rate in Hz or include a regular time_s column."
            )
        return signal, _validate_sample_rate(sampling_rate_hz), normalized_leads
    except UnicodeDecodeError:
        raise ECGInputError("The CSV must use UTF-8 text encoding.") from None
    except csv.Error as error:
        raise ECGInputError(f"Could not parse the CSV: {error}") from None


def _normalize_lead_name(header: str) -> str | None:
    cleaned = re.sub(r"[\s_-]+", "", header.strip()).lower()
    if cleaned.startswith("lead"):
        cleaned = cleaned[4:]
    return next((lead for lead in LEAD_NAMES if cleaned == lead.lower()), "ECG" if cleaned == "ecg" else None)


def _read_wfdb_zip(content: bytes):
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise ECGInputError("The WFDB upload is not a valid ZIP archive.") from None

    with archive:
        files = [item for item in archive.infolist() if not item.is_dir()]
        total_size = sum(item.file_size for item in files)
        if len(files) > 20 or total_size > MAX_ARCHIVE_BYTES:
            raise ECGInputError("WFDB archive exceeds its file-count or uncompressed-size limit.")
        for item in files:
            path = PurePosixPath(item.filename)
            if path.is_absolute() or ".." in path.parts or "\\" in item.filename:
                raise ECGInputError("WFDB archive contains an unsafe file path.")
            if path.suffix.lower() not in {".hea", ".dat"}:
                raise ECGInputError("WFDB ZIP files may contain only .hea and .dat record files.")
        headers = [item for item in files if PurePosixPath(item.filename).suffix.lower() == ".hea"]
        if len(headers) != 1:
            raise ECGInputError("WFDB ZIP must contain exactly one .hea header and its signal data.")
        try:
            with tempfile.TemporaryDirectory(prefix="digitwin-ecg-") as temp_dir:
                root = Path(temp_dir)
                for item in files:
                    output = root.joinpath(*PurePosixPath(item.filename).parts)
                    output.parent.mkdir(parents=True, exist_ok=True)
                    output.write_bytes(archive.read(item))
                header = root.joinpath(*PurePosixPath(headers[0].filename).parts)
                _validate_wfdb_header_paths(header)
                record = _read_wfdb_record(header.with_suffix(""))
                if record.p_signal is None:
                    raise ECGInputError("WFDB record does not contain physical signal values.")
                return (
                    np.asarray(record.p_signal, dtype=float),
                    float(record.fs),
                    list(record.sig_name),
                    list(record.units),
                )
        except ECGInputError:
            raise
        except Exception as error:
            raise ECGInputError(f"Could not read the WFDB record: {error}") from None


def _validate_wfdb_header_paths(header: Path):
    try:
        lines = [line.strip() for line in header.read_text(encoding="ascii").splitlines() if line.strip()]
        fields = lines[0].split()
        signal_count = int(fields[1])
    except (OSError, UnicodeError, IndexError, ValueError):
        raise ECGInputError("WFDB header is malformed or unreadable.") from None
    if signal_count < 1 or len(lines) < signal_count + 1:
        raise ECGInputError("WFDB header does not list all expected signal files.")
    for line in lines[1 : signal_count + 1]:
        signal_file = line.split()[0]
        if (
            signal_file == "~"
            or PurePosixPath(signal_file).name != signal_file
            or "\\" in signal_file
            or not signal_file.lower().endswith(".dat")
            or not (header.parent / signal_file).is_file()
        ):
            raise ECGInputError("WFDB header references an unsafe or missing signal file.")


def _read_wfdb_record(record_base: Path):
    import wfdb

    return wfdb.rdrecord(str(record_base), physical=True)


def _validate_sample_rate(sample_rate: float) -> float:
    if not math.isfinite(sample_rate) or not MIN_SAMPLE_RATE_HZ <= sample_rate <= MAX_SAMPLE_RATE_HZ:
        raise ECGInputError(
            f"Sampling rate must be between {MIN_SAMPLE_RATE_HZ:g} and {MAX_SAMPLE_RATE_HZ:g} Hz."
        )
    return round(sample_rate, 6)


def _analyze_waveform(filename: str, detected_format: str, signal, sample_rate, leads, units):
    if units.lower() not in UNIT_TO_MV:
        raise ECGInputError("Amplitude units must be mV, uV, or V.")
    rate = _validate_sample_rate(float(sample_rate))
    values = np.asarray(signal, dtype=float)
    if values.ndim != 2 or values.shape[1] != len(leads):
        raise ECGInputError("ECG waveform must be a samples-by-leads numeric matrix.")
    if len(values) > MAX_SAMPLE_COUNT:
        raise ECGInputError("The ECG waveform exceeds the 600,000-sample limit.")
    if not np.isfinite(values).all():
        raise ECGInputError("ECG waveform has missing or non-finite values; samples are not imputed.")
    duration = len(values) / rate
    if duration < 2:
        raise ECGInputError("ECG waveform must contain at least 2 seconds of signal.")
    if duration > 600:
        raise ECGInputError("ECG waveform must not exceed 10 minutes.")

    mv = values * UNIT_TO_MV[units.lower()]
    nyquist = rate / 2
    high_cutoff = min(40.0, nyquist * 0.8)
    sos = butter(4, [0.5, high_cutoff], btype="bandpass", fs=rate, output="sos")
    try:
        filtered = sosfiltfilt(sos, mv, axis=0)
    except ValueError:
        raise ECGInputError("The waveform is too short to apply the configured zero-phase filter.") from None

    warnings = []
    signal_summary = {}
    for index, lead in enumerate(leads):
        column = mv[:, index]
        flat_fraction = float(np.mean(np.abs(np.diff(column)) <= 1e-9))
        peak_to_peak = float(np.ptp(column))
        signal_summary[lead] = {
            "peak_to_peak_mV": round(peak_to_peak, 6),
            "flat_line_fraction": round(flat_fraction, 6),
        }
        if flat_fraction > 0.05:
            warnings.append(f"{lead}: more than 5% of consecutive samples are unchanged.")
        if peak_to_peak == 0:
            warnings.append(f"{lead}: signal is flat.")
    if not warnings:
        warnings.append("Basic format and signal checks passed; this does not establish authenticity or clinical quality.")

    stride = max(1, math.ceil(len(values) / MAX_PREVIEW_POINTS))
    preview_indices = np.arange(0, len(values), stride)
    return {
        "filename": filename,
        "detected_format": detected_format,
        "analysis_type": "waveform",
        "sampling_rate_hz": rate,
        "duration_seconds": round(duration, 3),
        "units": "mV (normalized from upload)",
        "available_leads": list(leads),
        "sample_count": int(len(values)),
        "signal_quality": {
            "status": "review" if any("flat" in warning or "unchanged" in warning for warning in warnings) else "basic_checks_passed",
            "indicators": signal_summary,
            "warnings": warnings,
            "scope": "Engineering format checks only; not clinical signal validation.",
        },
        "preprocessing": {
            "method": f"4th-order Butterworth bandpass, 0.5-{high_cutoff:g} Hz, zero-phase",
            "model_input_not_imputed": True,
        },
        "measurements": _extract_waveform_measurements(filtered, rate, leads, duration),
        "waveform_preview": {
            "time_seconds": [round(index / rate, 4) for index in preview_indices],
            "leads_mV": {
                lead: np.round(filtered[preview_indices, index], 6).tolist()
                for index, lead in enumerate(leads)
            },
        },
        "extracted_text": None,
        "warnings": warnings,
        "provenance": "user_uploaded_signal",
        "model_features": _classification_features(mv, rate, leads),
    }


def _classification_features(signal, sample_rate, leads):
    if tuple(leads) != EXPECTED_LEADS:
        return None
    try:
        return extract_ptbxl_features(signal, sample_rate, list(leads)).tolist()
    except ValueError:
        return None


def _pdf_text(content: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(content), strict=True)
        if len(reader.pages) > 20:
            raise ECGInputError("PDF reports are limited to 20 pages.")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except ECGInputError:
        raise
    except Exception as error:
        raise ECGInputError(f"Could not read the PDF report: {error}") from None
    if not text.strip():
        raise ECGInputError(
            "The PDF contains no extractable text. Scanned PDF page OCR is not supported; upload an image or text-based PDF."
        )
    return text[:100_000]


def _extract_waveform_measurements(filtered: np.ndarray, rate: float, leads: list[str], duration: float) -> dict:
    measurements = _empty_measurements()
    if duration < 1.5 or len(leads) == 0:
        return measurements

    lead_idx = None
    for target in ("II", "I", "V5", "V4", "V2"):
        if target in leads:
            lead_idx = list(leads).index(target)
            break
    if lead_idx is None:
        lead_idx = 0

    try:
        sig = filtered[:, lead_idx]
        min_distance = max(1, int(rate * 0.27))
        from scipy.signal import find_peaks

        p80 = float(np.percentile(sig, 80))
        p99 = float(np.percentile(sig, 99))
        if p99 > p80:
            thresh = p80 + 0.25 * (p99 - p80)
            peaks, _ = find_peaks(sig, distance=min_distance, height=thresh)
            if len(peaks) >= 2:
                rr_intervals_s = np.diff(peaks) / rate
                valid_rr = rr_intervals_s[(rr_intervals_s >= 0.28) & (rr_intervals_s <= 2.2)]
                if len(valid_rr) >= 1:
                    median_rr = float(np.median(valid_rr))
                    hr = round(60.0 / median_rr, 1)
                    measurements["heart_rate_bpm"] = hr
                    measurements["reported_interpretation"] = f"Calculated from R-R intervals (HR: {hr:g} bpm)"
    except Exception:
        pass

    return measurements


def _empty_measurements():
    return {
        "heart_rate_bpm": None,
        "pr_interval_ms": None,
        "qrs_duration_ms": None,
        "qt_interval_ms": None,
        "qtc_interval_ms": None,
        "reported_interpretation": None,
    }


def _analyze_report(filename: str, detected_format: str, text: str) -> dict:
    measurements = _empty_measurements()
    patterns = {
        "heart_rate_bpm": r"(?:heart\s*rate|ventricular\s*rate|\bHR\b)\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:bpm)?",
        "pr_interval_ms": r"\bPR(?:\s+interval)?\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:ms|msec)?",
        "qrs_duration_ms": r"\bQRS(?:\s+(?:duration|width))?\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:ms|msec)?",
        "qt_interval_ms": r"\bQT(?:\s+interval)?\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:ms|msec)?",
        "qtc_interval_ms": r"\bQTc(?:\s+interval)?\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:ms|msec)?",
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            measurements[key] = float(match.group(1))
    interpretation = re.search(
        r"(?:ECG\s+)?(?:interpretation|impression|diagnosis)\s*[:=-]\s*([^\r\n]+)",
        text,
        flags=re.IGNORECASE,
    )
    if interpretation:
        measurements["reported_interpretation"] = interpretation.group(1).strip()[:500]

    missing = [key for key, value in measurements.items() if value is None]
    warnings = [
        "Extracted measurements and report text are unverified. Review against the original report.",
        "OCR or text extraction may omit or misread values; this is not a confirmed diagnosis.",
    ]
    if missing:
        warnings.append(f"Not found in the source text: {', '.join(missing)}.")
    if not text.strip():
        warnings.append("No report text was available to parse.")
    return {
        "filename": filename,
        "detected_format": detected_format,
        "analysis_type": "report",
        "sampling_rate_hz": None,
        "duration_seconds": None,
        "units": None,
        "available_leads": [],
        "sample_count": None,
        "signal_quality": None,
        "measurements": measurements,
        "missing_measurements": missing,
        "waveform_preview": None,
        "extracted_text": text[:100_000],
        "warnings": warnings,
        "provenance": "uploaded_report_text_unverified",
        "model_features": None,
    }
