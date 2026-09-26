// Cron-worker (elke minuut): bewaakt actieve reizen, stuurt pushmeldingen bij problemen,
// rondt afgelopen reizen af en ruimt verlopen gedeelde reizen op.
// Gebruikt alleen gedeelde modules zonder SvelteKit-imports.

import type { ActieveReisPointer, Leg } from '../../src/lib/types';
import { probleemTitel, vindProblemen } from '../../src/lib/reis';
import { verversAdvies } from '../../src/lib/server/reisstatus';
import { Firestore, Tijdstempel, type FsDocument } from '../../src/lib/server/firestore';
import { leesServiceAccount, type ServiceAccount } from '../../src/lib/server/google';
import { stuurPush } from '../../src/lib/server/fcm';

export interface CronEnv {
	FIREBASE_SERVICE_ACCOUNT?: string;
	NS_API_KEY?: string;
	/** Publieke URL van de app, voor links in meldingen (bijvoorbeeld https://betterov.jouwnaam.workers.dev) */
	APP_URL?: string;
}

/** Workers Free staat 50 uitgaande verzoeken per aanroep toe; we houden marge */
const MAX_VERZOEKEN = 45;
/** Reizen die later dan dit vertrekken nog niet controleren */
const VOORUIT_MS = 90 * 60000;
/** Reizen zoveel na aankomst automatisch afronden */
const AFRONDEN_NA_MS = 30 * 60000;

type Teller = { aantal: number; max: number };

interface Context {
	fs: Firestore;
	sa: ServiceAccount;
	env: CronEnv;
	teller: Teller;
	ritCache: Map<string, Promise<Leg | null>>;
	nu: number;
}

export async function controleer(env: CronEnv, nu = Date.now()): Promise<{ gecontroleerd: number; meldingen: number }> {
	const sa = leesServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
	if (!sa) {
		console.warn('FIREBASE_SERVICE_ACCOUNT ontbreekt of is ongeldig; niets te doen.');
		return { gecontroleerd: 0, meldingen: 0 };
	}
	// Het ophalen van het Google-token telt ook als verzoek
	const teller: Teller = { aantal: 1, max: MAX_VERZOEKEN };
	const fs = new Firestore(sa, teller);
	const ctx: Context = { fs, sa, env, teller, ritCache: new Map(), nu };

	const pointers = await fs.lijst<ActieveReisPointer>('actieveReizen', 100);
	// Elke minuut op een andere plek beginnen, zodat bij een vol budget iedereen aan de beurt komt
	const start = pointers.length ? Math.floor(nu / 60000) % pointers.length : 0;
	const volgorde = [...pointers.slice(start), ...pointers.slice(0, start)];
	let gecontroleerd = 0;
	let meldingen = 0;
	for (const doc of volgorde) {
		if (teller.aantal >= teller.max - 4) break;
		try {
			meldingen += await controleerReis(ctx, doc);
			gecontroleerd++;
		} catch (e) {
			console.error(`Reis ${doc.id}: ${(e as Error).message}`);
		}
	}

	// Verlopen gedeelde reizen (en daarmee de locatie) elke 10 minuten opruimen
	if (Math.floor(nu / 60000) % 10 === 0 && teller.aantal < teller.max - 3) {
		try {
			const verlopen = await fs.zoek('gedeeldeReizen', 'verlooptOp', 'LESS_THAN', new Tijdstempel(new Date(nu).toISOString()), 20);
			for (const d of verlopen) {
				if (teller.aantal >= teller.max) break;
				await fs.verwijder(d.pad);
			}
		} catch (e) {
			console.error(`Opruimen gedeelde reizen: ${(e as Error).message}`);
		}
	}
	return { gecontroleerd, meldingen };
}

