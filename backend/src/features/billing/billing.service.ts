import type { Plan, UserRow } from "../../db/database";
import { config } from "../../config";
import type { Database } from "../../db/database";
import type { KwitClient } from "../../kwit/client";

export class BillingService {
	constructor(
		private readonly db: Database,
		private readonly kwit: KwitClient,
	) {}

	productIdForPlan(plan: Exclude<Plan, "free">): string | null {
		if (plan === "basic") return config.productIdBasic || null;
		return config.productIdPro || null;
	}

	planFromProductId(productId: string): Plan {
		if (config.productIdBasic && productId === config.productIdBasic) return "basic";
		if (config.productIdPro && productId === config.productIdPro) return "pro";
		return "free";
	}

	async ensureCustomer(user: UserRow, displayName: string): Promise<string> {
		if (user.kwit_customer_id) return user.kwit_customer_id;

		const sdk = this.kwit.requireSdk();
		const created = await sdk.customers.create({
			email: user.email,
			externalId: user.id,
			name: displayName || user.email.split("@")[0],
			currency: "CHF",
		});
		this.db.setKwitCustomerId(user.id, created.id);
		return created.id;
	}

	async syncUserFromSession(userId: string, subscriptionId: string): Promise<void> {
		const sdk = this.kwit.sdk;
		if (!sdk) return;

		const user = this.db.getUserById(userId);
		if (!user?.last_checkout_session_id) return;

		const session = await sdk.checkout.sessions.retrieve(user.last_checkout_session_id);
		if (session.status !== "COMPLETE" || !session.subscription) return;

		const plan = this.planFromProductId(session.productId);
		this.db.updateUserPlan(userId, plan, subscriptionId);
	}
}
