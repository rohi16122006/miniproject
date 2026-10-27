# DigiTwin Software Stack License Audit

*Verification of Zero-License-Cost Open-Source Stack Requirement*

---

## 1. Executive Summary
DigiTwin was architected using 100% commercially permissive, zero-license-cost open-source software. No proprietary commercial runtimes, closed-source SDKs, or paid simulation engines (such as MATLAB/Simulink or Ansys) are used.

---

## 2. Component License Inventory

### Backend Stack (Python 3.10+)
| Component | Version | License | License Cost | Permissive Commercial / Academic Use |
|---|---|---|---|---|
| **Python** | 3.10+ | Python Software Foundation (PSF) | $0.00 | Yes |
| **FastAPI** | 0.110+ | MIT License | $0.00 | Yes |
| **Uvicorn** | 0.28+ | BSD 3-Clause | $0.00 | Yes |
| **Pydantic** | 2.6+ | MIT License | $0.00 | Yes |
| **SciPy** | 1.12+ | BSD 3-Clause | $0.00 | Yes |
| **NumPy** | 1.26+ | BSD 3-Clause | $0.00 | Yes |
| **Pandas** | 2.2+ | BSD 3-Clause | $0.00 | Yes |
| **XGBoost** | 2.0+ | Apache License 2.0 | $0.00 | Yes |
| **SQLite** | 3.x | Public Domain | $0.00 | Yes |
| **pytest** | 8.0+ | MIT License | $0.00 | Yes |

### Frontend Stack (JavaScript / HTML5 / CSS3)
| Component | Version | License | License Cost | Permissive Commercial / Academic Use |
|---|---|---|---|---|
| **React** | 18.2+ | MIT License | $0.00 | Yes |
| **Vite** | 5.1+ | MIT License | $0.00 | Yes |
| **Tailwind CSS** | 3.4+ | MIT License | $0.00 | Yes |
| **Recharts** | 2.12+ | MIT License | $0.00 | Yes |
| **PostCSS / Autoprefixer**| 8.4+ | MIT License | $0.00 | Yes |

### Dataset & Assets
| Component | Source | Access / Terms | License Cost |
|---|---|---|---|
| **VitalDB Dataset** | PhysioNet v1.0.0 | Open Access (Creative Commons / PhysioNet terms) | $0.00 |
| **3D Heart Visualization** | Custom Procedural Canvas | MIT License (authored in project) | $0.00 |

---

## 3. Cost Distinction: Software Licenses vs. Operational Infrastructure
As required by the project evaluation checklist, software license cost must be distinguished from deployment costs:

1. **Software License Cost: $0.00**
   - Every library, compiler, database, framework, and toolchain used is free open-source software.
2. **Hosting Infrastructure (Optional Deployment):**
   - Local execution (laptop / hospital workstation): **$0.00**.
   - Cloud deployment (e.g. AWS t3.medium, Azure B2s, or DigitalOcean droplet): ~$15 - $40 / month depending on host provider.
3. **Hardware Requirements:**
   - Standard consumer x86_64 laptop (Intel Core i5 / AMD Ryzen 5 or higher with 8 GB RAM).
   - No GPU acceleration required (ODE solving uses CPU floating-point Runge-Kutta; XGBoost inference completes in < 5 ms on CPU).
