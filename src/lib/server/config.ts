// Serverconfiguratie uit omgevingsvariabelen (Cloudflare vars/secrets of .env lokaal).

import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { env as publiek } from '$env/dynamic/public';
import { beheerders } from './auth';
import { leesServiceAccount, type ServiceAccount } from './google';

export interface ServerConfig {
	nsKey?: string;
	serviceAccount?: ServiceAccount;
	projectId?: string;
	beheerders: string[];
	/** Firebase is ingesteld: login verplicht */
	authActief: boolean;
	/** Zonder Firebase: lokaal altijd, online alleen met DEMO_MODUS=1 (anders staat de API open) */
	demoToegestaan: boolean;
	mock: boolean;
}

let cache: ServerConfig | undefined;

export function config(): ServerConfig {
	if (cache) return cache;
	const sa = leesServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
	const projectId = publiek.PUBLIC_FIREBASE_PROJECT_ID || sa?.project_id;
	cache = {
		nsKey: env.NS_API_KEY || undefined,
		serviceAccount: sa,
		projectId,
		beheerders: beheerders(env.ADMIN_EMAILS),
		authActief: !!(projectId && publiek.PUBLIC_FIREBASE_API_KEY),
		demoToegestaan: dev || env.DEMO_MODUS === '1',
		mock: env.MOCK_API === '1'
	};
	return cache;
}
