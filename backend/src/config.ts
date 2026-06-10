class Config {
	readonly port: number;
	readonly publicAppUrl: string;
	readonly kwitApiKey: string;
	readonly kwitWebhookSecret: string;
	readonly productIdBasic: string;
	readonly productIdPro: string;
	readonly sqlitePath: string;

	constructor() {
		this.port = Number.parseInt(process.env.PORT ?? "3001", 10);
		this.publicAppUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:5173";
		this.kwitApiKey = this.env("KWIT_API_KEY", { optional: true });
		this.kwitWebhookSecret = this.env("KWIT_WEBHOOK_SECRET", { optional: true });
		this.productIdBasic = this.env("PRODUCT_ID_BASIC", { optional: true });
		this.productIdPro = this.env("PRODUCT_ID_PRO", { optional: true });
		this.sqlitePath = process.env.SQLITE_PATH ?? "data/example-todos.db";
	}

	private env(name: string, opts: { optional?: boolean } = {}): string {
		const value = process.env[name];
		if (!value && !opts.optional) {
			console.warn(`[config] Missing ${name} — billing features will fail until it is set.`);
		}
		return value ?? "";
	}
}

export const config = new Config();
