import Kwit from "@kwit/sdk";
import { config } from "../../config";
import type { Database } from "../../db/database";
import type { BillingService } from "../billing/billing.service";

interface SubscriptionCanceledPayload {
	subscriptionId: string;
}

interface SubscriptionCreatedPayload {
	subscriptionId: string;
	customerId: string;
}

export class WebhookHandler {
	constructor(
		private readonly db: Database,
		private readonly billing: BillingService,
	) {}

	private flattenPayload(payload: object): Record<string, string> {
		const out: Record<string, string> = {};
		for (const [key, value] of Object.entries(payload)) {
			if (typeof value === "string") out[key] = value;
			else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
		}
		return out;
	}

	private parseSubscriptionCanceled(raw: Record<string, string>): SubscriptionCanceledPayload | null {
		const subscriptionId = raw.subscriptionId;
		if (!subscriptionId) return null;
		return { subscriptionId };
	}

	private parseSubscriptionCreated(raw: Record<string, string>): SubscriptionCreatedPayload | null {
		const subscriptionId = raw.subscriptionId;
		const customerId = raw.customerId;
		if (!subscriptionId || !customerId) return null;
		return { subscriptionId, customerId };
	}

	async handle(req: Request): Promise<Response> {
		const secret = config.kwitWebhookSecret;
		if (!secret) {
			console.error("[webhook] KWIT_WEBHOOK_SECRET not set");
			return new Response("Webhook not configured", { status: 503 });
		}

		const raw = await req.text();
		const signature = req.headers.get("Kwit-Signature") ?? "";
		const event = req.headers.get("Kwit-Event") ?? "";

		const kwit = new Kwit(config.kwitApiKey || "");
		let verified: ReturnType<typeof kwit.webhooks.verify>;
		try {
			verified = kwit.webhooks.verify(raw, signature, event, secret);
		} catch (error) {
			console.warn("[webhook] verify failed:", error);
			return new Response("Invalid signature", { status: 400 });
		}

		const { payload, type } = verified;
		const flatPayload = this.flattenPayload(payload);

		if (type === "subscription.canceled") {
			const parsed = this.parseSubscriptionCanceled(flatPayload);
			if (parsed) {
				const user = this.db.getUserBySubscriptionId(parsed.subscriptionId);
				if (user) {
					this.db.downgradeUser(user.id);
					console.log(`[webhook] user ${user.id} downgraded after subscription cancel`);
				}
			}
		}

		if (type === "subscription.created") {
			const parsed = this.parseSubscriptionCreated(flatPayload);
			if (parsed) {
				const user = this.db.getUserByKwitCustomerId(parsed.customerId);
				if (user?.last_checkout_session_id) {
					this.billing.syncUserFromSession(user.id, parsed.subscriptionId).catch((error) =>
						console.error("[webhook] sync after subscription.created failed:", error),
					);
				}
			}
		}

		return new Response(JSON.stringify({ received: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}
}
