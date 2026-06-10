import Kwit from "@kwit/sdk";
import { config } from "../config";

export class KwitClient {
	private readonly client: Kwit | null;

	constructor() {
		this.client = config.kwitApiKey ? new Kwit(config.kwitApiKey) : null;
	}

	get sdk(): Kwit | null {
		return this.client;
	}

	requireSdk(): Kwit {
		if (!this.client) {
			throw new Error("KWIT_API_KEY not configured");
		}
		return this.client;
	}
}
