# LocoSense — Phase 5: Prediction + SHAP Logic
# All model inference and explanation functions.
# Loaded once at startup, called per request.

import numpy as np
import pandas as pd
import joblib
import json
import shap

from config import (
    MODEL_PATH, MODEL_META_PATH, TOP_FEATURES_PATH,
    RISK_BANDS, RISK_COLORS, SENSOR_COLS,
)


# ── Load model artifacts once at startup ──────────────────────────────────────

def load_model_artifacts():
    model = joblib.load(MODEL_PATH)

    with open(MODEL_META_PATH) as f:
        meta = json.load(f)

    top_features = []
    if TOP_FEATURES_PATH.exists():
        with open(TOP_FEATURES_PATH) as f:
            top_features = json.load(f)

    explainer = shap.TreeExplainer(model)

    return {
        'model'       : model,
        'meta'        : meta,
        'explainer'   : explainer,
        'top_features': top_features,
        'feature_cols': meta['feature_cols'],
        'threshold'   : meta['threshold'],
    }


# ── Risk category ──────────────────────────────────────────────────────────────

def get_risk_category(prob: float) -> str:
    for label, (lo, hi) in RISK_BANDS.items():
        if lo <= prob < hi:
            return label
    return 'Critical'


def get_risk_category_from_ru(ru: float) -> str:
    """
    Map Remaining Useful Life (RU) to a risk label using the dataset's own
    ground-truth bins. This is what powers the fleet/simulation views —
    it gives a smooth 4-way spread, unlike the classifier's failure_prob
    which is trained on a binary threshold (RU<=14) and saturates near 0
    or 1 with nothing in between.
        Critical : RU 0-10
        High     : RU 11-30
        Medium   : RU 31-60
        Low      : RU 61+
    """
    if ru <= 10:
        return 'Critical'
    elif ru <= 30:
        return 'High'
    elif ru <= 60:
        return 'Medium'
    else:
        return 'Low'


# ── Predict failure probability ───────────────────────────────────────────────

def predict_proba(model, feature_cols: list, X: pd.DataFrame) -> np.ndarray:
    """Run model inference. Returns array of failure probabilities."""
    X_model = X.reindex(columns=feature_cols, fill_value=0)
    return model.predict_proba(X_model)[:, 1]
def predict_regressor(model, feature_cols: list, X: pd.DataFrame) -> np.ndarray:
    """Run regressor inference. Returns clipped 0-1 degradation scores."""
    X_model = X.reindex(columns=feature_cols, fill_value=0)
    return np.clip(model.predict(X_model), 0, 1)


# ── SHAP explanation for one row ──────────────────────────────────────────────

def get_shap_drivers(explainer, model, feature_cols: list,
                     X_row: pd.DataFrame, top_n: int = 6) -> list:
    """
    Compute SHAP values for a single row.
    Returns top_n drivers as a list of dicts:
      { feature, shap_value, feature_value, direction }
    """
    X_model = X_row.reindex(columns=feature_cols, fill_value=0)
    sv      = explainer(X_model)

    # Handle both Explanation object and raw ndarray
    vals = sv.values[0] if hasattr(sv, 'values') else sv[0]

    # Handle 3D output (some SHAP versions return [n_samples, n_features, n_classes])
    if vals.ndim == 2:
        vals = vals[:, 1]

    shap_df = pd.DataFrame({
        'feature'      : feature_cols,
        'shap_value'   : vals,
        'feature_value': X_model.iloc[0].values,
    })
    shap_df['abs_shap'] = shap_df['shap_value'].abs()
    top = shap_df.sort_values('abs_shap', ascending=False).head(top_n)

    return [
        {
            'feature'      : row['feature'],
            'shap_value'   : round(float(row['shap_value']), 4),
            'feature_value': round(float(row['feature_value']), 4),
            'direction'    : 'increases_risk' if row['shap_value'] > 0 else 'decreases_risk',
        }
        for _, row in top.iterrows()
    ]


# ── Score a batch of rows (for fleet endpoint) ────────────────────────────────

def score_fleet(artifacts: dict, fleet_df: pd.DataFrame) -> pd.DataFrame:
    """
    Score every row in fleet_df.
    Returns fleet_df with added columns:
        failure_prob, risk_category, risk_color
    """
    model        = artifacts['model']
    feature_cols = artifacts['feature_cols']

    proba = predict_regressor(model, feature_cols, fleet_df)

    result = fleet_df.copy()
    result['failure_prob']  = proba
    result['risk_category'] = [get_risk_category(p) for p in proba]
    result['risk_color']    = result['risk_category'].map(RISK_COLORS)
    return result


# ── Build fleet summary response ──────────────────────────────────────────────

