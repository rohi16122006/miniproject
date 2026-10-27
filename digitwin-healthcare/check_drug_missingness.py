import numpy as np
from pathlib import Path

folder = Path("data/raw/vitaldb")
files = sorted(folder.glob("case_*.npz"))

print("DigiTwin: raw dataset quality report")
print("Cases found:", len(files))

total_samples = 0
total_missing_drug = 0

for path in files:
    with np.load(path, allow_pickle=False) as data:
        values = data["values"]
        columns = data["columns"].tolist()

    drug_idx = columns.index("drug_rate")
    drug = values[:, drug_idx]
    missing = int((~np.isfinite(drug)).sum())

    total_samples += len(drug)
    total_missing_drug += missing

    print(
        f"{path.stem}: samples={len(drug)}, "
        f"missing drug rate={missing}, "
        f"missing %={100 * missing / len(drug):.1f}"
    )

print("\nOVERALL")
print("Total samples:", total_samples)
print("Missing drug-rate samples:", total_missing_drug)

if total_samples:
    print(
        "Missing drug-rate percentage:",
        round(100 * total_missing_drug / total_samples, 2)
    )

print("\nRead-only diagnostic completed.")
