import { describe, expect, it } from 'vitest';
import { adviesLabels } from './labels';
import { maakAdvies, ovLeg, t } from './testdata';

describe('labels op reisadviezen', () => {
	const nu = Date.parse(t('09:00'));
	const snel = maakAdvies([ovLeg('A', 'C', '10:00', '10:10'), ovLeg('C', 'B', '10:13', '10:30')]);
	const direct = maakAdvies([ovLeg('A', 'B', '10:05', '10:45', { tripId: 'direct' })]);
	const later = maakAdvies([ovLeg('A', 'B', '10:35', '11:15', { tripId: 'later' })]);
	snel.prijs = { bedrag: 900, exact: true, onderdelen: [] };
	direct.prijs = { bedrag: 700, exact: true, onderdelen: [] };
	later.prijs = { bedrag: 700, exact: true, onderdelen: [] };

	it('geeft de snelste, de goedkoopste en die met de minste overstappen een label', () => {
		const labels = adviesLabels([snel, direct, later], nu);
		expect(labels.get(snel.id)).toEqual(['snelst']);
		expect(labels.get(direct.id)).toEqual(['overstappen', 'goedkoopst']);
		expect(labels.get(later.id)).toEqual(['overstappen', 'goedkoopst']);
	});

	it('geeft geen label als alles gelijk is of het al vertrokken is', () => {
		expect(adviesLabels([direct, later], nu).get(direct.id)).toBeUndefined();
		// Na vertrek van de snelste telt die niet meer mee
		expect(adviesLabels([snel, direct, later], Date.parse(t('10:02'))).get(snel.id)).toBeUndefined();
	});
});
