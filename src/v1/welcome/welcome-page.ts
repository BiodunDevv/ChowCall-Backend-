import { env } from "../../config/env.js";
import { escapeHtml } from "../../shared/utils/html.js";

export function renderWelcomePage() {
  const appName = escapeHtml(env.APP_NAME);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Welcome to ChowCall</title>
    <meta name="description" content="ChowCall API for AI restaurant ordering, payments, and kitchen tickets.">
    <style>
      :root {
        color-scheme: light;
        --background: #f7f1e8;
        --card: #fffaf2;
        --text: #221817;
        --muted: #6f6258;
        --border: #ded1c1;
        --primary: #006BFF;
        --accent: #0AE8F0;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--background);
        color: var(--text);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px 16px;
      }
      .shell {
        width: min(100%, 720px);
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 18px;
      }
      .brand img {
        width: 44px;
        height: 44px;
        display: block;
      }
      .brand span {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.03em;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: clamp(24px, 5vw, 44px);
      }
      h1 {
        margin: 0;
        max-width: 620px;
        font-size: clamp(34px, 7vw, 64px);
        line-height: 0.98;
        letter-spacing: -0.055em;
      }
      p {
        margin: 18px 0 0;
        max-width: 560px;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.7;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 28px;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        padding: 0 14px;
        border-radius: 10px;
        border: 1px solid var(--border);
        color: var(--text);
        font-size: 14px;
        font-weight: 700;
        text-decoration: none;
      }
      a.primary {
        border-color: var(--primary);
        background: var(--primary);
        color: white;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 16px;
      }
      .meta div {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
        color: var(--muted);
        font-size: 13px;
      }
      .meta strong {
        display: block;
        margin-bottom: 4px;
        color: var(--text);
        font-size: 14px;
      }
      @media (max-width: 640px) {
        .meta { grid-template-columns: 1fr; }
        .actions a { width: 100%; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="shell" aria-label="ChowCall API welcome">
        <div class="brand">
          <img src="/assets/brand/chowcall-logo.svg" alt="ChowCall logo">
          <span>ChowCall</span>
        </div>
        <div class="card">
          <h1>Welcome to ChowCall.</h1>
          <p>${appName} is running. This backend powers AI voice ordering, distance-based delivery fees, service fees, payments, kitchen tickets, and tenant operations for restaurants.</p>
          <div class="actions" aria-label="API links">
            <a class="primary" href="${escapeHtml(env.SWAGGER_PATH)}">Open API docs</a>
            <a href="/health">Health</a>
            <a href="/v1/health">v1 Health</a>
          </div>
          <div class="meta">
            <div><strong>Version</strong>v1 REST API</div>
            <div><strong>Status</strong>Ready for integration</div>
            <div><strong>Docs</strong>${escapeHtml(env.SWAGGER_PATH)}</div>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
