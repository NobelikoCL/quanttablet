# QuantTablet — Quantitative Trading Dashboard

> Full-stack trading operations platform with real-time MetaTrader 5 integration, built for active traders on Windows.

---

## Overview

QuantTablet is a local web dashboard that connects directly to one or more **MetaTrader 5** terminals running on the same machine. It provides real-time account monitoring, automated risk management, a multi-timeframe market scanner, and a unified notification center — all accessible from any device on your local network (PC, tablet, phone).

---

## Screenshots

> Dashboard · Market Watch · Economic Calendar · History · Notification Center

---

## Features

### Trading & Risk Management
- **Live account data** — balance, equity, margin, floating P&L updated every 3 seconds
- **Global profit monitor** — automatically closes all positions when a configurable % target is reached
- **Global stop loss monitor** — automatically closes all positions and disables trading when a configurable % drawdown is reached
- **Proactive drawdown alerts** — toast warnings at 50%, 75% and 90% of the configured drawdown limit before it triggers
- **Breakeven automation** — set SL to entry price on all winning positions globally or per symbol
- **Per-symbol targets** — individual profit and loss limits in USD with auto-close per symbol
- **Emergency close** — single button to liquidate all open positions instantly
- **Close by direction** — close only BUY or SELL side of a symbol independently

### Market Scanner
- **Fractal detection** — Bill Williams fractals confirmed across configurable timeframes (M5 to D1)
- **EMA confluence** — detects alignment of multiple EMAs across timeframes (M15 to H4)
- **Price action** — breakout detection on M15
- **Stochastic signals** — bullish/bearish cross, overbought/oversold detection
- **Volume filter** — flags symbols with abnormal volume vs moving average
- **Multi-threaded** — scans all visible MT5 symbols in parallel using ThreadPoolExecutor
- **Configurable** — enable/disable each signal type, set timeframes, filter symbols

### Notification Center
- **Unified panel** — fractals and macro news in one place, sorted by time
- **Read/unread tracking** — blue dot on unread items, fades when read
- **Mark all as read** — single button to clear unread count without deleting history
- **Dismiss individual** — X button per item; dismissed fractals won't re-appear from the scanner
- **Filter tabs** — All / Unread / Fractals / Macro
- **Toast popups** — real-time alerts for new fractals and macro news with sound

### Economic Calendar
- **TradingView widget** — live macro events with full details
- **Impact filter** — toggle High / Medium / Low impact events
- **Currency filter** — show/hide events by currency (USD, EUR, GBP, JPY, AUD, CAD, CHF, NZD, CNY)
- **Countdown** — live timer to the next high-impact macro event using ForexFactory data

### Performance Analytics (History tab)
- **Win Rate, Profit Factor, Net Profit, Avg Win/Loss**
- **Sharpe Ratio** — calculated from the distribution of closed trade returns
- **Max Drawdown** — calculated from cumulative P&L series (USD and %)
- **Cumulative P&L chart** — area chart showing equity curve of closed trades
- **CSV export** — download any filtered period as a spreadsheet
- **Period selector** — Today / Week / Month / Year / All time

### Multi-Account (Copy Trading)
- Register multiple MT5 terminals (different brokers)
- View positions across all terminals simultaneously
- Copy or close trades from one terminal to another
- Symbol mapping between brokers (e.g. `GOLD` → `XAUUSD`)
- Switch active terminal at runtime without restarting

### UX & Interface
- **Glassmorphism dark theme** — optimized for low-light trading environments
- **Responsive** — works on mobile, tablet, desktop and 2K monitors
- **Skeleton loaders** — smooth loading states instead of blank screens
- **Offline detection** — shows time since last connection, exponential backoff reconnect (5s → 10s → 20s → 40s → 60s)
- **Market session timer** — countdown to London, New York, Tokyo and Sydney sessions
- **LAN access** — access from any device on the local network via auto-detected IP

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend framework | Django 6.0 + Django REST Framework 3.16 |
| MT5 integration | MetaTrader5 Python library 5.0.5640 |
| Data processing | NumPy 2.4 + Pandas 3.0 |
| Database | SQLite3 (local, no setup required) |
| Authentication | API Key header (`X-API-KEY`) |
| Frontend framework | React 19 + Vite 7 |
| Styling | TailwindCSS 4 |
| Charts | Recharts 3 |
| Icons | Lucide React |
| HTTP client | Axios |
| Notifications | react-hot-toast |

---

## Project Structure

