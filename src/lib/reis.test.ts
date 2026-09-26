import { describe, expect, it } from 'vitest';
import { adviesStatus, huidigeStap, overstappen, vindProblemen } from './reis';
import { loopLeg, maakAdvies, ovLeg, t } from './testdata';

describe('overstapmarge', () => {
	it('berekent marge minus looptijd en markeert krap onder 3 minuten', () => {
		const advies = maakAdvies([
			ovLeg('Utrecht', 'Amersfoort', '10:00', '10:15'),
			loopLeg('Amersfoort', 'Amersfoort', '10:15', 2),
			ovLeg('Amersfoort', 'Zwolle', '10:19', '10:50')
		]);
		const [o] = overstappen(advies);
		expect(o.overstaptijd).toBe(4);
		expect(o.looptijd).toBe(2);
		expect(o.marge).toBe(2);
		expect(o.krap).toBe(true);
		expect(o.haalbaar).toBe(true);
		expect(adviesStatus(advies)).toBe('krap');
	});

	it('herkent een niet-haalbare overstap door vertraging', () => {
		const advies = maakAdvies([
			ovLeg('Utrecht', 'Amersfoort', '10:00', '10:15', { aankomstVerwacht: '10:21' }),
			ovLeg('Amersfoort', 'Zwolle', '10:19', '10:50')
		]);
		const [o] = overstappen(advies);
		expect(o.marge).toBe(-2);
		expect(o.haalbaar).toBe(false);
		expect(adviesStatus(advies)).toBe('onhaalbaar');
	});
});

describe('problemen in een actieve reis', () => {
	const nu = Date.parse(t('09:50'));

	it('meldt uitval als ernstig probleem', () => {
		const advies = maakAdvies([ovLeg('Utrecht', 'Zwolle', '10:00', '10:50', { uitgevallen: true })]);
		const p = vindProblemen(advies, nu);
		expect(p).toHaveLength(1);
		expect(p[0].soort).toBe('uitval');
		expect(p[0].ernstig).toBe(true);
	});

	it('meldt een spoorwijziging vóór vertrek', () => {
		const leg = ovLeg('Utrecht', 'Zwolle', '10:00', '10:50');
		leg.van.spoor = '8';
		const p = vindProblemen(maakAdvies([leg]), nu);
		expect(p.map((x) => x.soort)).toEqual(['spoor']);
		expect(p[0].tekst).toContain('spoor 8 (was 5)');
	});

	it('meldt vertraging vanaf 5 minuten, in stappen van 5', () => {
		const a = maakAdvies([ovLeg('Utrecht', 'Zwolle', '10:00', '10:50', { aankomstVerwacht: '10:57' })]);
		const p = vindProblemen(a, nu);
		expect(p[0].soort).toBe('vertraging');
		expect(p[0].sleutel).toBe('vertraging:5');
		const b = maakAdvies([ovLeg('Utrecht', 'Zwolle', '10:00', '10:50', { aankomstVerwacht: '11:01' })]);
		expect(vindProblemen(b, nu)[0].sleutel).toBe('vertraging:10');
	});

	it('negeert ritten die al voorbij zijn', () => {
		const advies = maakAdvies([ovLeg('Utrecht', 'Zwolle', '08:00', '08:50', { uitgevallen: true })]);
		expect(vindProblemen(advies, nu)).toEqual([]);
	});
});

describe('huidige stap', () => {
	const advies = maakAdvies([
		loopLeg('Thuis', 'Utrecht', '09:50', 8),
		ovLeg('Utrecht', 'Zwolle', '10:00', '10:50')
	]);

	it('begint met lopen', () => {
		const s = huidigeStap(advies, Date.parse(t('09:45')));
		expect(s.fase).toBe('voor');
		expect(s.titel).toContain('lopend');
	});

	it('wacht op de trein na het lopen', () => {
		const s = huidigeStap(advies, Date.parse(t('09:59')));
		expect(s.legIndex).toBe(1);
		expect(s.titel).toContain('Instappen');
		expect(s.detail).toContain('spoor 5');
	});

	it('telt af naar uitstappen tijdens de rit', () => {
		const s = huidigeStap(advies, Date.parse(t('10:20')));
		expect(s.fase).toBe('tijdens');
		expect(s.titel).toBe('Uitstappen in Zwolle');
	});

	it('is klaar na aankomst', () => {
		expect(huidigeStap(advies, Date.parse(t('11:00'))).fase).toBe('klaar');
	});
});
