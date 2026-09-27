// Eerder gereden ritten per treinstel. NS publiceert geen geschiedenis; daarom houden we zelf bij
// welke ritten een treinstel reed, telkens als iemand in de app de treininformatie opvraagt.
// Firestore-collectie `materieel` (alleen de server leest en schrijft).

import type { RitHistorie, TreinInfo } from '../types';
import { nlDatum } from '../tijd';
import type { Firestore } from './firestore';

const MAX_RITTEN = 30;
/** Per isolate onthouden wat al is opgeslagen, zodat herhaald opvragen niet steeds schrijft */
const gelogd = new Set<string>();

export function geldigNummer(n: string): boolean {
	return /^\d{3,6}$/.test(n);
}

/** Legt voor elk treinstel in deze trein vast dat het deze rit reed */
export async function logRit(fs: Pick<Firestore, 'get' | 'zet'>, info: TreinInfo, datumTijd?: string): Promise<void> {
	const datum = nlDatum(datumTijd ? new Date(datumTijd) : new Date());
	const rit: RitHistorie = { datum, ritnummer: info.ritnummer, van: info.ritVan, naar: info.ritNaar, vertrek: datumTijd };
	for (const deel of info.delen) {
		const nummer = deel.nummer;
		if (!nummer || !geldigNummer(nummer)) continue;
		const sleutel = `${nummer}|${info.ritnummer}|${datum}`;
		if (gelogd.has(sleutel)) continue;
		gelogd.add(sleutel);
		if (gelogd.size > 2000) gelogd.clear();
		const doc = await fs.get<{ ritten?: RitHistorie[] }>(`materieel/${nummer}`);
		const ritten = (doc?.data.ritten ?? []).filter((r) => !(r.ritnummer === rit.ritnummer && r.datum === rit.datum));
		await fs.zet(`materieel/${nummer}`, {
			type: deel.type ?? null,
			bijgewerktOp: new Date().toISOString(),
			ritten: [rit, ...ritten].slice(0, MAX_RITTEN)
		});
	}
}

export async function ritHistorie(fs: Pick<Firestore, 'get'>, nummers: string[]): Promise<Record<string, RitHistorie[]>> {
	const uit: Record<string, RitHistorie[]> = {};
	await Promise.all(
		nummers.filter(geldigNummer).slice(0, 4).map(async (n) => {
			const doc = await fs.get<{ ritten?: RitHistorie[] }>(`materieel/${n}`);
			uit[n] = doc?.data.ritten ?? [];
		})
	);
	return uit;
}
