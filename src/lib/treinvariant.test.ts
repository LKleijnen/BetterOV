import { describe, expect, it } from 'vitest';
import { bakkenUitNummer, bakkenUitTypeNaam, treinVariant, vasteIndeling } from './treinvariant';

describe('versie en aantal bakken', () => {
	it('leest het aantal bakken uit de typenaam', () => {
		expect(bakkenUitTypeNaam('VIRM-6')).toBe(6);
		expect(bakkenUitTypeNaam('VIRMm1 VI')).toBe(6);
		expect(bakkenUitTypeNaam('VIRM IV')).toBe(4);
		expect(bakkenUitTypeNaam('SNG 3')).toBe(3);
		expect(bakkenUitTypeNaam('FLIRT 3 FFF')).toBe(3);
		// "VIRMm1" zegt niets over het aantal bakken
		expect(bakkenUitTypeNaam('VIRMm1')).toBeUndefined();
	});

	it('leest het aantal bakken uit het materieelnummer', () => {
		expect(bakkenUitNummer('VIRM', '9572')).toBe(4);
		expect(bakkenUitNummer('VIRM', '8641')).toBe(6);
		expect(bakkenUitNummer('ICM', '4031')).toBe(3);
		expect(bakkenUitNummer('ICM', '4235')).toBe(4);
		expect(bakkenUitNummer('SNG', '3012')).toBe(3);
		expect(bakkenUitNummer('onbekend', '9572')).toBeUndefined();
	});

	it('herkent de versie aan het type of het nummer', () => {
		expect(treinVariant('VIRMm1 VI', '8641')?.naam).toBe('VIRMm1');
		expect(treinVariant('VIRM-4', '9411')?.naam).toBe('VIRMm1');
		expect(treinVariant('VIRM IV', '9510')?.naam).toBe('VIRMm2/3');
		expect(treinVariant('VIRM IV', '9572')?.naam).toBe('VIRM (4e serie)');
		expect(treinVariant('ICNG-5', '3105')?.leeftijd).toBe('nieuw');
		// Een FLIRT van Arriva is niet die van NS
		expect(treinVariant('FLIRT 3', '2201', 'Arriva')).toBeUndefined();
		// Wie is moderner bij een gekoppelde VIRM?
		expect(treinVariant('VIRMm1 VI', '8641')!.rang).toBeGreaterThan(treinVariant('VIRM IV', '9572')!.rang);
	});
});

describe('vaste indeling per bak', () => {
	it('zet 1e klas alleen zeker als het in beide standen klopt', () => {
		// VIRM-6: 1e klas in bak 2, 3 en 5 (of 2, 4 en 5 als hij andersom staat)
		const virm6 = vasteIndeling('VIRMm1 VI', 6, false)!;
		expect(virm6.map((b) => b.eersteKlas)).toEqual([undefined, 'ja', 'misschien', 'misschien', 'ja', undefined]);
		expect(virm6.every((b) => b.stilte === undefined)).toBe(true);
		// VIRM-4 is symmetrisch
		expect(vasteIndeling('VIRM IV', 4, true)!.map((b) => b.eersteKlas)).toEqual([undefined, 'ja', 'ja', undefined]);
		// ICM-3: alleen de middelste bak, met een stilte die bij de 1e klas hoort
		expect(vasteIndeling('ICM-3', 3, true)).toEqual([{}, { eersteKlas: 'ja', stilte: 'ja' }, {}].map((b) => ({ eersteKlas: undefined, stilte: undefined, ...b })));
		// SLT-6: alleen de kopbakken
		expect(vasteIndeling('SLT-6', 6, false)!.map((b) => b.eersteKlas)).toEqual(['ja', undefined, undefined, undefined, undefined, 'ja']);
	});

	it('weet het niet bij onbekende types of aantallen', () => {
		expect(vasteIndeling('ICNG-8', 8, true)).toBeUndefined();
		expect(vasteIndeling('VIRM', 5, true)).toBeUndefined();
		expect(vasteIndeling('GTW 2/8', 2, false)).toBeUndefined();
	});
});
