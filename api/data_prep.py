# LocoSense — Phase 5: Data Preparation
# Loads the raw dataset, applies the same feature engineering as Phase 2,
# and returns a scaled feature matrix ready for the model.
# Called once at API startup — result is cached in memory.

import pandas as pd
import numpy as np
import joblib
import json
from pathlib import Path

from config import (
    DATASET_PATH, SCALER_PATH, MODEL_META_PATH,
    SENSOR_COLS, SCALE_COLS, ROLLING_COLS, LAG_COLS,
    ROLLING_WINDOWS, CURRENT_YEAR,
)


def load_raw_dataset() -> pd.DataFrame:
    """Load and rename the raw CSV dataset."""
    df = pd.read_csv(DATASET_PATH)

    # Rename to snake_case (matches Phase 2 column map)
    rename_map = {
        'loco id'              : 'loco_id',
        'loco type'            : 'loco_type',
        'zone'                 : 'zone',
        'manufacture year'     : 'manufacture_year',
        'cycle'                : 'cycle',
        'totalcycles'          : 'total_cycles',
        'days since service'   : 'days_since_service',
        'engine temp   (C)'    : 'engine_temp',
        'oil pressure (bar)'   : 'oil_pressure',
        'vibration    (mms)'   : 'vibration',
        'fuel efficiency (%)'  : 'fuel_efficiency',
        'coolant temp (C)'     : 'coolant_temp',
        'bearing temp  (C)'    : 'bearing_temp',
        'RPM'                  : 'rpm',
        'exhaust temp (C)'     : 'exhaust_temp',
        'turbo pressure (bar)' : 'turbo_pressure',
        'load factor (%)'      : 'load_factor',
        'battery voltage (V)'  : 'battery_voltage',
        'brake pressure (bar)' : 'brake_pressure',
        'RU'                   : 'ru',
        'failure label'        : 'failure_label',
        'risk category'        : 'risk_category',
    }
    # Only rename columns that exist (handles both original and already-renamed)
    existing_map = {k: v for k, v in rename_map.items() if k in df.columns}
    df = df.rename(columns=existing_map)

    # Fix types
    df['failure_label']    = df['failure_label'].astype(int)
    df['manufacture_year'] = df['manufacture_year'].astype(int)
    df['cycle']            = df['cycle'].astype(int)

    # Sort for rolling windows to work correctly
    df = df.sort_values(['loco_id', 'cycle']).reset_index(drop=True)
    return df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """Apply the same feature engineering as Phase 2."""
    df = df.copy()

    # Rolling mean + std per loco
    for window in ROLLING_WINDOWS:
        for sensor in SENSOR_COLS:
            grp = df.groupby('loco_id')[sensor]
            df[f'{sensor}_roll{window}_mean'] = grp.transform(
                lambda x: x.rolling(window, min_periods=1).mean()
            )
            df[f'{sensor}_roll{window}_std'] = grp.transform(
                lambda x: x.rolling(window, min_periods=1).std().fillna(0)
            )

    # Lag features (1 cycle back per loco)
    for sensor in SENSOR_COLS:
        lag = df.groupby('loco_id')[sensor].transform(lambda x: x.shift(1))
        df[f'{sensor}_lag1'] = lag.fillna(df[sensor])

    # Loco age
    df['loco_age'] = CURRENT_YEAR - df['manufacture_year']

    # One-hot encode loco_type and zone
    df = pd.get_dummies(df, columns=['loco_type', 'zone'],
                        drop_first=False, dtype=int)

    return df


def scale_features(df: pd.DataFrame, scaler) -> pd.DataFrame:
    """Apply the pre-fitted MinMaxScaler to scale feature columns."""
    df = df.copy()
    # Only scale columns that exist in the dataframe
    cols_to_scale = [c for c in SCALE_COLS if c in df.columns]
    df[cols_to_scale] = scaler.transform(df[cols_to_scale])
    return df


def build_fleet_dataframe(model_feature_cols: list) -> pd.DataFrame:
    """
    Full pipeline: load → engineer → scale.
    Returns a dataframe with all rows, all features, plus metadata columns
    (loco_id, cycle, risk_category etc.) for the fleet endpoint.
    """
    scaler = joblib.load(SCALER_PATH)

    df_raw = load_raw_dataset()

    # Store original metadata before encoding
    df_raw['loco_type_name'] = df_raw['loco_type']
    df_raw['zone_name']      = df_raw['zone']

    df_feat = engineer_features(df_raw)
    df_scaled = scale_features(df_feat, scaler)

    # Ensure all model feature columns exist (add missing OHE cols as 0)
    for col in model_feature_cols:
        if col not in df_scaled.columns:
            df_scaled[col] = 0

    return df_scaled


def get_latest_per_loco(fleet_df: pd.DataFrame) -> pd.DataFrame:
    """Return the most recent cycle row for each locomotive."""
    return (
        fleet_df
        .sort_values('cycle')
        .groupby('loco_id', as_index=False)
        .last()
        .reset_index(drop=True)
    )


def prepare_simulated_snapshot(raw_snapshot: pd.DataFrame, scaler,
                               model_feature_cols: list) -> pd.DataFrame:
    """
    Takes a raw snapshot from FleetSimulator.get_current_rows() — which
    contains real recorded rows for each loco's current simulated cycle —
    and runs it through the same feature engineering + scaling pipeline
    as Phase 2, so it can be scored by the model.

    Note: rolling/lag features are computed using each loco's FULL history
    up to the snapshot's cycle, not just the single snapshot row, so the
    engineered features stay realistic.
    """
    loco_ids = raw_snapshot['loco_id'].unique().tolist()

    # Load full history once (cached at module level by caller ideally,
    # but safe to reload here — dataset is small)
    full_df = load_raw_dataset()
    full_df['loco_type_name'] = full_df['loco_type']
    full_df['zone_name']      = full_df['zone']
    full_feat = engineer_features(full_df)

    # For each loco, pick the engineered row matching the snapshot's cycle
    rows = []
    for _, snap_row in raw_snapshot.iterrows():
        loco_id = snap_row['loco_id']
        cycle   = snap_row['cycle']
        match = full_feat[
            (full_feat['loco_id'] == loco_id) & (full_feat['cycle'] == cycle)
        ]
        if not match.empty:
            row = match.iloc[0].copy()
            row['sim_profile'] = snap_row.get('sim_profile', 'unknown')
            rows.append(row)

    result = pd.DataFrame(rows).reset_index(drop=True)

    # Scale
    result_scaled = scale_features(result, scaler)

    # Ensure all model columns exist
    for col in model_feature_cols:
        if col not in result_scaled.columns:
            result_scaled[col] = 0

    return result_scaled
