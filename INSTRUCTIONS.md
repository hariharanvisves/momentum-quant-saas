
# Deployment Instructions

1. Install NodeJS 18+
2. Copy .env.example to .env and fill in values
3. npm install
4. npm start

# Production

Use PM2:
pm2 start server.js

Use Nginx reverse proxy for SaaS deployment.

# Weekly Automation

Use cron:

0 9 * * MON curl -X POST http://localhost:3000/api/rebalance -d '{"execute":true}'

# Disclaimer

This is educational. Add risk checks before real trading.
