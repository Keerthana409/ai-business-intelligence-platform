"""
Configuration constants for the Python FastAPI Machine Learning Service.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

# Minimum historical data thresholds required for reliable ML training
MIN_DAYS_FOR_RF_FORECAST = int(os.getenv("MIN_DAYS_FOR_RF_FORECAST", "14"))
MIN_DAYS_FOR_PRODUCT_RF = int(os.getenv("MIN_DAYS_FOR_PRODUCT_RF", "10"))
MIN_TRANSACTIONS_FOR_IFOREST = int(os.getenv("MIN_TRANSACTIONS_FOR_IFOREST", "15"))
MIN_DAYS_FOR_DAILY_IFOREST = int(os.getenv("MIN_DAYS_FOR_DAILY_IFOREST", "14"))

# Default Random Forest hyperparameters
RF_N_ESTIMATORS = 100
RF_MAX_DEPTH = 6
RF_MIN_SAMPLES_LEAF = 2
RF_RANDOM_STATE = 42

# Default Isolation Forest hyperparameters
IF_N_ESTIMATORS = 100
IF_RANDOM_STATE = 42