def build_fleet_response(scored_latest: pd.DataFrame) -> list:
    """
    Convert scored fleet dataframe (one row per loco) to JSON-serialisable list.

    Risk category is derived from RU (ground-truth bins from the dataset),
    not from the classifier's failure_prob. This is intentional: the model
    was trained on a binary threshold (failure within 14 days), so its
    probability output saturates near 0 or 1 with nothing in between —
    it can't produce a smooth Low/Medium/High/Critical spread on its own.
    RU-based bucketing gives the real, demo-able gradation; failure_prob
    is still shown as a supporting "model confidence" stat.
    """
    records = []
    for _, row in scored_latest.iterrows():
        prob = float(row['failure_prob'])
        ru_val = float(row.get('ru', 0))
        risk = next(k for k, (lo, hi) in RISK_BANDS.items() if lo <= prob < hi)

        loco_type_val = str(row.get('loco_type_name', row.get('loco_type', '')))
        records.append({
            'loco_id'         : str(row['loco_id']),
            'loco_type'       : loco_type_val,
            'traction_type'   : get_traction_type(loco_type_val),
            'zone'            : str(row.get('zone_name', row.get('zone', ''))),
            'cycle'           : int(row['cycle']),
            'ru'              : int(ru_val),
            'failure_prob'    : round(prob, 4),
            'risk_category'   : risk,
            'risk_color'      : RISK_COLORS[risk],
            'days_since_svc'  : int(row.get('days_since_service', 0)),
            'sim_profile'     : str(row.get('sim_profile', '')),
        })

    # Sort by RU ascending (lowest RU = most urgent, shown first)
    records.sort(key=lambda x: x['ru'])
    return records


# ── Build single loco response ────────────────────────────────────────────────

# ── Traction-type sensor maps ─────────────────────────────────────────────────
# Electric locos (WAP5, WAP7, WAG9) reuse the same 12 dataset columns but
# with domain-correct display labels. Diesel locos (WDG4, WDP4B) use the
# original labels. The model sees identical column names either way — this
# is purely a display/interpretation layer.

ELECTRIC_TYPES = {'WAP5', 'WAP7', 'WAG9'}
DIESEL_TYPES   = {'WDG4', 'WDP4B'}

ELECTRIC_SENSOR_MAP = {
    'engine_temp': {'label': 'Traction Motor Temp','unit': '°C'},
    'oil_pressure': {'label': 'OHE Voltage','unit': 'kV'},
    'vibration': {'label': 'Vibration','unit': 'mm/s'},
    'fuel_efficiency' : {'label': 'Power Factor','unit': '%'},
    'coolant_temp': {'label': 'Transformer Coolant Temp','unit': '°C'},
    'bearing_temp': {'label': 'Axle Bearing Temp','unit': '°C'},
    'rpm': {'label': 'Wheel RPM','unit': 'rpm'},
    'exhaust_temp': {'label': 'Inverter Temp','unit': '°C'},
    'turbo_pressure': {'label': 'Pantograph Pressure','unit': 'bar'},
    'load_factor': {'label': 'Load Factor','unit': '%'},
    'battery_voltage': {'label': 'Auxiliary Battery','unit': 'V'},
    'brake_pressure': {'label': 'Brake Pressure','unit': 'bar'},
}

DIESEL_SENSOR_MAP = {
    'engine_temp': {'label': 'Engine Temp','unit': '°C'},
    'oil_pressure': {'label': 'Oil Pressure','unit': 'bar'},
    'vibration': {'label': 'Vibration','unit': 'mm/s'},
    'fuel_efficiency' : {'label': 'Fuel Efficiency','unit': '%'},
    'coolant_temp': {'label': 'Coolant Temp','unit': '°C'},
    'bearing_temp': {'label': 'Bearing Temp','unit': '°C'},
    'rpm': {'label': 'Engine RPM','unit': 'rpm'},
    'exhaust_temp': {'label': 'Exhaust Temp','unit': '°C'},
    'turbo_pressure': {'label': 'Turbo Pressure','unit': 'bar'},
    'load_factor': {'label': 'Load Factor','unit': '%'},
    'battery_voltage': {'label': 'Battery Voltage','unit': 'V'},
    'brake_pressure': {'label': 'Brake Pressure','unit': 'bar'},
}

def get_sensor_map(loco_type: str) -> dict:
    """Return the correct sensor display map for a given loco type."""
    if loco_type in ELECTRIC_TYPES:
        return ELECTRIC_SENSOR_MAP
    return DIESEL_SENSOR_MAP

def get_traction_type(loco_type: str) -> str:
    """Return 'electric' or 'diesel' for a given loco type."""
    return 'electric' if loco_type in ELECTRIC_TYPES else 'diesel'


