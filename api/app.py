# LocoSense — Phase 5 + 5b: Flask API with Live Fleet Simulation
#
# Run from the api/ folder:
#   cd locosense/api
#   python app.py
#
# Endpoints:
#   GET  /health                       → API health check
#   GET  /api/fleet                    → all locos, LIVE simulated risk scores
#   GET  /api/loco/<loco_id>           → single loco detail + SHAP drivers
#   GET  /api/loco/<loco_id>/history   → real recorded risk trend over all cycles
#   GET  /api/summary                  → fleet-level stats (from live simulation)
#   GET  /api/simulation/status        → simulator tick count, profile mix
#   POST /api/predict                  → predict from raw sensor JSON input
#
# Fleet simulation:
#   Each loco is assigned a behavior profile at startup (stable / degrading /
#   high_risk / critical) and the simulator advances every 10s, giving a
#   live, realistic mix of Low/Medium/High/Critical locos at any moment —
#   instead of every loco always showing Critical (which is what the raw
#   "latest recorded cycle" would show, since the dataset's last row per
#   loco is always its failure point).

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from flask import Flask, jsonify, request
from flask_cors import CORS
import traceback
from predict import predict_regressor

from config import HOST, PORT, DEBUG
from data_prep import load_raw_dataset, prepare_simulated_snapshot
from simulation import FleetSimulator
from predict import (
    load_model_artifacts,
    predict_proba,
    get_risk_category,
    get_risk_category_from_ru,
    get_shap_drivers,
    build_fleet_response,
    build_loco_response,
    build_history_response,
    RISK_COLORS,
)

# ── App init ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# ── Load everything once at startup ───────────────────────────────────────────
print('[startup] Loading model artifacts...')
ARTIFACTS = load_model_artifacts()
FEATURE_COLS = ARTIFACTS['feature_cols']
print(f'[startup] Model loaded — {len(FEATURE_COLS)} features')

print('[startup] Loading raw dataset...')
RAW_DF = load_raw_dataset()
RAW_DF['loco_type_name'] = RAW_DF['loco_type']
RAW_DF['zone_name']      = RAW_DF['zone']
print(f'[startup] Dataset ready — {len(RAW_DF):,} rows, {RAW_DF["loco_id"].nunique()} locos')

# ── Build full feature dataframe once — used for /api/loco/<id> and history ──
from data_prep import engineer_features, scale_features
import joblib
from config import SCALER_PATH

SCALER = joblib.load(SCALER_PATH)
print('[startup] Building full feature dataframe (for loco detail + history)...')
_feat = engineer_features(RAW_DF)
FLEET_DF = scale_features(_feat, SCALER)
for col in FEATURE_COLS:
    if col not in FLEET_DF.columns:
        FLEET_DF[col] = 0
print(f'[startup] Feature dataframe ready — {FLEET_DF.shape}')

# ── Start the live fleet simulator ────────────────────────────────────────────
print('[startup] Starting fleet simulator...')
SIMULATOR = FleetSimulator(RAW_DF)
SIMULATOR.start()
print('[startup] API ready\n')


# ── Helper ────────────────────────────────────────────────────────────────────
def error(msg: str, code: int = 400):
    return jsonify({'error': msg}), code


def get_live_fleet_scored() -> "pd.DataFrame":
    """
    Returns the current simulated fleet snapshot, scored by the model.
    Called fresh on every /api/fleet and /api/summary request so the
    dashboard always reflects the simulator's latest tick.
    """
    snapshot = SIMULATOR.get_current_rows()                       # raw rows, 1 per loco
    prepared = prepare_simulated_snapshot(snapshot, SCALER, FEATURE_COLS)  # engineered + scaled

    proba = predict_regressor(ARTIFACTS['model'], FEATURE_COLS, prepared)
    prepared = prepared.copy()
    prepared['failure_prob'] = proba

    # Carry over original loco_id/zone/type names (lost during reindex)
    meta_cols = ['loco_id', 'loco_type_name', 'zone_name', 'cycle', 'ru',
                'days_since_service', 'sim_profile']
    for col in meta_cols:
        if col in snapshot.columns and col not in prepared.columns:
            prepared[col] = snapshot[col].values
        elif col in snapshot.columns:
            prepared[col] = snapshot[col].values
        if 'ru' in snapshot.columns:
            prepared['ru'] = snapshot['ru'].values
    return prepared
    


