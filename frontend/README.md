
# Frontend — Momentum Quant SaaS

Vite + React 18 + Recharts. Served from `public/` in production (built by Express); in dev, runs at `:5173` and proxies `/api` to Express at `:3000`.

## Dev

```bash
npm install
npm run dev   # starts at http://localhost:5173
```

## Build

```bash
npm run build   # outputs to ../public/
```

## Structure

```
src/
  api.js              # Axios instance; attaches Authorization: Bearer <token>
  AuthContext.jsx     # JWT state, login/logout
  App.jsx             # Routes + Layout
  components/
    Layout.jsx
    LoginPage.jsx
    RegisterPage.jsx
    ScannerPanel.jsx
    BacktestPanel.jsx
    OptimizerPanel.jsx
    RebalancePanel.jsx
    StrategiesPanel.jsx
    PortfolioManager.jsx
    PortfolioDetail.jsx
    IntradayScoring.jsx
    ResultsTable.jsx
    ScoreChart.jsx
    DrawdownChart.jsx
    HeatmapTable.jsx
    PresetCards.jsx
    QuantityCalculator.jsx
    SipCalculator.jsx
    Pagination.jsx
```

## Proxy

`vite.config.js` proxies `/api` → `http://localhost:3000` so the frontend can hit the backend without CORS issues during development.
