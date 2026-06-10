import type { Database } from "../../db/database";

const SESSION_DAYS = 14;

export class SessionService {
	constructor(private readonly db: Database) {}

	async hashPassword(password: string): Promise<string> {
		return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
	}

	async verifyPassword(password: string, hash: string): Promise<boolean> {
		return Bun.password.verify(password, hash);
	}

	create(userId: string): string {
		const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
		const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400;
		this.db.createSession(token, userId, expiresAt);
		return token;
	}

	delete(token: string): void {
		this.db.deleteSession(token);
	}

	resolveUserId(token: string): string | null {
		return this.db.getSessionUserId(token);
	}

	pruneExpired(): void {
		this.db.pruneExpiredSessions();
	}
}
