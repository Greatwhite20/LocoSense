# LocoSense — Phase 5b: Fleet Simulation Engine
#
# Problem: the dataset records each loco's full lifecycle ending at failure
# (RU=0 at the last row). If the API always shows "latest recorded cycle",
# every loco looks Critical.
#
# Fix: simulate a moving "current cycle" per loco that ticks forward over
# real time, so the fleet shows a realistic mix of Low/Medium/High/Critical
# at any moment — like a real live fleet would.
#
# Behavior profiles (assigned once at startup, persists for the session):
#   stable    (40%) — sits in the healthy zone, rarely advances
#   degrading (32%) — steadily moves toward failure over time
#   high_risk (20%) — already in the high-risk zone, slow movement
#   critical  (12%) — near end of life, oscillates, occasionally "serviced"
#     (a service event resets it back to a healthy cycle — simulates a
#      real maintenance intervention)

import random
import threading
import time
import pandas as pd

# ── Tunable simulation parameters ─────────────────────────────────────────────
TICK_SECONDS = 30  # how often the simulated fleet state advances

# % of total lifecycle each profile occupies (lo, hi) — calibrated against
# the dataset's real risk_category boundaries (see Phase 5b validation)
PROFILE_RANGES = {
    'stable'   : (0.05, 0.45),   # → mostly Low risk
    'degrading': (0.45, 0.68),   # → mostly Medium risk
    'high_risk': (0.70, 0.88),   # → mostly High risk
    'critical' : (0.88, 0.99),   # → mostly Critical risk
}

# Target fleet composition (out of 50 locos) — gives a realistic ops mix
PROFILE_WEIGHTS = {
    'stable'   : 0.40,
    'degrading': 0.32,
    'high_risk': 0.20,
    'critical' : 0.12,
}

# How fast each profile moves through cycles per tick
PROFILE_STEP = {
    'stable'   : [0, 0, 0, 1],        # rarely moves
    'degrading': [1, 1, 2],           # steadily advances
    'high_risk': [0, 1, 1, 2],        # advances, slightly faster
    'critical' : [0, 1, 1],           # mostly holds near the edge
}

SERVICE_RESET_CHANCE = 0.04   # per tick, chance a critical loco gets "serviced"


class FleetSimulator:
    """
    Holds live simulated state for every locomotive:
        { loco_id: {'profile': str, 'cycle': int, 'total_cycles': int, 'tick': int} }

    Call .get_current_rows(raw_df) to get a dataframe snapshot — one row
    per loco, taken from the closest real recorded cycle to its simulated
    position. This keeps all sensor values realistic (sourced from actual
    data) while the *position in time* is what's simulated.
    """

    def __init__(self, raw_df: pd.DataFrame, seed: int = 42):
        self._lock = threading.Lock()
        self._raw_df = raw_df
        self._state = {}
        self._running = False
        self._thread = None
        self._tick_count = 0

        random.seed(seed)
        self._init_state()

    # ── Setup ──────────────────────────────────────────────────────────────────
    def _init_state(self):
        loco_ids = self._raw_df['loco_id'].unique().tolist()
        n = len(loco_ids)

        # Build profile list matching target weights
        profiles = []
        for profile, weight in PROFILE_WEIGHTS.items():
            profiles += [profile] * round(n * weight)
        while len(profiles) < n:
            profiles.append('stable')
        profiles = profiles[:n]
        random.shuffle(profiles)

        for loco_id, profile in zip(loco_ids, profiles):
            loco_rows = self._raw_df[self._raw_df['loco_id'] == loco_id]
            total_cycles = int(loco_rows['cycle'].max())
            lo, hi = PROFILE_RANGES[profile]
            start_pct = random.uniform(lo, hi)
            start_cycle = max(1, min(total_cycles, int(total_cycles * start_pct)))

            self._state[loco_id] = {
                'profile'     : profile,
                'cycle'       : start_cycle,
                'total_cycles': total_cycles,
            }

    # ── Tick logic ────────────────────────────────────────────────────────────
    def _tick_once(self):
        with self._lock:
            for loco_id, s in self._state.items():
                profile = s['profile']
                total   = s['total_cycles']

                # Critical locos occasionally get "serviced" — reset to healthy zone
                if profile == 'critical' and random.random() < SERVICE_RESET_CHANCE:
                    s['cycle'] = max(1, int(total * random.uniform(0.10, 0.25)))
                    continue

                step = random.choice(PROFILE_STEP[profile])
                new_cycle = s['cycle'] + step

                # Loop back into this profile's natural range once it
                # overruns total_cycles (simulates starting a new lifecycle)
                if new_cycle >= total:
                    lo, hi = PROFILE_RANGES[profile]
                    new_cycle = max(1, int(total * random.uniform(lo, hi)))

                s['cycle'] = new_cycle

            self._tick_count += 1

    def _run_loop(self):
        while self._running:
            time.sleep(TICK_SECONDS)
            self._tick_once()

    # ── Lifecycle control ─────────────────────────────────────────────────────
    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        print(f'[simulator] Started — ticking every {TICK_SECONDS}s')

    def stop(self):
        self._running = False

    # ── Snapshot access ────────────────────────────────────────────────────────
    def get_current_rows(self) -> pd.DataFrame:
        """
        Returns one row per loco — the real recorded row closest to each
        loco's current simulated cycle. Sensor values are always real data,
        only the "current position in time" is simulated.
        """
        with self._lock:
            snapshot = {k: dict(v) for k, v in self._state.items()}

        rows = []
        for loco_id, s in snapshot.items():
            loco_rows = self._raw_df[self._raw_df['loco_id'] == loco_id]
            closest_idx = (loco_rows['cycle'] - s['cycle']).abs().idxmin()
            row = loco_rows.loc[closest_idx].copy()
            row['sim_profile'] = s['profile']
            rows.append(row)

        return pd.DataFrame(rows).reset_index(drop=True)

    def get_status(self) -> dict:
        with self._lock:
            profile_counts = {}
            for s in self._state.values():
                profile_counts[s['profile']] = profile_counts.get(s['profile'], 0) + 1
            return {
                'running'   : self._running,
                'tick_count': self._tick_count,
                'tick_seconds': TICK_SECONDS,
                'profile_distribution': profile_counts,
            }
