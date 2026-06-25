# LocoSense — Phase 5: Flask API Config
# All paths and constants used across the API

from pathlib import Path

# ── Root paths ────────────────────────────────────────────────────────────────
ROOT          = Path(__file__).resolve().parent.parent
MODELS_DIR    = ROOT / 'models'
PROCESSED_DIR = ROOT / 'data' / 'processed'
RAW_DIR       = ROOT / 'data' / 'raw'

# ── Model files ───────────────────────────────────────────────────────────────
MODEL_PATH        = MODELS_DIR / 'xgb_model.pkl'
SCALER_PATH       = MODELS_DIR / 'scaler.pkl'
MODEL_META_PATH   = MODELS_DIR / 'model_meta.json'
TOP_FEATURES_PATH = MODELS_DIR / 'shap_top_features.json'

# ── Dataset (used for fleet endpoint) ─────────────────────────────────────────
DATASET_PATH = RAW_DIR / 'locosense dataset.csv'   # note: space in filename

# ── Sensor columns (raw — before feature engineering) ─────────────────────────
SENSOR_COLS = [
    'engine_temp', 'oil_pressure', 'vibration', 'fuel_efficiency',
    'coolant_temp', 'bearing_temp', 'rpm', 'exhaust_temp',
    'turbo_pressure', 'load_factor', 'battery_voltage', 'brake_pressure',
]

# ── Columns to scale ──────────────────────────────────────────────────────────
# IMPORTANT: order must match Phase 2 exactly —
# Phase 2 loops: for window in [5,10]: for sensor in SENSOR_COLS
# i.e. all sensors for window=5 first, then all sensors for window=10
#
# NOTE: 'ru' is intentionally NOT in this list. After the ru-leakage fix,
# ru is excluded from the model's features entirely (see Phase 2/3) — it's
# kept in the dataset only for display and RU-based risk bucketing, in its
# original units (cycles remaining), unscaled.
ROLLING_COLS = [
    f'{s}_roll{w}_{stat}'
    for w in [5, 10]
    for s in SENSOR_COLS
    for stat in ['mean', 'std']
]
LAG_COLS   = [f'{s}_lag1' for s in SENSOR_COLS]
SCALE_COLS = SENSOR_COLS + ROLLING_COLS + LAG_COLS + [
    'loco_age', 'days_since_service'
]

# ── Risk thresholds ───────────────────────────────────────────────────────────
RISK_BANDS = {
    'Low'     : (0.00, 0.30),
    'Medium'  : (0.30, 0.50),
    'High'    : (0.50, 0.75),
    'Critical': (0.75, 1.01),
}

RISK_COLORS = {
    'Low'     : '#1D9E75',
    'Medium'  : '#EF9F27',
    'High'    : '#D85A30',
    'Critical': '#E24B4A',
}

# ── API settings ──────────────────────────────────────────────────────────────
PORT  = 5001    # 5000 is taken by AirPlay Receiver on Mac
DEBUG = True
HOST  = '0.0.0.0'

# ── Live fleet simulation ─────────────────────────────────────────────────────
# How often (seconds) the simulator advances each loco's position in its
# recorded lifecycle. Lower = faster-changing demo, higher = more realistic.
SIM_INTERVAL_SECONDS = 10

# ── Feature engineering settings ─────────────────────────────────────────────
ROLLING_WINDOWS = [5, 10]
CURRENT_YEAR    = 2024
