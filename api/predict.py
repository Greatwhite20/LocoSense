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
    """Load model, metadata, and SHAP explainer. Call once at startup."""
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
    """Map a failure probability to a risk label (model-based, binary boundary)."""
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

    proba = predict_proba(model, feature_cols, fleet_df)

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
        prob   = float(row['failure_prob'])
        ru_val = float(row.get('ru', 0))
        risk   = get_risk_category_from_ru(ru_val)

        records.append({
            'loco_id'         : str(row['loco_id']),
            'loco_type'       : str(row.get('loco_type_name', row.get('loco_type', ''))),
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

def build_loco_response(artifacts: dict, loco_rows: pd.DataFrame,
                        loco_id: str, raw_loco_rows: pd.DataFrame = None) -> dict:
    """
    Score and explain a single loco's latest cycle.
    Returns full detail dict for /api/loco/<id>

    loco_rows     : scaled feature rows (used for model input + SHAP)
    raw_loco_rows : unscaled raw sensor rows (used for display only) —
                    if not provided, falls back to loco_rows (will show
                    scaled 0-1 values, which is wrong for display but
                    keeps the function usable standalone).
    """
    model        = artifacts['model']
    explainer    = artifacts['explainer']
    feature_cols = artifacts['feature_cols']

    latest = loco_rows.sort_values('cycle').iloc[[-1]]
    prob   = float(predict_proba(model, feature_cols, latest)[0])
    ru_val = float(latest['ru'].values[0]) if 'ru' in latest.columns else 0
    risk   = get_risk_category_from_ru(ru_val)

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

    # Current sensor readings — use RAW (unscaled) data for display.
    # loco_rows has been through MinMaxScaler, so sensor values there are
    # 0-1 normalised — not what an engineer wants to see on a dashboard.
    if raw_loco_rows is not None and not raw_loco_rows.empty:
        raw_latest = raw_loco_rows.sort_values('cycle').iloc[[-1]]
    else:
        raw_latest = latest  # fallback — will be scaled values

    sensor_readings = {
        s: round(float(raw_latest[s].values[0]), 3)
        for s in SENSOR_COLS
        if s in raw_latest.columns
    }

    return {
        'loco_id'         : loco_id,
        'loco_type'       : str(latest.get('loco_type_name', pd.Series([loco_id])).values[0]),
        'zone'            : str(latest.get('zone_name', pd.Series(['-'])).values[0]),
        'cycle'           : int(latest['cycle'].values[0]),
        'ru'              : int(ru_val),
        'failure_prob'    : round(prob, 4),
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
    proba       = predict_proba(model, feature_cols, loco_sorted)

    return [
        {
            'cycle'       : int(row['cycle']),
            'failure_prob': round(float(proba[i]), 4),
            'risk_category': get_risk_category_from_ru(float(row.get('ru', 0))),
            'ru'          : int(row.get('ru', 0)),
        }
        for i, (_, row) in enumerate(loco_sorted.iterrows())
    ]
