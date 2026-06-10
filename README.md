# SMSBulk Platform

A bulk SMS automation platform that generates personalized landing pages for businesses and sends outreach SMS messages via Telnyx. Upload a CSV of leads, and the platform generates a unique landing page for each business, deploys it to Cloudflare Pages, and sends a personalized SMS with the link.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SMSBulk Platform                                │
│                                                                         │
│  ┌──────────────┐    ┌──────────────────────────────────────────────┐  │
│  │   Frontend   │    │                  Backend                       │  │
│  │   (Vite/React)│    │              (Express/Node)                  │  │
│  │   Port 5173  │    │              Port 4000                        │  │
│  └──────┬───────┘    │  ┌─────────────────────────────────────────┐ │  │
│         │            │  │          Campaign Worker                  │ │  │
│         │            │  │  (BullMQ + Redis — sequential queue)     │ │  │
│         │            │  └──────────────────┬────────────────────────┘ │  │
│         │            └────────────────────│───────────────────────────┘  │
│         │                               │                                │
│         │          ┌────────────────────┤                                │
│         │          │                    │                                │
│         ▼          ▼                    ▼                                │
│  ┌──────────────┐   Telnyx         Cloudflare Pages                     │
│  │  PostgreSQL  │  (SMS API)       (Landing Pages)                      │
│  │   Port 5432  │                  https://*.pages.dev                  │
│  └──────────────┘                                                        │
│  ┌──────────────┐                                                        │
│  │    Redis     │                                                        │
│  │   Port 6379  │                                                        │
│  └──────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

## Pipeline Flow

```
User uploads CSV
    │
    ▼
┌──────────┐   ┌─────────────────┐   ┌──────────────────┐   ┌────────────┐
│  Parse   │──▶│ Generate HTML   │──▶│ Deploy to CF     │──▶│ Send SMS   │
│  (lead)  │   │ (biz+city+phone)│   │ Pages (unique URL)│   │ (Telnyx)  │
└──────────┘   └─────────────────┘   └──────────────────┘   └────────────┘
      │                                                        │
      └──────────── Lead siteUrl stored in CampaignLead ────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker + Docker Compose (for local Postgres + Redis)
- Telnyx account with API key and phone number
- Cloudflare account with API token + Pages access

### 1. Clone & Install

```bash
git clone <repo-url>
cd smsbulk

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
cd backend
cp .env.example .env
# Edit .env with your API keys (see Environment Variables below)
```

### 3. Start Services with Docker

```bash
# From the project root (smsbulk directory)
docker compose up -d postgres redis
```

### 4. Run Prisma Migrations

```bash
cd backend
npx prisma migrate deploy --schema src/prisma/schema.prisma
npx prisma generate --schema src/prisma/schema.prisma
```

### 5. Start Development Servers

```powershell
# From the project root
.\start-dev.ps1
```

Or manually:

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

**Frontend:** http://localhost:5173
**Backend:** http://localhost:4000

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `TELNYX_API_KEY` | Yes | Telnyx API key (`KEY...`) |
| `TELNYX_PUBLIC_KEY` | Yes | Telnyx public key for webhook verification |
| `TELNYX_PHONE_NUMBER` | Yes | Your Telnyx phone number (`+1...`) |
| `DEFAULT_FROM_NUMBER` | Yes | Default sender number (usually same as TELNYX_PHONE_NUMBER) |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API token (with Pages Edit permission) |
| `CLOUDFLARE_PROJECT_NAME` | Yes | Cloudflare Pages project name (e.g. `sms-bulk-pages`) |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `/api` | Backend API base URL |
| `VITE_SOCKET_URL` | `/` | Socket.io server URL |

---

## CSV Format

Upload a CSV with the following columns (headers are case-insensitive):

| Column | Aliases | Example |
|---|---|---|
| `business_name` | `businessName`, `name`, `business` | Squire's Grooming Lounge |
| `phone` | `phone_number`, `Phone`, `Phone Number` | +14374647338 |
| `city` | `City`, `location` | Austin, TX |

Example:

```csv
business_name,phone,city
Squire's Grooming Lounge,+14374647338,Austin, TX
The Executive Barbers,+12125550100,New York, NY
```

---

## How to Use

### 1. Create a Campaign

1. Go to **Campaigns → New Campaign**
2. **Step 1 — Campaign Setup**: Name your campaign, choose template and max leads
3. **Step 2 — Upload CSV**: Drag and drop your CSV file. The validator shows a preview of parsed leads
4. **Step 3 — Message Composer**: Write your outreach message using placeholders:
   - `{{BUSINESS_NAME}}` — replaced with the business name from the CSV
   - `{{SITE_URL}}` — replaced with the generated landing page URL
5. **Step 4 — Review & Launch**: Confirm settings and launch

### 2. Message Placeholders

Your outreach message should include `{{SITE_URL}}` so recipients get the link to their personalized landing page:

```
Hi {{BUSINESS_NAME}}, we created a free website for your business! Check it out: {{SITE_URL}}
```

### 3. What Happens When You Launch

Each lead in the CSV triggers:
1. **Site Generation**: An HTML page is generated from the `barber-template.html` template, with `{{BUSINESS_NAME}}`, `{{CITY}}`, and `{{PHONE}}` replaced
2. **Cloudflare Deployment**: The page is deployed to Cloudflare Pages and a unique URL is created
3. **SMS Send**: After the configured delay, an SMS is sent via Telnyx with the site link
4. **Status Tracking**: Each lead's status is updated: `pending` → `processing` → `site_deployed` → `sms_sent`

### 4. Quick Test

Use the **Quick Test** button on the Dashboard to test the full pipeline with a single lead (generate site + send 1 SMS) without creating a full campaign.

---

## Deployment

### Railway (Recommended)

The app deploys to Railway with two separate services:

#### Backend

```bash
cd backend
# railway.json is preconfigured with NIXPACKS + Node 20
railway up
```

Set environment variables in the Railway dashboard (see Environment Variables above).

#### Frontend

```bash
cd frontend
# railway.json uses DOCKERFILE builder
railway up
```

Set `VITE_API_URL` to your backend's Railway URL (e.g. `https://your-backend.up.railway.app/api`).

