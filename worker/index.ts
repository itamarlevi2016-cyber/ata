import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { AUTH_PATHS, accessPage, adminEmails, authorize, signInRedirect } from "../server/auth.mjs";
import { handleAccess } from "../server/access.mjs";

type Env = Cloudflare.Env & {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  KESHER_ALLOWED_EMAILS?: string;
  KESHER_LOCAL_USER?: string;
};

// Assets that may be served before sign-in: the sign-in/access pages need them.
const PUBLIC_ASSET = /^\/(style\.css|brand-mark\.svg|favicon\.ico|fonts\/[^/]+)$/;
// Everything else under the public folder is an application asset (scripts, résumé files).
const APP_ROUTE = /^\/(api\/.*)?$/;

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Sign-in/sign-out are handled by the hosting platform in front of this worker.
    if (AUTH_PATHS.has(path)) return new Response("Not found", { status: 404 });

    const serveAsset = () => (env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 }));
    if (PUBLIC_ASSET.test(path)) return serveAsset();

    // Every other request — the page, the API and every file (résumés included) — requires an approved member.
    const db = env.DB?.withSession ? env.DB.withSession("first-primary") : env.DB;
    const auth = await authorize(request, env, db);
    if (path === "/api/access") return handleAccess(request, db, auth, adminEmails(env));
    if (auth.status !== "ok") {
      if (path.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: auth.status === "anonymous" ? "יש להתחבר כדי לגשת למאגר" : "הכניסה למאגר פתוחה לחברות מאושרות בלבד" }), {
          status: auth.status === "anonymous" ? 401 : 403,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return auth.status === "anonymous" ? signInRedirect(request) : accessPage(auth);
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
