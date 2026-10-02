// Teksten bij een trein die onderweg splitst (of waarvan een deel achterblijft): waar het gebeurt
// en in welk deel je moet zitten. Gebruikt in Voertuiginfo, de tijdlijn en het blok "Nu".

import type { TreinInfo } from './types';

export interface SplitsTekst {
	/** "Deze trein splitst in Sittard" */
	kop: string;
	/** "Zit in het voorste deel naar Maastricht." */
	jouw: string;
	/** "Het andere deel gaat naar Heerlen." */
	anders: string;
	/** Korte versie voor het blok "Nu": "Splitst in Sittard · zit voorin (naar Maastricht)" */
	kort: string;
}

/** Waar jouw deel zit, vanaf de voorkant geteld; leeg als de rijrichting of jouw deel onbekend is */
function plekVanJouwDeel(info: TreinInfo): 'voorste' | 'achterste' | 'middelste' | '' {
	const s = info.splitsing;
	const richting = info.instapadvies?.rijrichting;
	const n = info.delen.length;
	if (!s || !richting || !s.jouwDelen.length || n < 2) return '';
	// Bij rijrichting rechts staat het laatste deel van de tekening voorop
	const posities = s.jouwDelen.map((i) => (richting === 'rechts' ? n - 1 - i : i));
	if (posities.every((p) => p === 0)) return 'voorste';
	if (posities.every((p) => p === n - 1)) return 'achterste';
	return 'middelste';
}

const KORT_PLEK = { voorste: 'voorin', achterste: 'achterin', middelste: 'in het midden' } as const;

/** Tekst voor een splitsing die vóór je uitstapstation gebeurt; null als je er niets mee hoeft */
export function splitsTekst(info: TreinInfo | null | undefined): SplitsTekst | null {
	const s = info?.splitsing;
	if (!info || !s?.voorUitstappen) return null;
	const jouwNaar = s.jouwBestemming ?? s.bestemmingen.find((b) => s.jouwDelen.includes(b.deel))?.naar;
	const anderen = [
		...new Set([
			...s.bestemmingen.filter((b) => !s.jouwDelen.includes(b.deel)).map((b) => b.naar),
			...(s.andereBestemmingen ?? [])
		])
	].filter((naar) => !jouwNaar || naar.toLowerCase() !== jouwNaar.toLowerCase());
	// Rijdt het andere deel niet verder dan het splitsstation, dan blijft het daar achter
	const blijftStaan = !!s.station && anderen.length > 0 && anderen.every((a) => a.toLowerCase() === s.station!.toLowerCase());
	const plek = plekVanJouwDeel(info);
	const waar = s.station ? ` in ${s.station}` : ' onderweg';

	const kop = blijftStaan ? `Een deel van deze trein stopt${waar}` : `Deze trein splitst${waar}`;
	const jouw = plek
		? `Zit in het ${plek} deel${jouwNaar ? ` naar ${jouwNaar}` : ''}.`
		: jouwNaar
			? `Zit in het deel naar ${jouwNaar}; let op de borden en de omroep.`
			: 'Let op de borden en de omroep in welk deel je moet zitten.';
	const anders = blijftStaan ? 'Het andere deel rijdt niet verder.' : anderen.length ? `Het andere deel gaat naar ${anderen.join(' en ')}.` : '';
	const kortWaar = s.station ? ` in ${s.station}` : '';
	const kort = `${blijftStaan ? `Deel stopt${kortWaar}` : `Splitst${kortWaar}`} · ${
		plek ? `zit ${KORT_PLEK[plek]}${jouwNaar ? ` (naar ${jouwNaar})` : ''}` : jouwNaar ? `zit in het deel naar ${jouwNaar}` : 'let op in welk deel je zit'
	}`;
	return { kop, jouw, anders, kort };
}
