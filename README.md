# ChowCall Backend

Express + TypeScript backend for ChowCall v1.

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Health:

```text
GET http://localhost:4000/health
GET http://localhost:4000/v1/health
```

Swagger:

```text
http://localhost:4000/docs
http://localhost:4000/docs/openapi.json
```

## Architecture

- `src/config` contains env validation, CORS, database, Redis, Swagger, and logger setup.
- `src/shared` contains errors, middleware, validation, security, common types, and utilities.
- `src/providers` contains external provider interfaces and concrete provider implementations.
- `src/jobs` contains queue and worker registration scaffolds.
- `src/v1` contains all versioned ChowCall domain modules.

The backend is tenant-scoped by default. Protected tenant endpoints should enforce JWT auth, RBAC, and tenant membership before querying data.

## Providers

Provider interfaces are wired for Paystack, Mapbox, Azure OpenAI, Twilio SMS, Brevo email, and voice integrations. Configure real provider keys in `.env` before exercising external payment, map, SMS, email, or AI flows.
