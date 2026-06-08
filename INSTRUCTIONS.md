
# Deployment Instructions

## Prerequisites

- Node.js 18+
- Zerodha Kite developer account (for live trading only)

## Install

```bash
npm install
cd frontend && npm install && cd ..
cp .env.example .env   # then fill in values
```

## Development

Two terminals required:

```bash
# Terminal 1 — backend (auto-reload)
npm run dev

# Terminal 2 — frontend at :5173
npm run frontend
```

## Production

```bash
npm run frontend:build   # builds React → public/
npm start                # Express serves everything at :3000
```

Use PM2 for process management:

```bash
npm install -g pm2
npm run frontend:build
pm2 start server.js --name momentum-quant
pm2 save && pm2 startup
```

Use Nginx as a reverse proxy for SaaS/VPS deployment.

## Refresh Stock Data

```bash
npm run fetch-universes   # all NIFTY universes
npm run fetch-nifty500    # NIFTY 500 only
```

## Weekly Automation

```bash
# Runs every Monday at 9:15 AM IST
15 9 * * MON curl -s -X POST http://localhost:3000/api/rebalance \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"execute":true,"dryRun":false,"universe":"nifty500","capitalPerStock":50000}'
```

## Disclaimer

Educational use only. Add risk checks before using real capital.
