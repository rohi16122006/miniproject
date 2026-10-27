"""Generate docs/dataset_inventory.md (Step 1 deliverable) from the two VitalDB CSVs."""
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "vitaldb"
KEEP = ["caseid", "age", "sex", "weight", "bmi", "asa", "ane_type", "preop_htn", "aline1", "aline2",
        "intraop_eph", "intraop_phe", "intraop_epi", "caseend"]

df = pd.read_csv(RAW / "clinical_data.csv")
tn = pd.read_csv(RAW / "track_names.csv")
key_tracks = tn[tn.Parameter.str.contains(r"ART_SBP|ART_DBP|Solar8000/HR|PHEN_RATE|NEPI_RATE|SNUADC/ART$")]

L = ["# Dataset inventory: VitalDB\n",
     "| Item | Value |", "|---|---|",
     "| Source | VitalDB, high-fidelity multi-parameter vital signs database in surgical patients |",
     "| Official link | https://physionet.org/content/vitaldb/1.0.0/ (also https://vitaldb.net/dataset) |",
     "| Version | 1.0.0 |",
     "| Access | Open access (no credentialing) |",
     "| Licence / data-use terms | See LICENSE.txt on the PhysioNet page; record and follow it before publishing |",
     f"| Cases (rows in clinical_data.csv) | {len(df)} |",
     f"| Unique patients (subjectid) | {df.subjectid.nunique()} |",
     f"| Cases with an arterial line recorded (aline1) | {int(df.aline1.notna().sum())} |",
     f"| Cases with phenylephrine dose > 0 (intraop_phe) | {int((df.intraop_phe > 0).sum())} |",
     "| Intended use | Train and validate short-horizon BP/HR forecasting; observe vasopressor response |",
     "| Limitation | Single Seoul hospital (East Asian patients), surgical setting; does not validate South Asian calibration |",
     "", "## Data dictionary: key clinical columns\n",
     "| Column | Type | Missing % | Example / range |", "|---|---|---|---|"]
for c in KEEP:
    s = df[c]
    ex = f"{s.min():g} to {s.max():g}" if pd.api.types.is_numeric_dtype(s) else ", ".join(map(str, s.dropna().unique()[:4]))
    L.append(f"| {c} | {s.dtype} | {s.isna().mean() * 100:.1f} | {ex} |")
L += ["", "## Key signal tracks (from track_names.csv)\n", "| Track | Description | Type/Hz | Unit |", "|---|---|---|---|"]
for _, r in key_tracks.iterrows():
    L.append(f"| {r.Parameter} | {r.Description} | {r['Type/Hz']} | {r.Unit} |")
L += ["", "## Missing fields to resolve", "",
      "- Drug concentrations are not recorded for phenylephrine: only infusion rate/volume (PK must be modelled)",
      "- Boluses are not tracked as infusion; `intraop_phe` is a case total only",
      "- Femoral-line cases use FEM_* track names instead of ART_*"]
(ROOT / "docs" / "dataset_inventory.md").write_text("\n".join(L) + "\n")
print("wrote docs/dataset_inventory.md")
