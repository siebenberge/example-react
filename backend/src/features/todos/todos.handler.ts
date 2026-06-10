import type { Database } from "../../db/database";
import type { Http } from "../../lib/http";
import type { AuthHandler } from "../auth/auth.handler";

export class TodosHandler {
	constructor(
		private readonly db: Database,
		private readonly http: Http,
		private readonly auth: AuthHandler,
	) {}

	list(req: Request): Response {
		const user = this.auth.requireUser(req);
		if (!user) return this.http.json({ error: "Unauthorized." }, 401, req);
		return this.http.json({ todos: this.db.listTodos(user.id) }, 200, req);
	}

	async create(req: Request): Promise<Response> {
		const user = this.auth.requireUser(req);
		if (!user) return this.http.json({ error: "Unauthorized." }, 401, req);

		const limit = this.db.todoLimitForPlan(user.plan);
		if (this.db.countTodos(user.id) >= limit) {
			return this.http.json(
				{
					error: `Todo limit reached for ${user.plan} plan (${limit}). Upgrade on the pricing page.`,
				},
				403,
				req,
			);
		}

		const body = (await req.json()) as { title?: string; notes?: string };
		const title = typeof body.title === "string" ? body.title.trim() : "";
		if (!title) return this.http.json({ error: "Title required." }, 400, req);

		const notes =
			user.plan === "pro" && typeof body.notes === "string" ? body.notes.trim() || null : null;

		const id = crypto.randomUUID();
		const createdAt = new Date().toISOString();
		this.db.createTodo(id, user.id, title, notes, createdAt);
		const todo = this.db.getTodo(id, user.id)!;
		return this.http.json({ todo }, 201, req);
	}

	async patch(req: Request, id: string): Promise<Response> {
		const user = this.auth.requireUser(req);
		if (!user) return this.http.json({ error: "Unauthorized." }, 401, req);

		const row = this.db.getTodo(id, user.id);
		if (!row) return this.http.json({ error: "Not found." }, 404, req);

		const body = (await req.json()) as { title?: string; done?: boolean; notes?: string };
		const title = typeof body.title === "string" ? body.title.trim() : row.title;
		const done = typeof body.done === "boolean" ? (body.done ? 1 : 0) : row.done;
		let notes = row.notes;
		if (user.plan === "pro" && typeof body.notes === "string") {
			notes = body.notes.trim() || null;
		}

		this.db.updateTodo(id, title, done, notes);
		const todo = this.db.getTodo(id, user.id)!;
		return this.http.json({ todo }, 200, req);
	}

	delete(req: Request, id: string): Response {
		const user = this.auth.requireUser(req);
		if (!user) return this.http.json({ error: "Unauthorized." }, 401, req);

		const changes = this.db.deleteTodo(id, user.id);
		if (changes === 0) return this.http.json({ error: "Not found." }, 404, req);
		return this.http.json({ ok: true }, 200, req);
	}
}
