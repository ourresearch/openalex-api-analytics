# OpenAlex API Analytics Dashboard

A Cloudflare Worker that provides real-time analytics visualization for OpenAlex API usage, including top authenticated users and anonymous traffic patterns.

## Features

- **Top API Users**: View the top 10 authenticated API users with their names, emails, and organizations (from D1 database lookup)
- **Top Anonymous Users**: Track the top 10 anonymous users by IP bucket (hashed IP addresses)
- **Usage Timeline**: Interactive charts showing request volume over time
- **Time Filtering**: Switch between hourly and daily views
- **Real-time Updates**: Refresh button to get the latest analytics
- **Beautiful UI**: Modern, responsive design with gradient backgrounds and glass-morphism effects

## Architecture

```
┌─────────────────┐
│   Dashboard UI  │
│  (HTML/JS/CSS)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Worker API     │
│  (src/index.ts) │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌─────┐
│Analytics│ │ D1  │
│ Engine  │ │ DB  │
└─────────┘ └─────┘
```

## Setup

### Prerequisites

- Node.js (v18 or later)
- Cloudflare account with Workers enabled
- Access to your existing OpenAlex D1 database
- Analytics Engine dataset (`openalex_requests_v2`)
- Cloudflare API Token with "Account Analytics Read" permission

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up local development environment:
   - Copy `.dev.vars.example` to `.dev.vars`
   - Add your Cloudflare Account ID and API Token to `.dev.vars`:
   ```bash
   ACCOUNT_ID=a452eddbbe06eb7d02f4879cee70d29c
   API_TOKEN=your_api_token_here
   ```
   - Find your Account ID in the Cloudflare dashboard (visible in the URL or sidebar)
   - Create an API token: Dashboard → My Profile → API Tokens → Create Token
   - Give it "Account Analytics Read" permission

3. Set production secrets for deployment:
   ```bash
   npx wrangler secret put ACCOUNT_ID
   # Enter your account ID when prompted

   npx wrangler secret put API_TOKEN
   # Enter your API token when prompted
   ```

4. Update `ANALYTICS_DATASET` in `wrangler.jsonc` if your dataset has a different name

5. Test locally:
```bash
npm run dev
```

6. Deploy to Cloudflare:
```bash
npm run deploy
```

## API Endpoints

### GET /api/top-users

Get top authenticated API users.

**Query Parameters:**
- `period` (optional): `hour` or `day` (default: `hour`)
- `limit` (optional): Number of results (default: `10`)

**Response:**
```json
{
  "period": "hour",
  "data": [
    {
      "apiKey": "abc123...",
      "name": "John Doe",
      "email": "john@example.com",
      "organization": "Example University",
      "requestCount": 1234,
      "avgResponseTime": 145.67,
      "successRate": 98.5
    }
  ],
  "timestamp": "2025-10-16T12:00:00.000Z"
}
```

### GET /api/top-anonymous

Get top anonymous users by IP bucket.

**Query Parameters:**
- `period` (optional): `hour` or `day` (default: `hour`)
- `limit` (optional): Number of results (default: `10`)

**Response:**
```json
{
  "period": "hour",
  "data": [
    {
      "bucket": "anon_1234",
      "ipSample": "192.168.1.1",
      "requestCount": 567,
      "avgResponseTime": 123.45,
      "successRate": 95.2
    }
  ],
  "timestamp": "2025-10-16T12:00:00.000Z"
}
```

### GET /api/usage-timeline

Get time-series data for request volume.

**Query Parameters:**
- `period` (optional): `hour` or `day` (default: `hour`)
  - `hour`: Returns data in 5-minute buckets
  - `day`: Returns data in 1-hour buckets

**Response:**
```json
{
  "period": "hour",
  "data": [
    {
      "timestamp": "2025-10-16T12:00:00.000Z",
      "requestCount": 234,
      "avgResponseTime": 156.78
    }
  ],
  "timestamp": "2025-10-16T12:00:00.000Z"
}
```

## Analytics Data Schema

The dashboard queries Analytics Engine data that was logged by your API proxy with this schema:

**Indexes:**
- `index1`: `${userKey}_${statusCode}` (e.g., `apikey123_200` or `anon_1234_200`)

**Blobs:**
- `blob1`: API key (empty for anonymous users)
- `blob2`: IP address
- `blob3`: Full URL path
- `blob4`: HTTP method
- `blob5`: Scope (main, text, users, export)

**Doubles:**
- `double1`: Response time (ms)
- `double2`: HTTP status code
- `double3`: Rate limit
- `double4`: Tokens remaining

## Configuration

Edit `wrangler.jsonc` to configure:

```jsonc
{
  "name": "openalex-api-analytics",

  // Only non-sensitive configuration goes here
  "vars": {
    "ANALYTICS_DATASET": "openalex_requests_v2"
  },

  // D1 database binding
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "openalex-db",
      "database_id": "769bdd92-0544-4135-b2e4-c67f1df17994"
    }
  ]
}
```

**Important:** `ACCOUNT_ID` and `API_TOKEN` are stored as Wrangler secrets (not in wrangler.jsonc) for security. Set them using:
```bash
npx wrangler secret put ACCOUNT_ID
npx wrangler secret put API_TOKEN
```

## Analytics Engine & Sampling

This dashboard correctly accounts for Analytics Engine's **adaptive sampling** feature. At high traffic volumes, Cloudflare automatically samples data to maintain performance. The queries use the `_sample_interval` field to provide accurate counts:

- **Request counts**: `SUM(_sample_interval)` instead of `COUNT()`
- **Averages**: `SUM(field * _sample_interval) / SUM(_sample_interval)`
- **Success rates**: Weighted by sample interval for accuracy

This ensures the dashboard shows accurate metrics even when data is sampled. You don't need to do anything special - it works automatically.

## Development

- **Local development**: `npm run dev` (runs on http://localhost:8787)
- **View logs**: `npm run tail`
- **Type checking**: `npx tsc --noEmit`

## Tech Stack

- **Cloudflare Workers**: Serverless compute platform
- **TypeScript**: Type-safe development
- **Analytics Engine**: Time-series data storage and querying
- **D1**: Serverless SQL database for user lookups
- **Chart.js**: Interactive charts
- **Tailwind CSS**: Modern UI styling

## Performance Notes

- Analytics queries are optimized with proper time range filtering
- D1 lookups use indexed queries on the `api_key` column
- The dashboard uses Promise.all() to load data in parallel
- Charts are responsive and performant even with large datasets

## Troubleshooting

### No data showing up

1. Verify Analytics Engine is receiving data from your proxy
2. Check that the dataset name in `wrangler.jsonc` matches your actual dataset (`ANALYTICS_DATASET`)
3. Ensure your `ACCOUNT_ID` is correct
4. Verify your `API_TOKEN` has the "Account Analytics Read" permission
5. Check the browser console and worker logs for API errors

### Authentication errors (401/403)

1. Verify your API token is set: `npx wrangler secret list` should show `API_TOKEN`
2. Recreate the token with "Account Analytics Read" permission if needed
3. Update the secret: `npx wrangler secret put API_TOKEN`

### D1 lookup errors

1. Verify the database ID in `wrangler.jsonc` matches your database
2. Check that the `api_keys` table exists and has the correct schema
3. Ensure the worker has permission to access the database

### Query errors

1. Check that your Analytics Engine dataset exists and has data
2. The SQL queries use ClickHouse-compatible syntax - verify your dataset supports it
3. Look at the worker logs for detailed SQL error messages

### CORS errors

The worker includes CORS headers by default. If you're still seeing CORS issues, check your Cloudflare Worker settings.

## License

MIT