```
quanttablet/
├── backend/
│   ├── config/                  # Django settings, URLs, ASGI/WSGI
│   ├── quant_manager/
│   │   ├── models.py            # RiskSettings, EquitySnapshot, Signals, Terminals
│   │   ├── views.py             # 28 REST API endpoints
│   │   ├── mt5_client.py        # MT5Engine — connection, positions, risk monitor
│   │   ├── scanner.py           # MarketWatchScanner — multi-threaded signal detection
│   │   ├── price_action.py      # Fractal, EMA, Stochastic analysis logic
│   │   ├── serializers.py       # DRF serializers
│   │   ├── permissions.py       # API Key authentication
│   │   ├── tests.py             # 20 backend tests
│   │   └── services/            # ForexFactory + Alpha Vantage integrations
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── App.jsx              # Root — routing, notification center, polling
│       ├── api.js               # Auto-detects backend IP for LAN access
│       └── components/
│           ├── DashboardTab.jsx         # Positions, equity chart, risk actions
│           ├── MarketWatchTab.jsx       # Scanner signals table + settings
│           ├── HistoryTab.jsx           # Trade history, P&L chart, analytics
│           ├── EconomicCalendarTab.jsx  # Calendar widget + filters + countdown
│           ├── AccountsTab.jsx          # Multi-terminal copy trading
│           ├── RiskSettingsForm.jsx     # Global risk configuration
│           ├── MarketSessionTimer.jsx   # Session countdown popup
│           ├── MetricsPanel.jsx         # Top metrics cards
│           └── SkeletonLoader.jsx       # Loading state components
│
├── install.bat      # One-click setup (Python venv + pip + npm install)
├── start.bat        # One-click launch (Django + React dev server)
└── .gitignore       # Excludes venv, node_modules, db, logs, .env
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health/` | System status — no auth required |
| GET | `/api/account/` | Live account info |
| GET | `/api/dashboard-data/` | Account + positions + settings combined |
| GET | `/api/positions/` | Open positions grouped by symbol |
| GET/PUT | `/api/settings/` | Risk settings |
| GET | `/api/equity-history/` | Equity snapshots (M1 / M5 / H1) |
| GET | `/api/history/` | Closed trade history by period |
| GET | `/api/history/metrics/` | Win rate, Sharpe, Drawdown, Profit Factor |
| POST | `/api/actions/close_all/` | Emergency close all positions |
| POST | `/api/actions/breakeven/` | Set breakeven on all winning positions |
| POST | `/api/actions/breakeven_symbol/` | Breakeven for a specific symbol |
| POST | `/api/actions/close_symbol/` | Close all positions of a symbol |
| POST | `/api/actions/close_direction/` | Close BUY or SELL side of a symbol |
| POST | `/api/actions/close_winning_symbol/` | Close only profitable positions of a symbol |
| POST | `/api/actions/close_profit/` | Close positions above a profit % threshold |
| GET/POST | `/api/symbol-targets/` | Per-symbol TP/SL targets |
| GET | `/api/market-watch/signals/` | Detected signals (fractals, EMAs, scanning) |
| GET/PUT | `/api/market-watch/settings/` | Scanner configuration |
| GET | `/api/session-assets/` | Current prices for session timer symbols |
| GET | `/api/economic-calendar/` | Earnings calendar via Alpha Vantage |
| GET | `/api/macro-news/` | High/medium impact news via ForexFactory |
| GET/POST | `/api/terminals/` | MT5 terminal list |
| PUT/DELETE/POST | `/api/terminals/<id>/` | Edit / delete / activate terminal |
| GET | `/api/terminals/positions/` | Positions across all terminals |
| GET | `/api/terminals/<id>/symbols/` | Available symbols on a terminal |
| POST | `/api/terminals/copy-trade/` | Copy or close trade on a terminal |
| GET/POST/DELETE | `/api/terminals/symbol-mappings/` | Symbol mapping between brokers |

---

## Requirements

- **Windows 10/11** (MetaTrader 5 is Windows-only)
- **MetaTrader 5** terminal installed and logged in
- **Python 3.11+**
- **Node.js 18+**

---

## Installation

**1. Clone the repository**
```bash
git clone https://github.com/NobelikoCL/quanttablet.git
cd quanttablet
```

**2. Run the installer** (creates Python venv + installs all dependencies)
```
install.bat
```

**3. Launch the dashboard**
```
start.bat
```

The launcher will:
- Auto-detect your local IP
- Create `backend/.env` if it doesn't exist
- Run Django migrations
- Start Django on `0.0.0.0:8000`
- Start React dev server on `0.0.0.0:5173`

**4. Open in browser**
```
http://localhost:5173
```
Or from any device on your LAN:
```
http://<your-local-ip>:5173
```

---

## Configuration

### Environment variables (`backend/.env`)

```env
DEBUG=False
ALLOWED_HOSTS=*
CORS_ALLOW_ALL_ORIGINS=True
API_SECRET_KEY=your-secret-key-here
SECRET_KEY=your-django-secret-key
```

> **Important:** Change `API_SECRET_KEY` before using on a network. All API requests require the header `X-API-KEY: <your-key>`.

### Risk settings

Configured from the **Settings** tab in the UI:
- Max drawdown % before auto-close
- Default lot size
- Global profit target %
- Global stop loss %
- Magic number for order identification
- Alpha Vantage API key (for earnings calendar)

---

## Running Tests

```bash
cd backend
venv\Scripts\python.exe manage.py test quant_manager
```

Covers: models, API endpoints, permissions, signal classification, equity history.

---

## Health Check

```
GET /api/health/
```

No authentication required. Returns:
```json
{
  "status": "ok",
  "mt5_connected": true,
  "scanner_running": true,
  "db_ok": true,
  "last_signal_at": "2026-03-09T14:23:00Z",
  "timestamp": "2026-03-09T14:23:05Z"
}
```

---

## Notes

- The database (`db.sqlite3`) is excluded from the repository. It is created automatically on first run via `manage.py migrate`.
- Logs are stored in `backend/quant_backend_logs.log` with automatic rotation (10 MB × 5 files).
- The frontend auto-detects the backend IP using `window.location.hostname`, so LAN access works without any configuration changes.
- MT5 must be running and logged into an account before starting the backend.

---

## License

See [LICENSE](LICENSE) for details.