# ─────────────────────────────────────────────────────────────────────────────
# GET /health
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/health')
def health():
    return jsonify({
        'status'   : 'ok',
        'locos'    : int(RAW_DF['loco_id'].nunique()),
        'features' : len(FEATURE_COLS),
        'model'    : 'XGBoost',
        'simulation': SIMULATOR.get_status(),
    })


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/fleet  — LIVE simulated state
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/fleet')
def fleet():
    """
    Returns all locomotives at their CURRENT simulated cycle.
    The simulator advances every 10s, so calling this repeatedly shows
    a fleet that changes over time — most locos stable, a few actively
    degrading toward failure, occasionally one gets "serviced" and resets.

    Optional query params:
        ?risk=High        → filter by risk category
        ?zone=NR          → filter by zone
        ?type=WAP7        → filter by loco type
    """
    try:
        scored = get_live_fleet_scored()

        risk_filter = request.args.get('risk')
        zone_filter = request.args.get('zone')
        type_filter = request.args.get('type')

        if risk_filter:
            scored = scored[
                scored['ru'].apply(get_risk_category_from_ru) == risk_filter
            ]
        if zone_filter:
            scored = scored[scored['zone_name'] == zone_filter]
        if type_filter:
            scored = scored[scored['loco_type_name'] == type_filter]

        fleet_list = build_fleet_response(scored)

        return jsonify({
            'total': len(fleet_list),
            'locos': fleet_list,
            'simulation_tick': SIMULATOR.get_status()['tick_count'],
        })

    except Exception:
        return error(traceback.format_exc(), 500)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/loco/<loco_id>  — detail uses REAL recorded history (not simulated)
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/loco/<loco_id>')
def loco_detail(loco_id: str):
    """
    Returns full detail for one locomotive, using its actual recorded
    latest cycle (real data) — not the simulated position. This gives a
    consistent, explorable detail view regardless of simulation state.
    """
    try:
        loco_rows = FLEET_DF[FLEET_DF['loco_id'] == loco_id]
        if loco_rows.empty:
            return error(f'Loco {loco_id} not found', 404)

        raw_loco_rows = RAW_DF[RAW_DF['loco_id'] == loco_id]

        result = build_loco_response(ARTIFACTS, loco_rows, loco_id, raw_loco_rows)
        return jsonify(result)

    except Exception:
        return error(traceback.format_exc(), 500)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/loco/<loco_id>/history
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/loco/<loco_id>/history')
def loco_history(loco_id: str):
    """Returns failure probability + RU-based risk at every recorded cycle."""
    try:
        loco_rows = FLEET_DF[FLEET_DF['loco_id'] == loco_id]
        if loco_rows.empty:
            return error(f'Loco {loco_id} not found', 404)

        history = build_history_response(ARTIFACTS, loco_rows)
        return jsonify({
            'loco_id': loco_id,
            'cycles' : len(history),
            'history': history,
        })

    except Exception:
        return error(traceback.format_exc(), 500)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/summary  — LIVE simulated state
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/summary')
def summary():
    """Fleet-level summary stats, computed from the current simulated state."""
    try:
        scored = get_live_fleet_scored()
        risk_series = scored['ru'].apply(get_risk_category_from_ru)

        risk_dist = (
            risk_series.value_counts()
            .reindex(['Low', 'Medium', 'High', 'Critical'], fill_value=0)
            .to_dict()
        )
        zone_dist = scored['zone_name'].value_counts().to_dict()
        type_dist = scored['loco_type_name'].value_counts().to_dict()

        alerts = scored.loc[
            risk_series.isin(['High', 'Critical']), 'loco_id'
        ].tolist()

        return jsonify({
            'total_locos'      : int(scored['loco_id'].nunique()),
            'risk_distribution': risk_dist,
            'zone_breakdown'   : zone_dist,
            'type_breakdown'   : type_dist,
            'alert_locos'      : alerts,
            'alert_count'      : len(alerts),
            'simulation_tick'  : SIMULATOR.get_status()['tick_count'],
        })

    except Exception:
        return error(traceback.format_exc(), 500)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/simulation/status
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/simulation/status')
def simulation_status():
    """Returns simulator internals — tick count, profile distribution."""
    return jsonify(SIMULATOR.get_status())


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/predict — live sensor input (unrelated to fleet simulation)
# ─────────────────────────────────────────────────────────────────────────────
@app.route('/api/predict', methods=['POST'])
def predict():
    """
    Accepts raw sensor readings as JSON and returns a risk prediction.
    See api/README.md for the full example request body.
    """
    try:
        body = request.get_json(force=True)
        if not body:
            return error('Request body must be JSON')

        required = [
            'loco_id', 'loco_type', 'zone', 'manufacture_year',
            'cycle', 'days_since_service',
            'engine_temp', 'oil_pressure', 'vibration', 'fuel_efficiency',
            'coolant_temp', 'bearing_temp', 'rpm', 'exhaust_temp',
            'turbo_pressure', 'load_factor', 'battery_voltage', 'brake_pressure',
        ]
        missing = [k for k in required if k not in body]
        if missing:
            return error(f'Missing fields: {missing}')

        import pandas as pd
        from config import SCALE_COLS, SENSOR_COLS, ROLLING_WINDOWS

        row = {k: body[k] for k in required}
        row['ru']            = body.get('ru', 0)
        row['loco_age']      = 2024 - int(body['manufacture_year'])
        row['failure_label'] = 0

        df_row = pd.DataFrame([row])

        for window in ROLLING_WINDOWS:
            for s in SENSOR_COLS:
                df_row[f'{s}_roll{window}_mean'] = df_row[s]
                df_row[f'{s}_roll{window}_std']  = 0.0
        for s in SENSOR_COLS:
            df_row[f'{s}_lag1'] = df_row[s]

        loco_type = str(body['loco_type'])
        zone      = str(body['zone'])
        for lt in ['WAG9', 'WAP5', 'WAP7', 'WDG4', 'WDP4B']:
            df_row[f'loco_type_{lt}'] = 1 if loco_type == lt else 0
        for z in ['CR', 'ER', 'NR', 'SR', 'WR']:
            df_row[f'zone_{z}'] = 1 if zone == z else 0

        cols_to_scale = [c for c in SCALE_COLS if c in df_row.columns]
        df_row[cols_to_scale] = SCALER.transform(df_row[cols_to_scale])

        model     = ARTIFACTS['model']
        explainer = ARTIFACTS['explainer']

        prob    = float(predict_proba(model, FEATURE_COLS, df_row)[0])
        ru_val  = float(body.get('ru', 0))
        risk    = get_risk_category_from_ru(ru_val)
        drivers = get_shap_drivers(explainer, model, FEATURE_COLS, df_row, top_n=6)

        return jsonify({
            'loco_id'      : body['loco_id'],
            'failure_prob' : round(prob, 4),
            'risk_category': risk,
            'risk_color'   : RISK_COLORS[risk],
            'top_drivers'  : drivers,
        })

    except Exception:
        return error(traceback.format_exc(), 500)


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print(f'Starting LocoSense API on http://localhost:{PORT}')
    print(f'Endpoints:')
    print(f'  GET  http://localhost:{PORT}/health')
    print(f'  GET  http://localhost:{PORT}/api/fleet           (live, ticks every 10s)')
    print(f'  GET  http://localhost:{PORT}/api/fleet?risk=High')
    print(f'  GET  http://localhost:{PORT}/api/loco/<loco_id>')
    print(f'  GET  http://localhost:{PORT}/api/loco/<loco_id>/history')
    print(f'  GET  http://localhost:{PORT}/api/summary          (live, ticks every 10s)')
    print(f'  GET  http://localhost:{PORT}/api/simulation/status')
    print(f'  POST http://localhost:{PORT}/api/predict')
    app.run(host=HOST, port=PORT, debug=False, use_reloader=False, threaded=True)
