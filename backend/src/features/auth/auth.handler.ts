import type { Database, UserRow } from "../../db/database";
import type { Http } from "../../lib/http";
import type { KwitClient } from "../../kwit/client";
import type { SessionService } from "./session.service";

export class AuthHandler {
	constructor(
		private readonly db: Database,
		private readonly http: Http,
		private readonly sessions: SessionService,
		private readonly kwit: KwitClient,
	) {}

	requireUser(req: Request): UserRow | null {
		const token = this.http.getBearer(req);
		if (!token) return null;
		const userId = this.sessions.resolveUserId(token);
		if (!userId) return null;
		return this.db.getUserById(userId);
	}

	toPublicUser(user: UserRow) {
		return {
			id: user.id,
			email: user.email,
			plan: user.plan,
			kwitCustomerId: user.kwit_customer_id,
			subscriptionId: user.subscription_id,
			hasActiveSubscription: user.plan !== "free",
		};
	}

	async register(req: Request): Promise<Response> {
		const body = (await req.json()) as {
			email?: string;
			password?: string;
			name?: string;
		};
		const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
		const password = typeof body.password === "string" ? body.password : "";
		const name = typeof body.name === "string" ? body.name.trim() : "";

		if (!email.includes("@") || password.length < 8) {
			return this.http.json({ error: "Invalid email or password (min 8 characters)." }, 400, req);
		}
		if (this.db.getUserByEmail(email)) {
			return this.http.json({ error: "Email already registered." }, 409, req);
		}

		const id = crypto.randomUUID();
		const passwordHash = await this.sessions.hashPassword(password);
		const createdAt = new Date().toISOString();
		this.db.createUser(id, email, passwordHash, createdAt);

		let user = this.db.getUserById(id)!;
		const sdk = this.kwit.sdk;
		if (sdk) {
			try {
				const customer = await sdk.customers.create({
					email: user.email,
					externalId: user.id,
					name: name || user.email.split("@")[0],
					currency: "CHF",
				});
				this.db.setKwitCustomerId(user.id, customer.id);
				user = this.db.getUserById(id)!;
			} catch (error) {
				console.error("[register] Kwit customer create failed:", error);
			}
		}

		const token = this.sessions.create(id);
		return this.http.json({ token, user: this.toPublicUser(user) }, 201, req);
	}

	async login(req: Request): Promise<Response> {
		const body = (await req.json()) as { email?: string; password?: string };
		const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
		const password = typeof body.password === "string" ? body.password : "";
		const user = this.db.getUserByEmail(email);
		if (!user || !(await this.sessions.verifyPassword(password, user.password_hash))) {
			return this.http.json({ error: "Invalid email or password." }, 401, req);
		}
		const token = this.sessions.create(user.id);
		return this.http.json({ token, user: this.toPublicUser(user) }, 200, req);
	}

	logout(req: Request): Response {
		const token = this.http.getBearer(req);
		if (token) this.sessions.delete(token);
		return this.http.json({ ok: true }, 200, req);
	}

	me(req: Request): Response {
		const user = this.requireUser(req);
		if (!user) return this.http.json({ error: "Unauthorized." }, 401, req);
		return this.http.json({ user: this.toPublicUser(user) }, 200, req);
	}
}
