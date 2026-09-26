// Minimale Firestore REST-client voor de server en de cron-worker.
// Requests met een service account omzeilen de security rules; controleer toegang dus zelf.

import { ApiFout } from './http';
import { toegangstoken, type ServiceAccount } from './google';

/** Markeert een waarde die als Firestore Timestamp moet worden opgeslagen */
export class Tijdstempel {
	constructor(public iso: string) {}
}

type FsWaarde =
	| { nullValue: null }
	| { booleanValue: boolean }
	| { integerValue: string }
	| { doubleValue: number }
	| { stringValue: string }
	| { timestampValue: string }
	| { arrayValue: { values?: FsWaarde[] } }
	| { mapValue: { fields?: Record<string, FsWaarde> } };

export function naarWaarde(v: unknown): FsWaarde {
	if (v === null || v === undefined) return { nullValue: null };
	if (v instanceof Tijdstempel) return { timestampValue: v.iso };
	if (v instanceof Date) return { timestampValue: v.toISOString() };
	if (typeof v === 'boolean') return { booleanValue: v };
	if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
	if (typeof v === 'string') return { stringValue: v };
	if (Array.isArray(v)) return { arrayValue: { values: v.filter((x) => x !== undefined).map(naarWaarde) } };
	if (typeof v === 'object') return { mapValue: { fields: naarVelden(v as Record<string, unknown>) } };
	return { stringValue: String(v) };
}

export function naarVelden(obj: Record<string, unknown>): Record<string, FsWaarde> {
	const velden: Record<string, FsWaarde> = {};
	for (const [k, v] of Object.entries(obj)) if (v !== undefined) velden[k] = naarWaarde(v);
	return velden;
}

export function vanWaarde(w: FsWaarde): unknown {
	if ('nullValue' in w) return null;
	if ('booleanValue' in w) return w.booleanValue;
	if ('integerValue' in w) return Number(w.integerValue);
	if ('doubleValue' in w) return w.doubleValue;
	if ('stringValue' in w) return w.stringValue;
	if ('timestampValue' in w) return w.timestampValue;
	if ('arrayValue' in w) return (w.arrayValue.values ?? []).map(vanWaarde);
	if ('mapValue' in w) return vanVelden(w.mapValue.fields ?? {});
	return null;
}

export function vanVelden(velden: Record<string, FsWaarde>): Record<string, unknown> {
	const obj: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(velden)) obj[k] = vanWaarde(v);
	return obj;
}

export interface FsDocument<T = Record<string, unknown>> {
	id: string;
	pad: string;
	data: T;
}

export class Firestore {
	constructor(
		private sa: ServiceAccount,
		private teller?: { aantal: number; max: number }
	) {}

	private get basis() {
		return `https://firestore.googleapis.com/v1/projects/${this.sa.project_id}/databases/(default)/documents`;
	}

	private async verzoek<T>(url: string, init: RequestInit = {}): Promise<T | null> {
		if (this.teller) {
			if (this.teller.aantal >= this.teller.max) throw new ApiFout('Subrequest-budget op', 0, 'firestore');
			this.teller.aantal++;
		}
		const token = await toegangstoken(this.sa);
		const r = await fetch(url, {
			...init,
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) }
		});
		if (r.status === 404) return null;
		if (!r.ok) throw new ApiFout(`Firestore HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`, r.status, 'firestore');
		const tekst = await r.text();
		return (tekst ? JSON.parse(tekst) : {}) as T;
	}

	private doc<T>(ruw: { name: string; fields?: Record<string, FsWaarde> }): FsDocument<T> {
		const pad = ruw.name.split('/documents/')[1] ?? ruw.name;
		return { id: pad.split('/').pop()!, pad, data: vanVelden(ruw.fields ?? {}) as T };
	}

	private url(pad: string) {
		return `${this.basis}/${pad.split('/').map(encodeURIComponent).join('/')}`;
	}

	async get<T = Record<string, unknown>>(pad: string): Promise<FsDocument<T> | null> {
		const r = await this.verzoek<{ name: string; fields?: Record<string, FsWaarde> }>(this.url(pad));
		return r ? this.doc<T>(r) : null;
	}

	async lijst<T = Record<string, unknown>>(collectie: string, max = 300): Promise<FsDocument<T>[]> {
		const r = await this.verzoek<{ documents?: { name: string; fields?: Record<string, FsWaarde> }[] }>(
			`${this.url(collectie)}?pageSize=${max}`
		);
		return (r?.documents ?? []).map((d) => this.doc<T>(d));
	}

	/** Maakt of vervangt een document; met velden wordt alleen dat deel bijgewerkt */
	async zet(pad: string, data: Record<string, unknown>, alleenVelden?: string[]): Promise<void> {
		const masker = (alleenVelden ?? []).map((v) => `updateMask.fieldPaths=${encodeURIComponent(v)}`).join('&');
		await this.verzoek(`${this.url(pad)}${masker ? `?${masker}` : ''}`, {
			method: 'PATCH',
			body: JSON.stringify({ fields: naarVelden(data) })
		});
	}

	async verwijder(pad: string): Promise<void> {
		await this.verzoek(this.url(pad), { method: 'DELETE' });
	}

	/** Eenvoudige query op één veld in een collectie */
	async zoek<T = Record<string, unknown>>(
		collectie: string,
		veld: string,
		op: 'LESS_THAN' | 'LESS_THAN_OR_EQUAL' | 'EQUAL' | 'GREATER_THAN',
		waarde: unknown,
		max = 100
	): Promise<FsDocument<T>[]> {
		const r = await this.verzoek<{ document?: { name: string; fields?: Record<string, FsWaarde> } }[]>(
			`${this.basis}:runQuery`,
			{
				method: 'POST',
				body: JSON.stringify({
					structuredQuery: {
						from: [{ collectionId: collectie }],
						where: { fieldFilter: { field: { fieldPath: veld }, op, value: naarWaarde(waarde) } },
						limit: max
					}
				})
			}
		);
		return (r ?? []).filter((x) => x.document).map((x) => this.doc<T>(x.document!));
	}
}
