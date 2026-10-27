"""Train and evaluate a PTB-XL diagnostic-superclass baseline."""
import argparse
import ast
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    multilabel_confusion_matrix,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import MultiLabelBinarizer, StandardScaler

from .ecg_model import (
    EXPECTED_LEADS,
    FEATURE_VERSION,
    MODEL_VERSION,
    TARGET_SAMPLE_RATE_HZ,
    extract_ptbxl_features,
)


def patient_fold_split(metadata: pd.DataFrame):
    required = {"patient_id", "strat_fold"}
    if not required.issubset(metadata.columns):
        raise ValueError("PTB-XL metadata must include patient_id and strat_fold.")
    if metadata["patient_id"].isna().any() or metadata["strat_fold"].isna().any():
        raise ValueError("PTB-XL patient_id and strat_fold values must be present for every record.")
    if not metadata["strat_fold"].between(1, 10).all():
        raise ValueError("PTB-XL strat_fold values must be in the range 1-10.")
    patient_folds = metadata.groupby("patient_id")["strat_fold"].nunique()
    if (patient_folds > 1).any():
        raise ValueError("Patient leakage risk: at least one patient appears in multiple folds.")
    patient_ids_by_split = {
        "train": set(metadata.loc[metadata["strat_fold"].between(1, 8), "patient_id"]),
        "validation": set(metadata.loc[metadata["strat_fold"] == 9, "patient_id"]),
        "test": set(metadata.loc[metadata["strat_fold"] == 10, "patient_id"]),
    }
    names = list(patient_ids_by_split)
    for i, first in enumerate(names):
        for second in names[i + 1 :]:
            if patient_ids_by_split[first] & patient_ids_by_split[second]:
                raise ValueError(f"Patient leakage between {first} and {second} folds.")
    return {
        "train": metadata["strat_fold"].between(1, 8).to_numpy(),
        "validation": (metadata["strat_fold"] == 9).to_numpy(),
        "test": (metadata["strat_fold"] == 10).to_numpy(),
    }


