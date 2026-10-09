# Machine Learning & Decision Intelligence Engine

## Architectural Principles
1. **Zero LLM Dependency**: No external Large Language Models (ChatGPT, Claude, Gemini, etc.) or stochastic generative APIs are used.
2. **Transparent & Deterministic**: All forecasts, risk scores, and recommendations are computed using statistical models, classical machine learning algorithms, and transparent rule-based decision trees.
3. **Auditable & Explainable**: Every prediction and recommendation includes its mathematical derivation and rationale parameters for business owners.

## Sub-Modules
- `forecasting/`: Time-series forecasting models (Moving Averages, Holt-Winters / Exponential Smoothing, Linear & Polynomial Trend Regression).
- `inventory/`: Quantitative inventory optimization (Reorder Point Calculation, Economic Order Quantity - EOQ, Stockout Risk Probability via Z-Scores, ABC Pareto Classification).
- `decisionEngine/`: Rule-based recommendation engine, What-If scenario simulation (Price Elasticity, Demand Shifts, Cost Fluctuations), and recommendation audit/tracking.
- `utils/`: Core mathematical and statistical utilities (Normal Distribution CDF, variance, covariance, metrics evaluation like MAE, RMSE, MAPE).
