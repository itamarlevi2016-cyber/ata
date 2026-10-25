import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { authorize, contactEmail, handleAuth, joinPage, loginPage, needsSetup, registerPage, setupPage, signInRedirect } from "../server/auth.mjs";
import { handleAccess } from "../server/access.mjs";
import { ensureMigrated } from "../server/migrate.mjs";

type Env = Cloudflare.Env & {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  KESHER_CONTACT_EMAIL?: string;
  KESHER_LOCAL_USER?: string;
};

// Assets that may be served before sign-in: the login and invitation pages need them.
const PUBLIC_ASSET = /^\/(style\.css|brand-mark\.svg|favicon\.ico|fonts\/[^/]+)$/;
// Everything else under the public folder is an application asset (scripts, résumé files).
const APP_ROUTE = /^\/(api\/.*)?$/;

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const url = new URL(request.url);
    const path = url.pathname;

    const serveAsset = () => (env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 }));
    if (PUBLIC_ASSET.test(path)) return serveAsset();

    const db = env.DB?.withSession ? env.DB.withSession("first-primary") : env.DB;
    // Create or upgrade the database tables on first use, so a plain `wrangler deploy` is enough.
    try { await ensureMigrated(db); } catch (error) {
      console.error("Database migration failed:", error instanceof Error ? error.message : "unknown");
      return new Response("מסד הנתונים אינו זמין כרגע. נסי שוב בעוד רגע.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    // Sign-in, invitation and sign-out are handled here, before any protected content.
    // First run: until the first admin exists, the site offers a setup page instead of a login.
    if (path === "/login" || path === "/setup") {
      const fresh = await needsSetup(db);
      if (path === "/setup") return fresh ? setupPage() : new Response(null, { status: 302, headers: { Location: "/login" } });
      if (fresh) return new Response(null, { status: 302, headers: { Location: "/setup", "Cache-Control": "no-store" } });
      return loginPage(request, await contactEmail(env, db));
    }
    if (path === "/join") return joinPage(request, db);
    if (path === "/register") return registerPage();
    if (path === "/logout" || path.startsWith("/api/auth/")) return handleAuth(request, env, db, path);

    // Every other request — the page, the API and every file (résumés included) — requires a signed-in member.
    const auth = await authorize(request, env, db);
    if (path === "/api/access") return handleAccess(request, db, auth, await contactEmail(env, db));
    if (auth.status !== "ok") {
      if (path.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "יש להתחבר כדי לגשת למאגר" }), {
          status: 401,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return signInRedirect(request);
    }

    if (!APP_ROUTE.test(path)) {
      const response = await serveAsset();
      // Résumé files and data must never be cached by shared caches.
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("X-Robots-Tag", "noindex, nofollow");
      return new Response(response.body, { status: response.status, headers });
    }

    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};

export default worker;
