import { describe, expect, it } from 'vitest';
import { maakAdvies, ovLeg, loopLeg } from './testdata';
import {
	aantalAfwijkend,
	motisModi,
	optiesNaarParams,
	optiesTekst,
	optiesUitParams,
	pastBij,
	STANDAARD_REISOPTIES,
	vereistReservering,
	type Reisopties
} from './reisopties';

const opties = (o: Partial<Reisopties>): Reisopties => ({ ...STANDAARD_REISOPTIES, ...o });

describe('reisopties', () => {
	it('gaan heen en weer via de URL', () => {
		const o = opties({ extraOverstaptijd: 10, vervoer: ['trein', 'metro'], zonderReservering: true });
		const p = new URLSearchParams();
		optiesNaarParams(o, p);
		expect(p.toString()).toBe('extraOverstap=10&vervoer=trein%2Cmetro&zonderReservering=1');
		expect(optiesUitParams(p)).toEqual({ ...o, toegankelijk: false });
		// Standaard levert geen parameters op
		const leeg = new URLSearchParams();
		optiesNaarParams(STANDAARD_REISOPTIES, leeg);
		expect(leeg.toString()).toBe('');
		expect(optiesUitParams(new URLSearchParams('vervoer=onzin&extraOverstap=999'))).toEqual({ ...STANDAARD_REISOPTIES, extraOverstaptijd: 60 });
	});

	it('vertaalt vervoermiddelen naar MOTIS', () => {
		expect(motisModi(STANDAARD_REISOPTIES)).toBeUndefined();
		expect(motisModi(opties({ vervoer: ['metro', 'veer'] }))).toEqual(['SUBWAY', 'FERRY']);
		expect(motisModi(opties({ vervoer: ['trein'] }))).toContain('REGIONAL_RAIL');
	});

	it('omschrijft en telt afwijkende opties', () => {
		const o = opties({ extraOverstaptijd: 5, vervoer: ['trein', 'tram', 'metro', 'veer'] });
		expect(aantalAfwijkend(o)).toBe(2);
		expect(optiesTekst(o)).toBe('+5 min overstap · zonder bus');
		expect(optiesTekst(STANDAARD_REISOPTIES)).toBe('');
	});

	it('filtert adviezen op vervoer, reservering en overstaptijd', () => {
		const trein = maakAdvies([ovLeg('A', 'B', '10:00', '10:30')]);
		const bus = maakAdvies([ovLeg('A', 'B', '10:00', '10:30', { modus: 'bus', isNS: false })]);
		const eurostar = maakAdvies([ovLeg('A', 'B', '10:00', '10:30', { productNaam: 'Eurostar', lijn: 'EST', isNS: false })]);
		// 6 min overstap, waarvan 2 lopen: 4 min over
		const overstap = maakAdvies([ovLeg('A', 'C', '10:00', '10:10'), loopLeg('C', 'C2', '10:10', 2), ovLeg('C', 'B', '10:16', '10:40')]);
		expect(pastBij(bus, opties({ vervoer: ['trein'] }))).toBe(false);
		expect(pastBij(trein, opties({ vervoer: ['trein'] }))).toBe(true);
		expect(vereistReservering(eurostar.legs[0])).toBe(true);
		expect(vereistReservering(trein.legs[0])).toBe(false);
		expect(pastBij(eurostar, opties({ zonderReservering: true }))).toBe(false);
		expect(pastBij(overstap, opties({ extraOverstaptijd: 5 }))).toBe(false);
		expect(pastBij(overstap, opties({ extraOverstaptijd: 0 }))).toBe(true);
	});
});
