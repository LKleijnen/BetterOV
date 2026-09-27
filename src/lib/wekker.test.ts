import { describe, expect, it } from 'vitest';
import { wekkerMelding, wekkerVerlopen } from './wekker';
import { loopLeg, maakAdvies, ovLeg, t } from './testdata';

describe('wekker laatste trein', () => {
	const advies = maakAdvies([loopLeg('Café', 'Utrecht Centraal', '23:30', 12), ovLeg('Utrecht Centraal', 'Amersfoort Centraal', '23:42', '23:57')]);

	it('meldt 30 en 10 minuten voor vertrek, elk één keer', () => {
		expect(wekkerMelding(advies, [], Date.parse(t('22:50')))).toBeNull();
		const dertig = wekkerMelding(advies, [], Date.parse(t('23:01')))!;
		expect(dertig.sleutel).toBe('min:30');
		expect(dertig.titel).toBe('Over 29 min vertrekken');
		expect(dertig.tekst).toContain('23:42 vanaf Utrecht Centraal, spoor 5');
		expect(wekkerMelding(advies, ['min:30'], Date.parse(t('23:10')))).toBeNull();
		expect(wekkerMelding(advies, ['min:30'], Date.parse(t('23:21')))?.sleutel).toBe('min:10');
		// Te laat opgezet: meteen de 10-minutenmelding, daarna geen 30-minutenmelding meer
		expect(wekkerMelding(advies, ['min:10'], Date.parse(t('23:25')))).toBeNull();
	});

	it('waarschuwt bij uitval', () => {
		const uitval = maakAdvies([ovLeg('Utrecht Centraal', 'Amersfoort Centraal', '23:42', '23:57', { uitgevallen: true })]);
		expect(wekkerMelding(uitval, [], Date.parse(t('22:30')))?.titel).toBe('Laatste trein naar huis: let op');
	});

	it('verloopt kort na vertrek', () => {
		expect(wekkerVerlopen(advies, Date.parse(t('23:35')))).toBe(false);
		expect(wekkerVerlopen(advies, Date.parse(t('23:45')))).toBe(true);
	});
});
