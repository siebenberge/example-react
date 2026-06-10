import { config } from "../config";

export class Http {
	corsHeaders(req: Request): HeadersInit {
		const origin = req.headers.get("Origin") ?? config.publicAppUrl;
		return {
			"Access-Control-Allow-Origin": origin,
			"Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization",
			"Access-Control-Allow-Credentials": "true",
		};
	}

	json(data: object, status = 200, req?: Request): Response {
		const headers: HeadersInit = {
			"Content-Type": "application/json",
			...(req ? this.corsHeaders(req) : {}),
		};
		return new Response(JSON.stringify(data), { status, headers });
	}

	getBearer(req: Request): string | null {
		const header = req.headers.get("Authorization");
		if (!header?.startsWith("Bearer ")) return null;
		return header.slice(7).trim() || null;
	}
}