def _decode_codes(value):
    if isinstance(value, dict):
        return value
    try:
        parsed = ast.literal_eval(value)
    except (SyntaxError, ValueError, TypeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _metrics(labels, truth, scores):
    binary = (scores >= 0.5).astype(int)
    precision, recall, f1, support = precision_recall_fscore_support(
        truth, binary, average=None, zero_division=0
    )
    per_label = {}
    aurocs = []
    average_precisions = []
    for index, label in enumerate(labels):
        auroc = None
        ap = None
        if len(np.unique(truth[:, index])) == 2:
            auroc = float(roc_auc_score(truth[:, index], scores[:, index]))
            ap = float(average_precision_score(truth[:, index], scores[:, index]))
            aurocs.append(auroc)
            average_precisions.append(ap)
        per_label[label] = {
            "precision": float(precision[index]),
            "recall": float(recall[index]),
            "f1": float(f1[index]),
            "support": int(support[index]),
            "auroc": auroc,
            "average_precision": ap,
            "confusion_matrix": multilabel_confusion_matrix(truth, binary)[index].tolist(),
        }
    return {
        "threshold": 0.5,
        "macro_f1": float(np.mean(f1)),
        "macro_auroc": float(np.mean(aurocs)) if aurocs else None,
        "macro_average_precision": float(np.mean(average_precisions)) if average_precisions else None,
        "per_class": per_label,
        "all_negative_baseline": {
            "macro_f1": float(np.mean(
                precision_recall_fscore_support(
                    truth, np.zeros_like(truth), average=None, zero_division=0
                )[2]
            )),
            "macro_auroc": None,
        },
    }


def train(dataset_root: Path, out_dir: Path, seed: int = 42):
    metadata_path = dataset_root / "ptbxl_database.csv"
    statements_path = dataset_root / "scp_statements.csv"
    if not metadata_path.is_file() or not statements_path.is_file():
        raise FileNotFoundError(
            "PTB-XL files are missing. Expected ptbxl_database.csv and scp_statements.csv."
        )
    metadata = pd.read_csv(metadata_path)
    statements = pd.read_csv(statements_path, index_col=0)
    required_statements = {"diagnostic", "diagnostic_class"}
    if not required_statements.issubset(statements.columns):
        raise ValueError("SCP statements lack diagnostic and diagnostic_class labels.")
    diagnostic_mask = pd.to_numeric(statements["diagnostic"], errors="coerce").fillna(0).astype(bool)
    diagnostic_classes = statements.loc[diagnostic_mask, "diagnostic_class"].dropna()
    code_to_class = diagnostic_classes.to_dict()
    codes = metadata["scp_codes"].map(_decode_codes)
    label_lists = [
        sorted(
            {
                code_to_class[code]
                for code in patient_codes
                if code in code_to_class and isinstance(code_to_class[code], str)
            }
        )
        for patient_codes in codes
    ]
    split = patient_fold_split(metadata)
    labelled = np.array([bool(labels) for labels in label_lists])
    train_mask = split["train"] & labelled
    val_mask = split["validation"] & labelled
    test_mask = split["test"] & labelled
    if min(train_mask.sum(), val_mask.sum(), test_mask.sum()) == 0:
        raise ValueError("PTB-XL must have labelled records in train, validation, and test folds.")

    filename_column = "filename_lr" if "filename_lr" in metadata.columns else None
    if filename_column is None:
        raise ValueError("PTB-XL metadata is missing filename_lr; the 100-Hz records are required.")
    lead_names = list(EXPECTED_LEADS)
    feature_rows = []
    for index, relative_path in enumerate(metadata[filename_column]):
        if not (train_mask[index] or val_mask[index] or test_mask[index]):
            feature_rows.append(None)
            continue
        record_path = dataset_root / str(relative_path)
        try:
            import wfdb

            signal, fields = wfdb.rdsamp(str(record_path))
        except Exception as error:
            raise ValueError(f"Could not read PTB-XL waveform {relative_path}: {error}") from error
        if float(fields["fs"]) != TARGET_SAMPLE_RATE_HZ or list(fields["sig_name"]) != lead_names:
            raise ValueError(f"Unexpected sample rate or lead order in {relative_path}.")
        feature_rows.append(
            extract_ptbxl_features(signal, fields["fs"], fields["sig_name"])
        )

    features = np.vstack([row for row in feature_rows if row is not None])
    labelled_indices = np.flatnonzero(train_mask | val_mask | test_mask)
    classes = sorted({label for labels in label_lists for label in labels})
    binarizer = MultiLabelBinarizer(classes=classes)
    targets = binarizer.fit_transform([label_lists[index] for index in labelled_indices])
    feature_rows_by_index = {
        source_index: row
        for source_index, row in zip(
            [i for i, row in enumerate(feature_rows) if row is not None],
            features,
            strict=True,
        )
    }
    features = np.vstack([feature_rows_by_index[index] for index in labelled_indices])
    dataset_positions = {index: position for position, index in enumerate(labelled_indices)}
    train_positions = np.array([dataset_positions[i] for i in np.flatnonzero(train_mask)])
    val_positions = np.array([dataset_positions[i] for i in np.flatnonzero(val_mask)])
    test_positions = np.array([dataset_positions[i] for i in np.flatnonzero(test_mask)])
    y_train, y_val, y_test = targets[train_positions], targets[val_positions], targets[test_positions]
    for index, label in enumerate(classes):
        if len(np.unique(y_train[:, index])) < 2:
            raise ValueError(f"Training fold does not contain both outcomes for label {label}.")

    pipeline = Pipeline(
        [
            ("scale", StandardScaler()),
            (
                "classifier",
                OneVsRestClassifier(
                    LogisticRegression(
                        class_weight="balanced",
                        max_iter=2_000,
                        random_state=seed,
                    )
                ),
            ),
        ]
    )
    pipeline.fit(features[train_positions], y_train)
    validation_scores = pipeline.predict_proba(features[val_positions])
    test_scores = pipeline.predict_proba(features[test_positions])
    results = {
        "task": "multi-label PTB-XL diagnostic-superclass classification",
        "dataset_version": "PTB-XL 1.0.3",
        "label_classes": classes,
        "records": {
            "train": int(len(train_positions)),
            "validation": int(len(val_positions)),
            "test": int(len(test_positions)),
        },
        "patients": {
            "train": int(metadata.loc[train_mask, "patient_id"].nunique()),
            "validation": int(metadata.loc[val_mask, "patient_id"].nunique()),
            "test": int(metadata.loc[test_mask, "patient_id"].nunique()),
        },
        "validation": _metrics(classes, y_val, validation_scores),
        "test": _metrics(classes, y_test, test_scores),
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact = {
        "pipeline": pipeline,
        "labels": classes,
        "model_version": MODEL_VERSION,
        "dataset": "PTB-XL 1.0.3",
        "feature_version": FEATURE_VERSION,
        "preprocessing": {
            "lead_order": lead_names,
            "target_sample_rate_hz": TARGET_SAMPLE_RATE_HZ,
            "duration_seconds": 10,
        },
    }
    artifact_path = out_dir / "ptbxl_logistic.joblib"
    joblib.dump(artifact, artifact_path)
    (out_dir / "metrics.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    (out_dir / "training_config.json").write_text(
        json.dumps(
            {
                "seed": seed,
                "model": "StandardScaler + one-vs-rest class-balanced logistic regression",
                "max_iter": 2_000,
                "threshold": 0.5,
                "feature_version": FEATURE_VERSION,
                "dataset_root": str(dataset_root.resolve()),
                "dataset_version": "PTB-XL 1.0.3",
                "patient_level_split": "official strat_fold 1-8/9/10, verified by patient_id",
                "training_records": int(len(train_positions)),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return results, artifact_path


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", required=True, type=Path)
    parser.add_argument("--out", default=Path("app/ml/ecg_artifacts"), type=Path)
    parser.add_argument("--seed", default=42, type=int)
    args = parser.parse_args(argv)
    results, artifact_path = train(args.dataset_root, args.out, args.seed)
    print(json.dumps({"artifact": str(artifact_path), "results": results}, indent=2))


if __name__ == "__main__":
    main()
