import { config } from "../../config";
import type { Database, Plan } from "../../db/database";
import type { Http } from "../../lib/http";
import type { KwitClient } from "../../kwit/client";
import type { AuthHandler } from "../auth/auth.handler";
import type { BillingService } from "./billing.service";

export class BillingHandler {
	constructor(
		private readonly db: Database,
		private readonly http: Http,
		private readonly auth: AuthHandler,
		private readonly billing: BillingService,
		private readonly kwit: KwitClient,
	) {}

	async checkout(req: Request): Promise<Response> {
		const user = this.auth.requireUser(req);
		if (!user) return this.http.json({ error: "Unauthorized." }, 401, req);

		if (!this.kwit.sdk) {
			return this.http.json({ error: "Server missing KWIT_API_KEY — cannot start checkout." }, 503, req);
		}

		const body = (await req.json()) as { plan?: string };
		const plan = body.plan === "basic" || body.plan === "pro" ? body.plan : null;
		if (!plan) return this.http.json({ error: 'plan must be "basic" or "pro".' }, 400, req);

		const productId = this.billing.productIdForPlan(plan);
		if (!productId) {
			return this.http.json(
				{
					error: `Set PRODUCT_ID_${plan.toUpperCase()} for the Kwit product id from your dashboard.`,
				},
				503,
				req,
			);
		}

		const customerId = await this.billing.ensureCustomer(user, user.email.split("@")[0] ?? "User");
		const sdk = this.kwit.requireSdk();

		const result = await sdk.checkout.create({
			customerId,
			productId,
			successUrl: `${config.publicAppUrl}/billing/return`,
			cancelUrl: `${config.publicAppUrl}/pricing`,
			metadata: { appUserId: user.id, tier: plan },
		});

		this.db.setLastCheckoutSessionId(user.id, result.sessionId);

		return this.http.json(
			{
				checkoutUrl: result.checkoutUrl,
				sessionId: result.sessionId,
			},
			200,
			req,
		);
	}

	async sync(req: Request): Promise<Response> {
		const user = this.auth.requireUser(req);
		if (!user) return this.http.json({ error: "Unauthorized." }, 401, req);

		if (!this.kwit.sdk) {
			return this.http.json({ error: "KWIT_API_KEY not configured." }, 503, req);
		}

		const sessionId = user.last_checkout_session_id;
		if (!sessionId) {
			return this.http.json({ synced: false, message: "No checkout session to sync." }, 200, req);
		}

		const session = await this.kwit.requireSdk().checkout.sessions.retrieve(sessionId);
		if (session.status !== "COMPLETE" || !session.subscription) {
			return this.http.json({ synced: false, sessionStatus: session.status }, 200, req);
		}

		const plan = this.billing.planFromProductId(session.productId) as Plan;
		this.db.updateUserPlan(user.id, plan, session.subscription.id);

		const updated = this.db.getUserById(user.id)!;
		return this.http.json({ synced: true, user: this.auth.toPublicUser(updated) }, 200, req);
	}

	async portal(req: Request): Promise<Response> {
		const user = this.auth.requireUser(req);
		if (!user) return this.http.json({ error: "Unauthorized." }, 401, req);

		if (!this.kwit.sdk) {
			return this.http.json({ error: "Server missing KWIT_API_KEY — cannot open portal." }, 503, req);
		}

		if (!user.kwit_customer_id) {
			return this.http.json(
				{ error: "No Kwit customer on file yet. Subscribe to a plan first." },
				400,
				req,
			);
		}

		const portal = await this.kwit.requireSdk().portal.sessions.create({
			customerId: user.kwit_customer_id,
			returnUrl: `${config.publicAppUrl}/`,
		});

		return this.http.json(
			{
				url: portal.url,
				expiresAt: portal.expiresAt,
				sessionId: portal.sessionId,
			},
			200,
			req,
		);
	}
}
