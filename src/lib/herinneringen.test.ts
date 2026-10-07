import { describe, expect, it } from 'vitest';
import { duurKort, herinneringInstellingen, herinneringTitel, reisHerinneringen, teVersturen } from './herinneringen';
import { loopLeg, maakAdvies, ovLeg, t } from './testdata';

const ms = (hhmm: string, sec = 0) => Date.parse(t(hhmm)) + sec * 1000;

// Utrecht 12:00 → Amsterdam 12:30, overstap 3 min, Amsterdam 12:33 → Alkmaar 13:10
const advies = maakAdvies([
	ovLeg('Utrecht Centraal', 'Amsterdam Centraal', '12:00', '12:30'),
	loopLeg('Amsterdam Centraal', 'Amsterdam Centraal', '12:30', 2),
	ovLeg('Amsterdam Centraal', 'Alkmaar', '12:33', '13:10', { lijn: 'IC', richting: 'Den Helder' })
]);

describe('herinneringen voor in- en uitstappen', () => {
	const instellingen = { instappen: [300, 60, 30], uitstappen: [300, 60, 30] };
	const alle = reisHerinneringen(advies, instellingen);
	const van = (soort: string, leg: number) => alle.filter((h) => h.soort === soort && h.legIndex === leg).map((h) => h.moment);

	it('instappen bij de eerste rit: gewoon op de ingestelde momenten', () => {
		expect(van('instappen', 0)).toEqual([ms('11:55'), ms('11:59'), ms('11:59', 30)]);
	});

	it('instappen terwijl je nog in een ander voertuig zit: pas een minuut na aankomst', () => {
		// Aankomst 12:30, dus niet vóór 12:31; de 5-minutenherinnering schuift naar 12:31
		expect(van('instappen', 2)).toEqual([ms('12:31'), ms('12:32'), ms('12:32', 30)]);
	});

	it('vallen twee herinneringen door het schuiven bijna samen, dan alleen de laatste', () => {
		// Overstap van 1,5 minuut: 5 min en 1 min schuiven allebei naar 12:31, vlak voor die van 30 s
		const krap = maakAdvies([
			ovLeg('Utrecht Centraal', 'Amsterdam Centraal', '12:00', '12:30'),
			ovLeg('Amsterdam Centraal', 'Alkmaar', '12:32', '13:10', { vertrekVerwacht: '12:31' })
		]);
		const momenten = reisHerinneringen(krap, instellingen).filter((h) => h.soort === 'instappen' && h.legIndex === 1);
		expect(momenten).toHaveLength(0);
		// Vertrekt hij om 12:32: de 5 min-herinnering valt samen met die van 1 min (12:31), dus alleen 1 min en 30 s
		const iets = maakAdvies([krap.legs[0], ovLeg('Amsterdam Centraal', 'Alkmaar', '12:32', '13:10')]);
		expect(reisHerinneringen(iets, instellingen).filter((h) => h.soort === 'instappen' && h.legIndex === 1).map((h) => h.moment)).toEqual([
			ms('12:31'),
			ms('12:31', 30)
		]);
	});

	it('uitstappen alleen als je er al in zit (na vertrek)', () => {
		expect(van('uitstappen', 0)).toEqual([ms('12:25'), ms('12:29'), ms('12:29', 30)]);
		// Korte rit van 3 minuten: de 5-minutenherinnering kan pas bij vertrek, maar dan valt hij niet samen met de rest
		const kort = maakAdvies([ovLeg('Utrecht Centraal', 'Utrecht Overvecht', '12:00', '12:03')]);
		expect(reisHerinneringen(kort, instellingen).filter((h) => h.soort === 'uitstappen').map((h) => h.moment)).toEqual([
			ms('12:00'),
			ms('12:02'),
			ms('12:02', 30)
		]);
	});

	it('niets voor een rit die uitvalt, en geen uitstapherinnering als hij niet stopt waar jij eruit moet', () => {
		const uitval = maakAdvies([ovLeg('A', 'B', '12:00', '12:30', { uitgevallen: true })]);
		expect(reisHerinneringen(uitval, instellingen)).toEqual([]);
		const stoptNiet = ovLeg('A', 'B', '12:00', '12:30');
		stoptNiet.naar = { ...stoptNiet.naar, uitgevallen: true };
		expect(reisHerinneringen(maakAdvies([stoptNiet]), instellingen).map((h) => h.soort)).toEqual(['instappen', 'instappen', 'instappen']);
	});

	it('noemt bij uitstappen ook de volgende rit', () => {
		const h = alle.find((x) => x.soort === 'uitstappen' && x.legIndex === 0)!;
		expect(h.tekst).toContain('Je stapt uit in Amsterdam Centraal, spoor 7');
		expect(h.tekst).toContain('Daarna: Intercity richting Den Helder, 12:33, spoor 5.');
	});

	it('kiest wat binnen de volgende minuut moet en stuurt niets dubbel of te laat', () => {
		const nu = ms('12:31', 10);
		const nuTeSturen = teVersturen(alle, new Set(), nu).map((h) => h.sleutel);
		// 12:31 (net geweest) en 12:32 (binnen de minuut); die van 12:32:30 komt bij de volgende controle
		expect(nuTeSturen).toEqual(['instap:2:300:trip-Amsterdam Centraal-Alkmaar', 'instap:2:60:trip-Amsterdam Centraal-Alkmaar']);
		// Om 12:30:50 wordt die van 12:31 alvast ingepland
		expect(teVersturen(alle, new Set(), ms('12:30', 50)).map((h) => h.sleutel)).toEqual(['instap:2:300:trip-Amsterdam Centraal-Alkmaar']);
		expect(teVersturen(alle, new Set(nuTeSturen), nu).map((h) => h.sleutel)).not.toContain(nuTeSturen[0]);
		// Na vertrek niets meer over instappen
		expect(teVersturen(alle, new Set(), ms('12:33', 5)).filter((h) => h.soort === 'instappen')).toEqual([]);
	});

	it('titel met de tijd die nog over is', () => {
		const h = alle.find((x) => x.soort === 'instappen' && x.legIndex === 0)!;
		expect(herinneringTitel(h, ms('11:55'))).toBe('Instappen over 5 min');
		expect(herinneringTitel(h, ms('11:58', 30))).toBe('Instappen over 1,5 min');
		expect(herinneringTitel(h, ms('11:59', 30))).toBe('Instappen over 30 s');
		expect(herinneringTitel(h, ms('11:59', 50))).toBe('Nu instappen');
	});

	it('instellingen: standaard 2 minuten, leeg is uit, rommel eruit', () => {
		expect(herinneringInstellingen(undefined)).toEqual({ instappen: [120], uitstappen: [120] });
		expect(herinneringInstellingen({ instappen: [], uitstappen: [30, 300, 30, -5, 99999] })).toEqual({ instappen: [], uitstappen: [300, 30] });
		expect(reisHerinneringen(advies, { instappen: [], uitstappen: [] })).toEqual([]);
		expect(duurKort(30)).toBe('30 s');
		expect(duurKort(120)).toBe('2 min');
	});
});
