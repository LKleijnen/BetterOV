import { describe, expect, it } from 'vitest';
import { splitsTekst } from './splitsen';
import type { TreinInfo } from './types';

const info = (extra: Partial<TreinInfo>): TreinInfo => ({
	ritnummer: '1',
	delen: [
		{ nummer: '9501', faciliteiten: [], bakken: 4 },
		{ nummer: '9502', faciliteiten: [], bakken: 4 }
	],
	ingekort: false,
	faciliteiten: [],
	bron: [],
	opgehaaldOp: '',
	...extra
});

describe('tekst bij splitsen', () => {
	it('zegt in welk deel je moet zitten', () => {
		const t = splitsTekst(
			info({
				instapadvies: { eersteKlas: [], stilte: [], rijrichting: 'links', samenvatting: [], nauwkeurig: false },
				splitsing: {
					station: 'Sittard',
					jouwDelen: [0],
					bestemmingen: [
						{ deel: 0, naar: 'Maastricht' },
						{ deel: 1, naar: 'Heerlen' }
					],
					voorUitstappen: true
				}
			})
		);
		expect(t?.kop).toBe('Deze trein splitst in Sittard');
		expect(t?.jouw).toBe('Zit in het voorste deel naar Maastricht.');
		expect(t?.anders).toBe('Het andere deel gaat naar Heerlen.');
		expect(t?.kort).toBe('Splitst in Sittard · zit voorin (naar Maastricht)');
	});

	it('noemt twee treinstellen voorin samen het voorste deel', () => {
		const drie = info({
			delen: [
				{ nummer: '1', faciliteiten: [], bakken: 4 },
				{ nummer: '2', faciliteiten: [], bakken: 4 },
				{ nummer: '3', faciliteiten: [], bakken: 4 }
			],
			instapadvies: { eersteKlas: [], stilte: [], rijrichting: 'links', samenvatting: [], nauwkeurig: false },
			splitsing: { station: 'Zwolle', jouwDelen: [0, 1], bestemmingen: [], jouwBestemming: 'Groningen', voorUitstappen: true }
		});
		expect(splitsTekst(drie)?.jouw).toBe('Zit in het voorste deel naar Groningen.');
		expect(splitsTekst({ ...drie, splitsing: { ...drie.splitsing!, jouwDelen: [1, 2] } })?.jouw).toBe('Zit in het achterste deel naar Groningen.');
	});

	it('telt bij rijrichting rechts vanaf de andere kant', () => {
		const t = splitsTekst(
			info({
				instapadvies: { eersteKlas: [], stilte: [], rijrichting: 'rechts', samenvatting: [], nauwkeurig: false },
				splitsing: { station: 'Sittard', jouwDelen: [0], bestemmingen: [], jouwBestemming: 'Maastricht', voorUitstappen: true }
			})
		);
		expect(t?.jouw).toBe('Zit in het achterste deel naar Maastricht.');
	});

	it('is eerlijk als niet bekend is welk deel van jou is', () => {
		const t = splitsTekst(info({ splitsing: { station: 'Sittard', jouwDelen: [], bestemmingen: [], jouwBestemming: 'Maastricht', voorUitstappen: true } }));
		expect(t?.jouw).toBe('Zit in het deel naar Maastricht; let op de borden en de omroep.');
		expect(t?.kort).toBe('Splitst in Sittard · zit in het deel naar Maastricht');
	});

	it('noemt het als een deel achterblijft', () => {
		const t = splitsTekst(
			info({ splitsing: { station: 'Leiden Centraal', jouwDelen: [], bestemmingen: [], jouwBestemming: 'Den Haag Centraal', andereBestemmingen: ['Leiden Centraal'], voorUitstappen: true } })
		);
		expect(t?.kop).toBe('Een deel van deze trein stopt in Leiden Centraal');
		expect(t?.anders).toBe('Het andere deel rijdt niet verder.');
	});

	it('zwijgt als de splitsing pas na je uitstapstation is', () => {
		expect(splitsTekst(info({ splitsing: { station: 'Sittard', jouwDelen: [0], bestemmingen: [], voorUitstappen: false } }))).toBeNull();
	});
});
