import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database as SqliteDatabase } from "bun:sqlite";
import { config } from "../config";

export type Plan = "free" | "basic" | "pro";

export interface UserRow {
	id: string;
	email: string;
	password_hash: string;
	kwit_customer_id: string | null;
	plan: Plan;
	subscription_id: string | null;
	last_checkout_session_id: string | null;
	created_at: string;
}

export interface TodoRow {
	id: string;
	user_id: string;
	title: string;
	notes: string | null;
	done: number;
	created_at: string;
}

export class Database {
	private readonly db: SqliteDatabase;

	constructor() {
		const dbDir = dirname(config.sqlitePath);
		if (!existsSync(dbDir)) {
			mkdirSync(dbDir, { recursive: true });
		}

		this.db = new SqliteDatabase(config.sqlitePath, { create: true });
		this.db.run("PRAGMA foreign_keys = ON");
		this.initSchema();
	}

	private initSchema(): void {
		this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        kwit_customer_id TEXT UNIQUE,
        plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'basic', 'pro')),
        subscription_id TEXT,
        last_checkout_session_id TEXT,
        created_at TEXT NOT NULL
      );
    `);

		this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
    `);

		this.db.run(`
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        notes TEXT,
        done INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);

		const todoColumns = this.db.query("SELECT name FROM pragma_table_info('todos')").all() as {
			name: string;
		}[];
		if (!todoColumns.some((column) => column.name === "notes")) {
			this.db.run("ALTER TABLE todos ADD COLUMN notes TEXT");
		}
	}

	getUserById(id: string): UserRow | null {
		const row = this.db.query("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
		return row ?? null;
	}

	getUserByEmail(email: string): UserRow | null {
		const row = this.db.query("SELECT * FROM users WHERE email = ?").get(email) as
			| UserRow
			| undefined;
		return row ?? null;
	}

	getUserByKwitCustomerId(customerId: string): UserRow | null {
		const row = this.db.query("SELECT * FROM users WHERE kwit_customer_id = ?").get(customerId) as
			| UserRow
			| undefined;
		return row ?? null;
	}

	getUserBySubscriptionId(subscriptionId: string): UserRow | null {
		const row = this.db.query("SELECT * FROM users WHERE subscription_id = ?").get(subscriptionId) as
			| UserRow
			| undefined;
		return row ?? null;
	}

	createUser(id: string, email: string, passwordHash: string, createdAt: string): void {
		this.db.run(
			`INSERT INTO users (id, email, password_hash, kwit_customer_id, plan, subscription_id, last_checkout_session_id, created_at)
       VALUES (?, ?, ?, NULL, 'free', NULL, NULL, ?)`,
			[id, email, passwordHash, createdAt],
		);
	}

	setKwitCustomerId(userId: string, customerId: string): void {
		this.db.run("UPDATE users SET kwit_customer_id = ? WHERE id = ?", [customerId, userId]);
	}

	updateUserPlan(userId: string, plan: Plan, subscriptionId: string | null): void {
		this.db.run("UPDATE users SET plan = ?, subscription_id = ? WHERE id = ?", [
			plan,
			subscriptionId,
			userId,
		]);
	}

	downgradeUser(userId: string): void {
		this.db.run("UPDATE users SET plan = 'free', subscription_id = NULL WHERE id = ?", [userId]);
	}

	setLastCheckoutSessionId(userId: string, sessionId: string): void {
		this.db.run("UPDATE users SET last_checkout_session_id = ? WHERE id = ?", [sessionId, userId]);
	}

	createSession(token: string, userId: string, expiresAt: number): void {
		this.db.run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [
			token,
			userId,
			expiresAt,
		]);
	}

	deleteSession(token: string): void {
		this.db.run("DELETE FROM sessions WHERE token = ?", [token]);
	}

	getSessionUserId(token: string): string | null {
		const now = Math.floor(Date.now() / 1000);
		const row = this.db
			.query("SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?")
			.get(token, now) as { user_id: string } | undefined;
		return row?.user_id ?? null;
	}

	pruneExpiredSessions(): void {
		const now = Math.floor(Date.now() / 1000);
		this.db.run("DELETE FROM sessions WHERE expires_at <= ?", [now]);
	}

	listTodos(userId: string): TodoRow[] {
		return this.db
			.query("SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC")
			.all(userId) as TodoRow[];
	}

	countTodos(userId: string): number {
		const row = this.db.query("SELECT COUNT(*) as c FROM todos WHERE user_id = ?").get(userId) as
			| { c: number }
			| undefined;
		return row?.c ?? 0;
	}

	todoLimitForPlan(plan: Plan): number {
		switch (plan) {
			case "free":
				return 5;
			case "basic":
				return 50;
			case "pro":
				return 10_000;
		}
	}

	getTodo(id: string, userId: string): TodoRow | null {
		const row = this.db.query("SELECT * FROM todos WHERE id = ? AND user_id = ?").get(id, userId) as
			| TodoRow
			| undefined;
		return row ?? null;
	}

	createTodo(id: string, userId: string, title: string, notes: string | null, createdAt: string): void {
		this.db.run(
			"INSERT INTO todos (id, user_id, title, notes, done, created_at) VALUES (?, ?, ?, ?, 0, ?)",
			[id, userId, title, notes, createdAt],
		);
	}

	updateTodo(id: string, title: string, done: number, notes: string | null): void {
		this.db.run("UPDATE todos SET title = ?, done = ?, notes = ? WHERE id = ?", [
			title,
			done,
			notes,
			id,
		]);
	}

	deleteTodo(id: string, userId: string): number {
		const result = this.db.run("DELETE FROM todos WHERE id = ? AND user_id = ?", [id, userId]);
		return result.changes;
	}
}
