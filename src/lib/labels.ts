// Labels op reisadviezen: in plaats van anders sorteren zie je in één lijst welke reis de snelste,
// de goedkoopste, die met de minste overstappen of de rustigste is.

import type { Advies } from './types';
import { adviesStatus, drukteScore } from './reis';

export type AdviesLabel = 'snelst' | 'overstappen' | 'goedkoopst' | 'rustigst';

export const LABEL_NAMEN: Record<AdviesLabel, string> = {
	snelst: 'Snelst',
	overstappen: 'Minste overstappen',
	goedkoopst: 'Goedkoopst',
	rustigst: 'Rustigst'
};

/** Waarde per criterium (lager is beter), of undefined als die niet bekend is */
const CRITERIA: { label: AdviesLabel; waarde: (a: Advies) => number | undefined; marge: number }[] = [
	{ label: 'snelst', waarde: (a) => a.duur, marge: 60 },
	{ label: 'overstappen', waarde: (a) => a.overstappen, marge: 0 },
	{ label: 'goedkoopst', waarde: (a) => (a.prijs && a.prijs.bedrag > 0 ? a.prijs.bedrag : undefined), marge: 5 },
	{ label: 'rustigst', waarde: (a) => (a.drukte && a.drukte !== 'onbekend' ? drukteScore(a.drukte) : undefined), marge: 0 }
];

/**
 * Labels per advies-ID. Alleen reizen die nog niet vertrokken zijn en haalbaar zijn tellen mee;
 * een label verschijnt alleen als het iets zegt (niet als alles gelijk is of drie reizen gelijk eindigen).
 */
export function adviesLabels(adviezen: Advies[], nu = Date.now()): Map<string, AdviesLabel[]> {
	const kandidaten = adviezen.filter(
		(a) => Date.parse(a.vertrek.verwacht) >= nu - 60000 && !['uitgevallen', 'onhaalbaar'].includes(adviesStatus(a))
	);
	const uit = new Map<string, AdviesLabel[]>();
	for (const c of CRITERIA) {
		const metWaarde = kandidaten.map((a) => ({ a, w: c.waarde(a) })).filter((x): x is { a: Advies; w: number } => x.w !== undefined);
		if (metWaarde.length < 2) continue;
		const min = Math.min(...metWaarde.map((x) => x.w));
		const max = Math.max(...metWaarde.map((x) => x.w));
		if (max - min <= c.marge) continue;
		const winnaars = metWaarde.filter((x) => x.w - min <= c.marge);
		if (winnaars.length > 2) continue;
		for (const { a } of winnaars) uit.set(a.id, [...(uit.get(a.id) ?? []), c.label]);
	}
	return uit;
}
