import io
import zipfile

import numpy as np
import pandas as pd
import pytest
import wfdb
from fastapi.testclient import TestClient

from app.api import ecg as ecg_api
from app.main import app
from app.ml.ecg_model import (
    FEATURE_COUNT,
    FEATURE_VERSION,
    MODEL_VERSION,
    extract_ptbxl_features,
    predict_from_features,
)
from app.ml import ecg_model
from app.services.ecg_analysis import ECGInputError, analyze_file

client = TestClient(app)


def csv_waveform(samples=400, sample_rate=200):
    times = np.arange(samples) / sample_rate
    lead_i = 0.8 * np.sin(2 * np.pi * 1.2 * times)
    lead_ii = 0.6 * np.sin(2 * np.pi * 1.2 * times + 0.1)
    lines = ["time_s,Lead I,Lead II"]
    lines.extend(f"{time:.6f},{first:.6f},{second:.6f}" for time, first, second in zip(times, lead_i, lead_ii))
    return "\n".join(lines).encode()


def test_csv_waveform_is_validated_filtered_and_retrievable():
    response = client.post(
        "/ecg/analyze",
        files={"file": ("test.csv", csv_waveform(), "text/csv")},
        data={"units": "mV"},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["detected_format"] == "CSV waveform"
    assert result["sample_count"] == 400
    assert result["sampling_rate_hz"] == pytest.approx(200)
    assert result["available_leads"] == ["I", "II"]
    assert result["waveform_preview"]["leads_mV"]["I"]
    assert result["measurements"]["heart_rate_bpm"] == pytest.approx(72, abs=2)
    assert result["source_document_retained"] is False
    assert result["model_input_compatible"] is False
    assert "model_features" not in result

    retrieved = client.get(f"/ecg/analyses/{result['analysis_id']}")
    assert retrieved.status_code == 200
    stored = retrieved.json()
    assert stored["filename"] == "ECG upload"
    assert stored["original_filename_retained"] is False
    assert stored["source_document_retained"] is False
    assert stored["extracted_text_retained"] is False
    assert "waveform_preview" not in stored["result"]
    assert "extracted_text" not in stored["result"]


def test_ecg_analysis_can_link_to_existing_simulation_only():
    simulation = client.post("/simulate", json={"horizon_h": 1}).json()
    response = client.post(
        "/ecg/analyze",
        files={"file": ("test.csv", csv_waveform(), "text/csv")},
        data={"units": "mV", "run_id": str(simulation["run_id"])},
    )
    assert response.status_code == 200
    analysis_id = response.json()["analysis_id"]
    assert response.json()["associated_run_id"] == simulation["run_id"]
    assert client.get(f"/ecg/analyses/{analysis_id}").json()["simulation_id"] == simulation["run_id"]
    assert len(client.get("/ecg/analyses", params={"run_id": simulation["run_id"]}).json()) == 1

    bad_link = client.post(
        "/ecg/analyze",
        files={"file": ("test.csv", csv_waveform(), "text/csv")},
        data={"units": "mV", "run_id": "99999"},
    )
    assert bad_link.status_code == 404


@pytest.mark.parametrize(
    "filename,content,data,expected_message",
    [
        ("trace.csv", b"", {"units": "mV"}, "empty"),
        ("trace.csv", b"not a CSV", {"units": "mV"}, "lead columns"),
        ("trace.csv", csv_waveform(), {}, "units"),
        ("trace.csv", csv_waveform().replace(b",0.", b",,0."), {"units": "mV"}, "missing"),
        ("trace.csv", csv_waveform(), {"units": "mV", "sampling_rate_hz": "250"}, "conflicts"),
        ("trace.csv", csv_waveform(), {"units": "mV", "sampling_rate_hz": "20"}, "between"),
        ("trace.bin", b"unsupported", {}, "Unsupported"),
        ("report.txt", b"\xff\xfe\xff", {}, "UTF-8"),
    ],
)
def test_upload_validation_errors(filename, content, data, expected_message):
    response = client.post(
        "/ecg/analyze",
        files={"file": (filename, content, "application/octet-stream")},
        data=data,
    )
    assert response.status_code == 422
    assert expected_message.lower() in response.json()["detail"].lower()


def test_signal_requires_enough_samples_and_rejects_nonfinite_values():
    short = b"time_s,Lead II\n0,0\n0.01,0.1\n"
    response = client.post(
        "/ecg/analyze",
        files={"file": ("short.csv", short, "text/csv")},
        data={"units": "mV"},
    )
    assert response.status_code == 422
    assert "at least 2 seconds" in response.json()["detail"]

    missing = csv_waveform().replace(b"0.000000,0.000000", b"0.000000,")
    response = client.post(
        "/ecg/analyze",
        files={"file": ("missing.csv", missing, "text/csv")},
        data={"units": "mV"},
    )
    assert response.status_code == 422
    assert "missing" in response.json()["detail"].lower()


def test_pdf_and_image_report_extraction_marks_values_as_unverified():
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    empty_pdf = io.BytesIO()
    writer.write(empty_pdf)
    response = client.post(
        "/ecg/analyze",
        files={"file": ("empty.pdf", empty_pdf.getvalue(), "application/pdf")},
    )
    assert response.status_code == 422
    assert "no extractable text" in response.json()["detail"].lower()

    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=300)
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    font_reference = writer._add_object(font)
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_reference})}
    )
    content = DecodedStreamObject()
    content.set_data(b"BT /F1 12 Tf 72 220 Td (HR: 72 bpm PR: 160 ms) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(content)
    text_pdf = io.BytesIO()
    writer.write(text_pdf)
    response = client.post(
        "/ecg/analyze",
        files={"file": ("report.pdf", text_pdf.getvalue(), "application/pdf")},
    )
    assert response.status_code == 200
    assert response.json()["detected_format"] == "PDF report"
    assert response.json()["measurements"]["heart_rate_bpm"] == 72
    assert response.json()["measurements"]["pr_interval_ms"] == 160
    assert "HR: 72 bpm" in response.json()["extracted_text"]

    image = b"\x89PNG\r\n\x1a\n" + b"test-image-content"
    response = client.post(
        "/ecg/analyze",
        files={"file": ("report.png", image, "image/png")},
        data={"ocr_text": "HR: 72 bpm\nPR interval: 160 ms\nQRS: 90 ms\nQT: 400 ms\nQTc: 420 ms\nInterpretation: Sinus rhythm"},
    )
    assert response.status_code == 200
    result = response.json()
    assert result["measurements"]["heart_rate_bpm"] == 72
    assert result["measurements"]["pr_interval_ms"] == 160
    assert result["measurements"]["qtc_interval_ms"] == 420
    assert result["measurements"]["reported_interpretation"] == "Sinus rhythm"
    assert "Sinus rhythm" in result["extracted_text"]
    assert any("unverified" in warning for warning in result["warnings"])
    assert result["extracted_text_retained"] is False
    assert "extracted_text" not in client.get(f"/ecg/analyses/{result['analysis_id']}").json()["result"]


def test_image_without_ocr_or_matching_signature_is_rejected():
    with pytest.raises(ECGInputError, match="browser OCR"):
        analyze_file("report.jpg", b"\xff\xd8\xffimage", ocr_text=None)
    with pytest.raises(ECGInputError, match="does not match"):
        analyze_file("report.jpg", b"not an image", ocr_text="HR 72")


def test_wfdb_zip_header_supplies_sampling_rate_and_units(tmp_path):
    signal = np.column_stack(
        [0.5 * np.sin(np.arange(400) * 2 * np.pi / 100)]
    )
    wfdb.wrsamp(
        record_name="record",
        fs=200,
        units=["mV"],
        sig_name=["II"],
        p_signal=signal,
        write_dir=str(tmp_path),
    )
    archive_bytes = io.BytesIO()
    with zipfile.ZipFile(archive_bytes, "w") as archive:
        archive.write(tmp_path / "record.hea", "record.hea")
        archive.write(tmp_path / "record.dat", "record.dat")
    result = analyze_file("record.zip", archive_bytes.getvalue())
    assert result["detected_format"] == "WFDB ZIP waveform"
    assert result["sampling_rate_hz"] == 200
    assert result["available_leads"] == ["II"]


def test_wfdb_zip_rejects_unsafe_paths_and_irregular_csv_times():
    archive_bytes = io.BytesIO()
    with zipfile.ZipFile(archive_bytes, "w") as archive:
        archive.writestr("../record.hea", "unsafe")
    with pytest.raises(ECGInputError, match="unsafe"):
        analyze_file("record.zip", archive_bytes.getvalue())

    irregular = b"time_s,Lead II\n0,0\n0.01,0.1\n0.03,0.2\n"
    with pytest.raises(ECGInputError, match="irregular"):
        analyze_file("irregular.csv", irregular, units="mV")


def test_model_requires_real_artifact_and_uses_fixed_supported_features(monkeypatch, tmp_path):
    monkeypatch.setattr(ecg_api, "MODEL_PATH", tmp_path / "missing.joblib")
    monkeypatch.setattr(ecg_model, "MODEL_PATH", tmp_path / "missing.joblib")
    assert client.get("/ecg/model").json()["available"] is False
    response = client.post(
        "/ecg/predict",
        files={"file": ("trace.csv", csv_waveform(), "text/csv")},
        data={"units": "mV"},
    )
    assert response.status_code == 503

    rng = np.random.default_rng(2)
    signal = rng.normal(0, 0.2, size=(1000, 12))
    features = extract_ptbxl_features(
        signal,
        100,
        ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"],
    )
    assert features.shape == (FEATURE_COUNT,)
    assert np.isfinite(features).all()
    with pytest.raises(ValueError, match="10-second"):
        extract_ptbxl_features(signal[:500], 100, ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"])


def test_training_split_detects_patient_leakage_and_missing_dataset(tmp_path):
    from app.ml.train_ecg import patient_fold_split, train

    metadata = pd.DataFrame(
        {"patient_id": [1, 2, 3], "strat_fold": [1, 9, 10]}
    )
    masks = patient_fold_split(metadata)
    assert masks["train"].tolist() == [True, False, False]
    assert masks["validation"].tolist() == [False, True, False]
    assert masks["test"].tolist() == [False, False, True]

    leaking = pd.DataFrame(
        {"patient_id": [1, 1, 3], "strat_fold": [1, 9, 10]}
    )
    with pytest.raises(ValueError, match="multiple folds"):
        patient_fold_split(leaking)
    with pytest.raises(FileNotFoundError, match="PTB-XL files are missing"):
        train(tmp_path / "missing_dataset", tmp_path / "artifacts")


def test_saved_ecg_model_artifact_loads_and_predicts(tmp_path):
    import joblib
    from sklearn.linear_model import LogisticRegression
    from sklearn.multiclass import OneVsRestClassifier
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    rng = np.random.default_rng(12)
    features = rng.normal(size=(20, FEATURE_COUNT))
    labels = np.column_stack(
        [(features[:, 0] > 0).astype(int), (features[:, 1] > 0).astype(int)]
    )
    pipeline = Pipeline(
        [
            ("scale", StandardScaler()),
            ("classifier", OneVsRestClassifier(LogisticRegression(max_iter=200))),
        ]
    ).fit(features, labels)
    model_path = tmp_path / "ptbxl_logistic.joblib"
    joblib.dump(
        {
            "pipeline": pipeline,
            "labels": ["CD", "MI"],
            "model_version": MODEL_VERSION,
            "dataset": "PTB-XL 1.0.3",
            "feature_version": FEATURE_VERSION,
        },
        model_path,
    )
    prediction = predict_from_features(features[0], model_path)
    assert prediction["model_version"] == MODEL_VERSION
    assert prediction["dataset"] == "PTB-XL 1.0.3"
    assert [item["label"] for item in prediction["predictions"]] == ["CD", "MI"]
    assert all(np.isfinite(item["score"]) for item in prediction["predictions"])


def test_training_pipeline_runs_on_synthetic_fixture_without_claiming_clinical_metrics(tmp_path):
    from app.ml.train_ecg import train

    dataset = tmp_path / "synthetic_ptbxl_fixture"
    record_directory = dataset / "records100" / "00000"
    record_directory.mkdir(parents=True)
    lead_names = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]
    rows = []
    time = np.arange(1000) / 100
    record_index = 0
    for fold in (1, 9, 10):
        for label, code, frequency in (("MI", "A", 1.2), ("NORM", "B", 6.0)):
            for replicate in range(2):
                record_index += 1
                record_name = f"ecg{record_index:02d}"
                waveform = np.column_stack(
                    [
                        0.5 * np.sin(2 * np.pi * frequency * time + channel * 0.01)
                        + replicate * 0.001
                        for channel in range(12)
                    ]
                )
                wfdb.wrsamp(
                    record_name=record_name,
                    fs=100,
                    units=["mV"] * 12,
                    sig_name=lead_names,
                    p_signal=waveform,
                    write_dir=str(record_directory),
                )
                rows.append(
                    {
                        "patient_id": record_index,
                        "strat_fold": fold,
                        "scp_codes": f"{{'{code}': 100}}",
                        "filename_lr": f"records100/00000/{record_name}",
                    }
                )
    pd.DataFrame(rows).to_csv(dataset / "ptbxl_database.csv", index=False)
    pd.DataFrame(
        {"diagnostic": [1, 1], "diagnostic_class": ["MI", "NORM"]},
        index=["A", "B"],
    ).to_csv(dataset / "scp_statements.csv")

    results, artifact_path = train(dataset, tmp_path / "artifacts", seed=42)
    assert artifact_path.is_file()
    assert results["records"] == {"train": 4, "validation": 4, "test": 4}
    assert set(results["test"]["per_class"]) == {"MI", "NORM"}
    assert (tmp_path / "artifacts" / "metrics.json").is_file()
    assert (tmp_path / "artifacts" / "training_config.json").is_file()
