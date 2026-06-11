# ChowCall Backend Environment Guide

Use this guide to fill `ChowCall-Backend/.env` from `.env.example`.

## App

- `NODE_ENV`: Use `development`, `test`, or `production`.
- `PORT`: Local API port. Default: `4000`.
- `API_BASE_URL`: Public backend URL, for example `http://localhost:4000` locally or your deployed API URL.
- `BACKEND_BASE_URL`: Canonical backend URL used for provider callbacks and generated webhook references.
- `APP_NAME`: Display name for logs and Swagger.
- `FRONTEND_BASE_URL`: Next.js frontend URL. Local default: `http://localhost:3000`.
- `BRAND_LOGO_URL`: Public HTTPS URL for `chowcall-logo.svg`. In production, upload the frontend/public logo or serve it from your domain/CDN.

## CORS

- `CORS_ORIGINS`: Comma-separated allowed frontend origins, for example `http://localhost:3000,https://app.chowcall.ng`.
- `CORS_CREDENTIALS`: Use `true` when frontend sends cookies or auth credentials.
- `CORS_METHODS`: Usually `GET,POST,PUT,PATCH,DELETE,OPTIONS`.

## MongoDB Atlas

1. Create a MongoDB Atlas account.
2. Create a project and cluster.
3. Create a database user with a strong password.
4. Add your IP address or deployment network to Network Access.
5. Copy the driver connection string.
6. Set:
   - `MONGODB_URI`
   - `MONGODB_DB_NAME`

Use a database name like `ChowCall` for production and `ChowCallDev` locally.

## Redis

Use Redis Cloud, Upstash, Render Redis, Railway Redis, or a self-hosted Redis instance.

- `REDIS_URL`: Provider connection string.
- `REDIS_PREFIX`: Prefix for all ChowCall keys, for example `ChowCall`.

Redis is used for rate limiting, live call state, payment pending state, distance cache, queues, and locks.

## JWT

Generate long random strings:

```bash
openssl rand -hex 64
```

Set:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_TTL`, default `15m`
- `JWT_REFRESH_TTL`, default `30d`

Use different secrets for development, staging, and production.

## Swagger

- `SWAGGER_ENABLED=true` locally and staging.
- `SWAGGER_PATH=/docs`.

For production, keep Swagger enabled only if protected by network access or admin auth.

## Paystack

1. Create or log into Paystack.
2. Go to Developers > API Keys.
3. Copy public and secret keys.
4. Configure webhook URL:

```text
https://your-api-domain.com/v1/payments/webhooks/paystack
```

Set:

- `PAYMENT_PROVIDER=paystack`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PUBLIC_KEY`
- `PAYSTACK_WEBHOOK_SECRET`

Use test keys locally.

## Flutterwave

Flutterwave is scaffolded as a secondary provider.

1. Log into Flutterwave.
2. Go to Settings > API.
3. Copy keys and webhook secret.

Set:

- `FLUTTERWAVE_SECRET_KEY`
- `FLUTTERWAVE_PUBLIC_KEY`
- `FLUTTERWAVE_WEBHOOK_SECRET`

Leave blank until Flutterwave is enabled.

## Maps

Required v1 provider: Mapbox.

For Mapbox:

1. Create or log into a Mapbox account.
2. Go to Account > Access tokens.
3. Create an access token that can call Geocoding and Directions APIs.
4. Set `MAPS_PROVIDER=mapbox`.
5. Set `MAPBOX_ACCESS_TOKEN`.

ChowCall uses Mapbox for address geocoding and driving-distance calculation. Google Maps links may still be generated for human-readable map links, but Google is not used as an API provider.

## AI / Speech

For OpenAI:

- Create an OpenAI API key.
- Set `OPENAI_API_KEY`.

For Azure OpenAI:

- Create Azure OpenAI resource.
- Set `AZURE_OPENAI_ENDPOINT`.
- Set `AZURE_OPENAI_API_KEY`.
- Set `AZURE_OPENAI_DEPLOYMENT_NAME` to your deployed model name.
- Set `AZURE_OPENAI_MODEL_NAME` to the model family, for example `gpt-4.1-mini`.
- Set `AZURE_OPENAI_API_VERSION`, for example `2024-04-01-preview`.

For Azure AI Speech:

- Create Speech resource in Azure.
- Set `AZURE_SPEECH_KEY`.
- Set `AZURE_SPEECH_REGION`.

## Messaging

SMS provider default: Twilio.

1. Create a Twilio account.
2. Copy your Account SID and Auth Token.
3. Buy or verify a Twilio phone number for SMS.
4. Set:
   - `SMS_PROVIDER=twilio`
   - `TWILIO_ACCOUNT_SID=your_twilio_account_sid`
   - `TWILIO_AUTH_TOKEN=your_twilio_auth_token`
   - `TWILIO_FROM_NUMBER=+10000000000`
   - `TWILIO_VOICE_WEBHOOK_URL=https://your-api-domain.com/v1/voice/incoming`
   - `TWILIO_STATUS_CALLBACK_URL=https://your-api-domain.com/v1/voice/status`
   - `VOICE_MODE=gather`

Voice ordering starts in Twilio gather mode. Set `TWILIO_MEDIA_STREAM_URL` and `VOICE_MODE=media_stream` only when realtime media streaming is configured; otherwise ChowCall falls back to gather mode.

For trial Twilio accounts, the recipient number must usually be verified in Twilio before test messages can be delivered.

WhatsApp provider default: disabled.

1. Keep `WHATSAPP_PROVIDER=disabled` while WhatsApp is not active.
2. When a paid WhatsApp provider is ready, set `WHATSAPP_PROVIDER=brevo` or add the new provider implementation behind the existing messaging interface.
3. Keep `BREVO_API_KEY` configured for email today; it can also support Brevo WhatsApp later if enabled on the account.

## Email via Brevo

ChowCall uses Brevo for transactional email. Resend is intentionally not used.

1. Create a Brevo account.
2. Go to SMTP & API > API Keys.
3. Create an API key.
4. Set `BREVO_API_KEY`.
5. Go to Senders & IP.
6. Add and verify your sender email/domain.
7. Set:
   - `EMAIL_PROVIDER=brevo`
   - `EMAIL_FROM=ChowCall <hello@chowcall.ng>`
   - `EMAIL_REPLY_TO=support@chowcall.ng`

Production email deliverability checklist:

- Verify sending domain.
- Add SPF, DKIM, and DMARC DNS records from Brevo.
- Use a real monitored reply-to address.
- Keep `BRAND_LOGO_URL` on a public HTTPS domain.

## Security

Generate `ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
```

Set rate limits:

- `RATE_LIMIT_WINDOW_MS=60000`
- `RATE_LIMIT_MAX=120`

Tighten limits in production if abused.

## Jobs

- `QUEUE_CONCURRENCY`: Number of concurrent background jobs per worker.
- `PAYMENT_EXPIRY_MINUTES`: Default payment link expiry, PRD default is `15`.

## Local Setup Checklist

1. Copy `.env.example` to `.env`.
2. Fill MongoDB and Redis.
3. Generate JWT and encryption secrets.
4. Add Brevo key and sender.
5. Keep Paystack keys empty until payment testing.
6. Start the API:

```bash
pnpm dev
```

7. Open Swagger:

```text
http://localhost:4000/docs
```
