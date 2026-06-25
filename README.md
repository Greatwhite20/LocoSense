# LocoSense
### AI/ML Predictive Maintenance System for RITES Locomotives

> Predicts locomotive failures 7–14 days in advance using multi-sensor telemetry, XGBoost, and SHAP explainability.

---

## Tech Stack
`Python` `XGBoost` `SHAP` `Flask` `React` `Recharts` `scikit-learn`

## Key Results
- **ROC-AUC: 1.0000** on held-out test set
- **85 features** — rolling stats, lag features, one-hot encoding
- **50 locomotives** across 5 Indian Railway zones (NR, ER, CR, SR, WR)
- **Top failure driver: vibration** (49.3% SHAP importance)
- **Live fleet simulation** — ticks every 10s, realistic Low/Medium/High/Critical spread

## Project Structure
locosense/

├── notebooks/          # Phases 1–4 (EDA → preprocessing → training → SHAP)

├── api/                # Flask REST API + fleet simulation engine

├── dashboard/          # React dashboard (Vite)

├── data/processed/     # Train/val/test splits

├── models/             # XGBoost model + scaler + SHAP metadata

└── reports/figures/    # EDA and evaluation plots
## How to Run

### API
```bash
cd api
source ../venv/bin/activate
python app.py
```

### Dashboard
```bash
cd dashboard
npm install
npm run dev
```
Open `http://localhost:3000`

## Fleet Types
| Traction | Models |
|---|---|
| ⚡ Electric | WAP5, WAP7, WAG9 |
| 🛢 Diesel | WDG4, WDP4B |

## Author
Anshul Rathore · B.Tech Electrical Engineering · MNNIT Allahabad
