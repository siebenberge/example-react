import { config } from "./config";
import { Database } from "./db/database";
import { AuthHandler } from "./features/auth/auth.handler";
import { SessionService } from "./features/auth/session.service";
import { BillingHandler } from "./features/billing/billing.handler";
import { BillingService } from "./features/billing/billing.service";
import { TodosHandler } from "./features/todos/todos.handler";
import { WebhookHandler } from "./features/webhooks/webhook.handler";
import { KwitClient } from "./kwit/client";
import { Http } from "./lib/http";

export class App {
	private readonly http = new Http();
	private readonly db = new Database();
	private readonly kwit = new KwitClient();
	private readonly sessions = new SessionService(this.db);
	private readonly billingService = new BillingService(this.db, this.kwit);
	private readonly auth = new AuthHandler(this.db, this.http, this.sessions, this.kwit);
	private readonly todos = new TodosHandler(this.db, this.http, this.auth);
	private readonly billing = new BillingHandler(this.db, this.http, this.auth, this.billingService, this.kwit);
	private readonly webhooks = new WebhookHandler(this.db, this.billingService);

	async fetch(req: Request): Promise<Response> {
		this.sessions.pruneExpired();

		if (req.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: this.http.corsHeaders(req) });
		}

		const path = new URL(req.url).pathname;

		try {
			if (path === "/api/auth/register" && req.method === "POST") {
				return this.auth.register(req);
			}
			if (path === "/api/auth/login" && req.method === "POST") {
				return this.auth.login(req);
			}
			if (path === "/api/auth/logout" && req.method === "POST") {
				return this.auth.logout(req);
			}
			if (path === "/api/me" && req.method === "GET") {
				return this.auth.me(req);
			}
			if (path === "/api/todos" && req.method === "GET") {
				return this.todos.list(req);
			}
			if (path === "/api/todos" && req.method === "POST") {
				return this.todos.create(req);
			}
			if (path.startsWith("/api/todos/") && req.method === "PATCH") {
				return this.todos.patch(req, path.slice("/api/todos/".length));
			}
			if (path.startsWith("/api/todos/") && req.method === "DELETE") {
				return this.todos.delete(req, path.slice("/api/todos/".length));
			}
			if (path === "/api/billing/checkout" && req.method === "POST") {
				return this.billing.checkout(req);
			}
			if (path === "/api/billing/sync" && req.method === "POST") {
				return this.billing.sync(req);
			}
			if (path === "/api/billing/portal" && req.method === "POST") {
				return this.billing.portal(req);
			}
			if (path === "/api/webhooks/kwit" && req.method === "POST") {
				return this.webhooks.handle(req);
			}
		} catch (error) {
			console.error("[api]", error);
			const message = error instanceof Error ? error.message : "Server error";
			return this.http.json({ error: message }, 500, req);
		}

		return this.http.json({ error: "Not found." }, 404, req);
	}

	start() {
		const server = Bun.serve({
			port: config.port,
			fetch: (req) => this.fetch(req),
		});
		console.log(`Example API running at ${server.url} (webhooks: POST /api/webhooks/kwit)`);
		return server;
	}
}