def build_loco_response(artifacts: dict, loco_rows: pd.DataFrame,
                        loco_id: str, raw_loco_rows: pd.DataFrame = None) -> dict:
    model        = artifacts['model']
    explainer    = artifacts['explainer']
    feature_cols = artifacts['feature_cols']

    latest = loco_rows.sort_values('cycle').iloc[[-1]]
    proba = predict_regressor(model, feature_cols, latest)
    ru_val = float(latest['ru'].values[0]) if 'ru' in latest.columns else 0
    prob = float(proba[0]) if hasattr(proba, '__len__') else float(proba)
    risk = next(k for k, (lo, hi) in RISK_BANDS.items() if lo <= prob < hi)

    days_since_svc = (
        int(latest['days_since_service'].values[0])
        if 'days_since_service' in latest.columns else 0
    )

    drivers = get_shap_drivers(explainer, model, feature_cols, latest, top_n=6)

    # Clean driver feature names for display
    def clean(name):
        return (name
            .replace('_roll5_mean',  ' (5-cycle avg)')
            .replace('_roll10_mean', ' (10-cycle avg)')
            .replace('_roll5_std',   ' (5-cycle std)')
            .replace('_roll10_std',  ' (10-cycle std)')
            .replace('_lag1', ' (prev cycle)')
            .replace('_', ' ').title()
        )

    for d in drivers:
        d['feature_display'] = clean(d['feature'])

    # Determine traction type from loco_type column
    loco_type_val = str(latest.get('loco_type_name', pd.Series([''])).values[0])
    traction      = get_traction_type(loco_type_val)
    sensor_map    = get_sensor_map(loco_type_val)

    # Current sensor readings — use RAW (unscaled) data for display.
    # Returns list of dicts with label, unit, value, icon — type-aware.
    if raw_loco_rows is not None and not raw_loco_rows.empty:
        raw_latest = raw_loco_rows.sort_values('cycle').iloc[[-1]]
    else:
        raw_latest = latest  # fallback — will be scaled values

    sensor_readings = {
        s: {
            'value': round(float(raw_latest[s].values[0]), 3),
            'label': sensor_map[s]['label'],
            'unit' : sensor_map[s]['unit'],
        }
        for s in SENSOR_COLS
        if s in raw_latest.columns and s in sensor_map
    }

    # Also update SHAP driver display names to use type-aware labels
    for d in drivers:
        raw_feat = d['feature']
        # Strip rolling/lag suffixes to get the base sensor name
        base = raw_feat
        for suffix in ['_roll5_mean','_roll10_mean','_roll5_std','_roll10_std','_lag1']:
            if raw_feat.endswith(suffix):
                base = raw_feat[:-len(suffix)]
                break
        if base in sensor_map:
            sensor_label = sensor_map[base]['label']
            suffix_label = ''
            if '_roll5_mean'  in raw_feat: suffix_label = ' (5-cycle avg)'
            elif '_roll10_mean' in raw_feat: suffix_label = ' (10-cycle avg)'
            elif '_roll5_std'  in raw_feat: suffix_label = ' (5-cycle std)'
            elif '_roll10_std' in raw_feat: suffix_label = ' (10-cycle std)'
            elif '_lag1'       in raw_feat: suffix_label = ' (prev cycle)'
            d['feature_display'] = sensor_label + suffix_label
        # else keep the clean() fallback already set above

    return {
        'loco_id'         : loco_id,
        'loco_type'       : loco_type_val,
        'traction_type'   : traction,
        'zone'            : str(latest.get('zone_name', pd.Series(['-'])).values[0]),
        'cycle'           : int(latest['cycle'].values[0]),
        'ru'              : int(ru_val),
        'days_since_svc'  : days_since_svc,
        'failure_prob'    : round(float(proba[0]), 4),
        'risk_category'   : risk,
        'risk_color'      : RISK_COLORS[risk],
        'top_drivers'     : drivers,
        'sensor_readings' : sensor_readings,
    }


# ── Build loco history response ───────────────────────────────────────────────

def build_history_response(artifacts: dict, loco_rows: pd.DataFrame) -> list:
    """
    Score all cycles for a loco and return history list.
    Used for the risk-over-time chart in the React dashboard.
    """
    model        = artifacts['model']
    feature_cols = artifacts['feature_cols']

    loco_sorted = loco_rows.sort_values('cycle').reset_index(drop=True)
    proba = predict_regressor(model, feature_cols, loco_sorted)
    return [
        {
            'cycle'       : int(row['cycle']),
            'failure_prob': round(float(proba[i]), 4),
            'risk_category': get_risk_category_from_ru(float(row.get('ru', 0))),
            'ru'          : int(row.get('ru', 0)),
        }
        for i, (_, row) in enumerate(loco_sorted.iterrows())
    ]
