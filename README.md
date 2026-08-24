# H1X Research Console

A personal HackerOne research dashboard: track your reports, earnings, programs
and private-program opportunities, plus a research library built from publicly
disclosed reports with an AI assistant that explains them.

> **This is a single-user, run-it-yourself tool.** Each person runs their own
> copy locally with their own API keys. Do not host one shared instance for a
> group — data is cached per server and would mix between users.

## Features

- **Overview** — report stats, balance, earnings trends, recent activity
- **Reports** — your submissions with detail pages (severity, scope, timeline)
- **Programs** — all programs you participate in, including your private
  bug-bounty opportunities (mirrors the site's private BBP filter)
- **Earnings / Analytics** — award history, rates, top programs & weaknesses
- **Disclosed Library** — newest public disclosures grouped by vulnerability
  class, with severity filtering/sorting and search; low-information
  disclosures are filtered out automatically
- **Research Assistant** — optional AI chat grounded in the selected report
  (bring your own provider key)

## Requirements

- Node.js 20+ and npm
- A HackerOne account with API access

## Setup

```bash
# 1. install dependencies
npm install

# 2. create your local secrets file
cp .env.example .env.local

# 3. edit .env.local — minimum required:
#    H1_USERNAME=your-h1-username
#    H1_TOKEN=your-h1-api-token
#
#    Get both from HackerOne: click your avatar → Settings →
#    API Tokens → "Create New Token".

# 4. run it
npm run dev
# open http://localhost:3000
```

For production-style hosting on your own machine:

```bash
npm run build
npm run start
```

## Optional: AI Research Assistant

The disclosed-reports assistant works with any of these (set in `.env.local`):

| Provider | Variables |
|---|---|
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| NVIDIA NIM | `AI_API_KEY` + `AI_BASE_URL=https://integrate.api.nvidia.com/v1` + `AI_MODEL=...` |
| Other OpenAI-compatible (OpenRouter, Groq, local) | `AI_API_KEY` + `AI_BASE_URL` + `AI_MODEL` |

Nemotron reasoning models should also set
`AI_EXTRA_BODY={"chat_template_kwargs":{"thinking":false}}`.

Without a key everything else works; the assistant panel shows setup
instructions instead. Keys are read server-side only and are never exposed to
the browser.

## Security notes

- `.env*` files are git-ignored — never commit or share your `.env.local`.
- All HackerOne/AI requests happen server-side; the browser only talks to
  this app's own API routes.
- If you ever leak a token, revoke it immediately in HackerOne settings.

## Tech

Next.js (App Router) · React · TypeScript · Tailwind CSS v4.
No database — data comes live from the HackerOne API with short-lived
in-process caching.
