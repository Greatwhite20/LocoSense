# LocoSense — Phase 5: Flask API

## Start the API

```bash
cd locosense/api
source ../venv/bin/activate
python app.py
```

You should see:
```
[startup] Loading model artifacts...
[startup] Model loaded — 86 features
[startup] Building fleet dataframe...
[startup] Fleet ready — 6,925 rows, 50 locos
[startup] Fleet scored ✓
[startup] API ready

Starting LocoSense API on http://localhost:5001
```

---

## Endpoints

### GET /health
```bash
curl http://localhost:5001/health
```

### GET /api/fleet — all locos
```bash
curl http://localhost:5001/api/fleet
```

### GET /api/fleet — filtered
```bash
curl "http://localhost:5001/api/fleet?risk=High"
curl "http://localhost:5001/api/fleet?zone=NR"
curl "http://localhost:5001/api/fleet?type=WAP7"
```

### GET /api/loco/<id> — single loco detail
```bash
curl http://localhost:5001/api/loco/WAP7-1001
```

### GET /api/loco/<id>/history — risk trend
```bash
curl http://localhost:5001/api/loco/WAP7-1001/history
```

### GET /api/summary — fleet stats
```bash
curl http://localhost:5001/api/summary
```

### POST /api/predict — live sensor input
```bash
curl -X POST http://localhost:5001/api/predict \
  -H "Content-Type: application/json" \
  -d '{
    "loco_id": "WAP7-TEST",
    "loco_type": "WAP7",
    "zone": "NR",
    "manufacture_year": 2015,
    "cycle": 95,
    "days_since_service": 12,
    "engine_temp": 88.5,
    "oil_pressure": 4.2,
    "vibration": 1.8,
    "fuel_efficiency": 72.3,
    "coolant_temp": 81.0,
    "bearing_temp": 65.4,
    "rpm": 1450,
    "exhaust_temp": 410.0,
    "turbo_pressure": 2.1,
    "load_factor": 68.5,
    "battery_voltage": 24.1,
    "brake_pressure": 5.8
  }'
```

---

## Notes

- API runs on **port 5001** (port 5000 is used by AirPlay Receiver on Mac)
- Model + fleet data are loaded **once at startup** — not per request
- Response time should be **< 200ms** for `/api/fleet` and `/api/predict`
- SHAP computation adds ~100ms for `/api/loco/<id>` — acceptable for dashboard