### Docker Compose (Self-hosted)

```bash
docker compose up -d
```

Set the following environment variables before running:

```bash
export TELNYX_API_KEY="KEY..."
export TELNYX_PUBLIC_KEY="..."
export TELNYX_PHONE_NUMBER="+1..."
export DEFAULT_FROM_NUMBER="+1..."
export CLOUDFLARE_ACCOUNT_ID="..."
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_PROJECT_NAME="sms-bulk-pages"
```

---

## Troubleshooting

### Redis not available — worker is disabled
The campaign worker requires Redis. If Redis is not connected, campaigns will be saved but the queue won't process leads. Make sure `REDIS_URL` is set correctly.

### Cloudflare Pages deployment fails
- Ensure `CLOUDFLARE_API_TOKEN` has the `Cloudflare Pages: Edit` permission
- The Wrangler CLI must be installed (included in the Dockerfile and auto-installed via `npm install -g wrangler`)

### Telnyx SMS not sending
- Verify your `TELNYX_API_KEY` is correct (should start with `KEY`)
- Check your Telnyx balance: `GET /api/balance`
- Ensure your phone number is active in the Telnyx dashboard

### CSV validation fails
- Headers are case-insensitive: `business_name`, `businessName`, `name`, and `Business Name` are all accepted for the business name column
- Phone numbers must have at least 10 digits and be normalized to E.164 format
- At least 3 columns required: business name, phone, city

### Prisma migration fails
```bash
# Reset the database (warning: destroys data)
npx prisma migrate reset --schema src/prisma/schema.prisma
```

### API Status page shows red
- Click **Refresh** to re-check
- Check that the backend server is running
- Verify environment variables are set in the `.env` file

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/balance` | Telnyx account balance |
| `GET` | `/api/numbers` | List Telnyx phone numbers |
| `GET` | `/api/health` | Health check (DB + Redis) |
| `GET` | `/api/campaigns` | List all campaigns |
| `POST` | `/api/campaigns/wizard` | Create and launch a campaign |
| `POST` | `/api/campaigns/validate-csv` | Validate CSV content |
| `POST` | `/api/campaigns/quick-test` | Test pipeline with one lead |
| `GET` | `/api/campaigns/:id` | Get campaign details |
| `DELETE` | `/api/campaigns/:id` | Delete a campaign |
| `GET` | `/api/campaigns/cloudflare/status` | Cloudflare Pages health check |
| `GET` | `/api/test/all` | Test all API integrations |
| `GET` | `/api/test/telnyx` | Test Telnyx integration |
| `GET` | `/api/test/cloudflare` | Test Cloudflare integration |
| `POST` | `/api/webhooks/telnyx` | Receive Telnyx SMS status webhooks |
