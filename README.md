# SharedExpenses

SharedExpenses is a group travel expense and budget app for friend trips. It tracks shared spending, shows who owes whom, keeps the trip budget visible, and forecasts where the group will land if current spending continues.

## Features

- Trip creation with destination, dates, travelers, and a shared budget
- Exact expense splitting with integer-cent allocations
- Selective participation, including expenses where the payer is not a participant
- Balance calculation and compact settle-up transfer suggestions
- Trip Pace overview comparing trip progress, budget usage, and projected final spend
- Insights powered by pandas: category totals, daily spend, averages, and forecasting
- Guest view plus PIN unlock so you can showcase the app without letting visitors edit data

## Tech Stack

- Frontend: React, Vite, Recharts
- Backend: Python, Flask, SQLAlchemy, SQLite, pandas
- Tests: pytest

## Architecture

React UI talks to a Flask REST API. Flask uses SQLAlchemy models backed by SQLite for trips, members, expenses, and participant shares.

```text
React
  → Flask REST API
    → SQLAlchemy
      → SQLite
```

Analytics flow:

```text
SQL expense data
  → pandas analytics
    → Flask API
      → React visualizations
```

## Access modes

On first visit you choose:

- **View as guest** — browse trips, balances, settlements, and insights in read-only mode
- **5-digit PIN** — unlock create / edit / delete actions

Default PIN: `48291`

Change it before hosting by setting an environment variable:

```powershell
$env:ACCESS_PIN = "12345"
```

Mutating API requests require the `X-Access-Pin` header. Guest mode never sends it.

## Local Setup

Assumes you cloned the repository.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python seed.py
python run.py
```

The API listens on `http://127.0.0.1:5000`.

### Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` requests to the Flask server.

### Database initialization and seed data

`python seed.py` recreates the SQLite database and loads the demo trip **New York Weekend** (labeled Demo) with four travelers and fifteen realistic expenses.

Database file location:

```text
backend/instance/shared_expenses.db
```

### Tests

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest
```

## Hosting (Netlify frontend + Render API)

Netlify hosts the React app. Flask cannot run on Netlify, so the API goes on Render.

### Step 0 — Put the project on GitHub

Netlify and Render both deploy from GitHub. Commit and push this repo first.

### Step 1 — Deploy the API on Render

1. Go to [render.com](https://render.com) and sign in with GitHub.
2. **New → Web Service** → select this repo.
3. Use:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn -b 0.0.0.0:$PORT wsgi:app`
4. Environment variables:
   - `ACCESS_PIN` = your private 5-digit PIN
   - optional `CORS_ORIGINS` = your Netlify URL later, e.g. `https://your-site.netlify.app`
5. Deploy, then open Render **Shell** and run:
   ```bash
   python seed.py
   ```
6. Copy your API URL, for example:
   `https://sharedexpenses-api.onrender.com`

There is also a `render.yaml` in the repo if you prefer Blueprint deploy.

### Step 2 — Deploy the frontend on Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
2. Choose this GitHub repo.
3. Netlify should pick up `netlify.toml` automatically:
   - base: `frontend`
   - build: `npm run build`
   - publish: `dist`
4. Before first deploy, add environment variable:
   - `VITE_API_URL` = `https://YOUR-RENDER-URL.onrender.com/api`
5. Deploy.

Your site will be something like `https://something.netlify.app`.

### Step 3 — Connect them

1. In Render, set `CORS_ORIGINS` to your Netlify URL (optional but cleaner than `*`).
2. Open the Netlify site.
3. Use **View as guest** to demo, or your PIN to edit.

### Notes

- Free Render instances sleep when idle; the first request after sleep can take ~30–60s.
- Free SQLite on Render can reset on redeploy unless you attach a persistent disk. For personal use, re-run `python seed.py` after a wipe, or add a disk.
- If you change `VITE_API_URL`, trigger a new Netlify deploy so the frontend rebuilds with the new API address.

## Product Logic

### Expense splitting

Authoritative amounts are stored as integer cents. Equal splits distribute remainder cents deterministically so participant shares always sum exactly to the expense total.

### Balance calculation

For each member:

- Paid = sum of expenses they paid
- Responsible share = sum of their allocated expense shares
- Net balance = Paid − Responsible Share

Positive net means they should receive money. Negative net means they owe.

### Settlement generation

A debtor/creditor matching algorithm pairs people who owe with people who should receive, producing a small set of exact transfers that clear the trip.

### Trip Pace

Trip Pace compares how far through the calendar the trip is with how much of the budget has already been used. It also surfaces projected final spend and a remaining daily target.

### Forecasting

For active trips, average daily spend is projected across remaining days. Completed trips forecast as actual final spend. Upcoming trips do not invent future pace yet, but already-logged expenses still count toward projected final spend.

## Screenshots

### Trips

_Add a screenshot of the trip list / trip switcher here._

### Trip Overview

_Add a screenshot of Trip Pace and recent activity here._

### Expenses

_Add a screenshot of the expense feed and add-expense dialog here._

### Settle Up

_Add a screenshot of suggested transfers here._

### Insights

_Add a screenshot of charts and forecast metrics here._
