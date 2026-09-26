// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			gebruiker?: {
				uid: string;
				email: string;
				naam?: string;
				admin: boolean;
				toegestaan: boolean;
				demo: boolean;
			};
		}

		interface Error {
			message: string;
		}
	}
}

export {};
