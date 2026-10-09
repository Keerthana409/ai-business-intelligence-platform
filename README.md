# AI-Powered Business Intelligence & Decision Intelligence Platform

A web-based platform tailored for small retail businesses (clothing shops, supermarkets, and grocery stores) to analyze historical sales data, forecast product demand using machine learning, detect inventory risks, and simulate strategic decisions.

---

## 🏛️ Architecture Overview

The system adopts a modern **MERN** (MongoDB, Express.js, React.js, Node.js) layered architecture:

- **Frontend (`client/`)**: Single-page application built with **React 19** and **Vite**, using **Recharts** for visual analytics and custom modular CSS.
- **Backend (`server/`)**: RESTful API service built with **Node.js** and **Express.js**, enforcing JWT authentication, validation, and rate limiting.
- **Database**: **MongoDB** with **Mongoose ODM** for schema definition, indexing, and multi-tenant data isolation.
- **Analytics & Decision Engine (`server/src/ml/`)**: Pure algorithmic and statistical engine implementing quantitative models with **zero dependency on external Large Language Models (LLMs)**.

---

## 🔬 Mathematical ML & Decision Intelligence Engine

In strict adherence to the project specifications, **no LLMs (ChatGPT, Gemini, Claude, etc.) are used**. All predictions, risk indicators, and recommendations are computed directly by statistical formulations and transparent rule-based systems:

1. **Demand Forecasting**:
   - **Moving Averages (SMA / WMA)**: Baseline smoothing for stable goods.
   - **Holt-Winters / Exponential Smoothing**: Captures level, trends, and seasonal cycles in retail sales.
   - **Ordinary Least Squares (OLS) Linear Regression**: Trend fitting and projection.
   - **Error Metrics**: Real-time calculation of Mean Absolute Percentage Error (MAPE), MAE, and RMSE.
2. **Inventory Risk Detection**:
   - **Reorder Point (ROP)**: $ROP = (d \times L) + SS$, where $d$ is average daily demand, $L$ is supplier lead time, and $SS = Z \times \sigma_L$ is safety stock.
   - **Economic Order Quantity (EOQ)**: $EOQ = \sqrt{\frac{2DS}{H}}$, optimizing order frequency against holding costs.
   - **Stockout Risk Probability**: Computed via Standard Normal Cumulative Distribution Function ($Z$-Score).
   - **ABC Inventory Classification**: Pareto 80/20 classification dividing SKUs into high, medium, and low revenue contributions.
3. **What-If Decision Simulator**:
   - **Price Elasticity of Demand**: $E_d = \frac{\% \Delta Q}{\% \Delta P}$, modeling demand drops or surges when retail prices fluctuate.
   - **Cost-Volume-Profit (CVP)**: Real-time sensitivity analysis for promotions, supplier cost hikes, and bulk discounts.
4. **Explainable Recommendations & Outcome Tracking**:
   - Every recommendation references the specific mathematical threshold or rule that triggered it.
   - Historical audit tracking measures pre-decision and post-decision KPIs to quantify whether the business advice yielded profit or reduced stockouts.

---

## 📂 Project Directory Structure

```text
ai and di/
├── package.json                   # Root orchestrator scripts (concurrently dev runner)
├── .gitignore                     # Git ignore rules for node_modules, .env, and logs
├── README.md                      # Complete system documentation
├── client/                        # React + Vite Frontend
│   ├── index.html                 # HTML Entry point
│   ├── vite.config.js             # Vite configuration
│   ├── package.json               # Client dependencies
│   ├── .env.example               # Environment variables template
│   └── src/
│       ├── main.jsx               # Application bootstrap
│       ├── App.jsx                # Main layout and route container
│       ├── assets/                # Static assets (logos, icons)
│       ├── components/            # UI components
│       │   ├── common/            # Buttons, Navbar, Modals, Cards
│       │   ├── charts/            # Recharts components (Trends, Forecasts, Risk)
│       │   └── dashboard/         # KPI cards, metrics widgets
│       ├── context/               # React Context (AuthContext)
│       ├── hooks/                 # Custom React hooks (useAuth, useFetch)
│       ├── pages/                 # Full-page views for all 8 modules
│       ├── services/              # API communication layer (Axios)
│       ├── styles/                # CSS design system (theme.css)
│       └── utils/                 # Formatting and client validation helpers
└── server/                        # Node.js + Express Backend & ML Engine
    ├── package.json               # Server dependencies
    ├── .env.example               # Server environment variables template
    ├── uploads/                   # Temporary directory for CSV uploads (.gitkeep)
    └── src/
        ├── server.js              # Server entry point & DB bootstrap
        ├── app.js                 # Express application & middleware setup
        ├── config/                # MongoDB configuration (db.js)
        ├── controllers/           # Route controller logic
        ├── middleware/            # Auth, validation, error handler, multer
        ├── models/                # Mongoose database models (User, Product, Sale, etc.)
        ├── routes/                # Express API routes
        ├── ml/                    # Statistical & Decision Intelligence Engine
        │   ├── forecasting/       # Moving Average, Exp Smoothing, Linear Regression
        │   ├── inventory/         # ROP, EOQ, ABC Pareto, Stockout Probability
        │   ├── decisionEngine/    # Rule Engine, What-If Simulator, Explainability
        │   └── utils/             # Math utilities (mathStats.js)
        └── utils/                 # CSV parsing and response helpers
```

---

## 🚀 Running the Application

### Prerequisites
- Node.js (v18+ or v24+)
- MongoDB (Local Community Server running on `mongodb://localhost:27017` or a MongoDB Atlas connection string)

### 1. Environment Configuration
Create a `.env` file in `server/` by copying `server/.env.example`:
```bash
cp server/.env.example server/.env
```
Fill in the values:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/retail_bi_db
JWT_SECRET=your_secure_random_key_here
CLIENT_URL=http://localhost:5173
```

Create a `.env` file in `client/` by copying `client/.env.example`:
```bash
cp client/.env.example client/.env
```

### 2. Launch Development Servers
From the root directory:
```bash
# Run both Backend (Port 5000) and Frontend (Port 5173) concurrently:
npm run dev

# Or run separately:
npm run dev:server    # Backend only
npm run dev:client    # Frontend only
```

---

## 🔒 Security Considerations
1. **Password Hashing**: Passwords stored using `bcryptjs` with high salt work factors (never plaintext).
2. **Stateless JWT Authentication**: Secure expiration (`7d`), verified per protected API request.
3. **HTTP Hardening**: `helmet` headers to protect against XSS, clickjacking, and MIME-sniffing.
4. **CORS Restrictions**: Express restricted to only accept origin from `CLIENT_URL`.
5. **Data Isolation**: Multi-tenant database design where all sales, products, and recommendations are keyed to the authenticated shop's `userId`.
6. **Input Sanitization & Upload Safety**: Multer CSV ingestion validates file types and sanitizes inputs before streaming into the database.