async function controleerReis(ctx: Context, doc: FsDocument<ActieveReisPointer>): Promise<number> {
	const { fs, nu } = ctx;
	const p = doc.data;
	if (!p?.uid || !p.reisId || !p.advies?.legs?.length) {
		await fs.verwijder(doc.pad);
		return 0;
	}
	const tijd = new Date(nu).toISOString();
	const einde = Date.parse(p.eindeOp || p.advies.aankomst.verwacht);

	// Afgelopen reis afronden
	if (nu > einde + AFRONDEN_NA_MS) {
		await fs.zet(`users/${p.uid}/reizen/${p.reisId}`, { status: 'afgerond', afgerondOp: tijd }, ['status', 'afgerondOp']);
		await fs.verwijder(doc.pad);
		if (p.gedeeldId) {
			await fs
				.zet(`gedeeldeReizen/${p.gedeeldId}`, { reis: { status: 'afgerond', bijgewerktOp: tijd } }, ['reis.status', 'reis.bijgewerktOp'])
				.catch(() => {});
		}
		return 0;
	}

	// Nog ver weg: later controleren
	if (Date.parse(p.advies.vertrek.verwacht) - nu > VOORUIT_MS) return 0;

	const { advies, gewijzigd } = await verversAdvies(p.advies, {
		nsKey: ctx.env.NS_API_KEY,
		ritCache: ctx.ritCache,
		teller: ctx.teller
	});
	const problemen = vindProblemen(advies, nu);
	const gemeld = new Set(p.gemeld ?? []);
	const nieuw = problemen.filter((x) => !gemeld.has(x.sleutel));
	let verstuurd = 0;

	if (nieuw.length > 0 && ctx.teller.aantal < ctx.teller.max - 2) {
		const tokens = await fs.lijst(`users/${p.uid}/pushTokens`, 10);
		const eerste = nieuw.find((x) => x.ernstig) ?? nieuw[0];
		const titel = nieuw.length > 1 ? `${probleemTitel(eerste)} (+${nieuw.length - 1})` : probleemTitel(eerste);
		const tekst = `${eerste.tekst}${eerste.ernstig ? ' Tik voor alternatieven.' : ''}`;
		for (const t of tokens) {
			if (ctx.teller.aantal >= ctx.teller.max - 1) break;
			ctx.teller.aantal++;
			const r = await stuurPush(ctx.sa, t.id, { titel, tekst, url: '/reis', tag: 'reis' }, ctx.env.APP_URL);
			if (r === 'ok') verstuurd++;
			if (r === 'ongeldig') await fs.verwijder(t.pad).catch(() => {});
		}
		for (const x of nieuw) gemeld.add(x.sleutel);
	}

	if (gewijzigd || nieuw.length > 0) {
		await fs.zet(
			doc.pad,
			{ advies, gemeld: [...gemeld].slice(-50), eindeOp: advies.aankomst.verwacht, laatsteCheck: tijd },
			['advies', 'gemeld', 'eindeOp', 'laatsteCheck']
		);
		await fs.zet(`users/${p.uid}/reizen/${p.reisId}`, { advies, problemen, laatstBijgewerkt: tijd }, ['advies', 'problemen', 'laatstBijgewerkt']);
		if (p.gedeeldId) {
			await fs
				.zet(
					`gedeeldeReizen/${p.gedeeldId}`,
					{ reis: { advies, problemen, bijgewerktOp: tijd } },
					['reis.advies', 'reis.problemen', 'reis.bijgewerktOp']
				)
				.catch(() => {});
		}
	}
	return verstuurd;
}

export default {
	async scheduled(_controller: ScheduledController, env: CronEnv, ctx: ExecutionContext) {
		ctx.waitUntil(
			controleer(env).then((r) => {
				if (r.gecontroleerd || r.meldingen) console.log(`Gecontroleerd: ${r.gecontroleerd}, meldingen: ${r.meldingen}`);
			})
		);
	},
	async fetch(): Promise<Response> {
		return new Response('BetterOV cron-worker draait. Controle gebeurt elke minuut automatisch.', {
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		});
	}
} satisfies ExportedHandler<CronEnv>;
