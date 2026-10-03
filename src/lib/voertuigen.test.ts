import { describe, expect, it } from 'vitest';
import data from './data/voertuigen.json';
import { materieelSoort } from './materieel';
import { variantVoorNummer, voertuigVoorType, zoekVoertuigen, type Voertuig } from './voertuigen';
import { bestandUitUrl, tekstUitHtml, veiligeUrl } from './client/wikifoto';

const lijst = data as unknown as Voertuig[];

describe('voertuigengids', () => {
	it('heeft complete en herkenbare voertuigen', () => {
		const ids = new Set<string>();
		for (const v of lijst) {
			expect(ids.has(v.id), v.id).toBe(false);
			ids.add(v.id);
			expect(v.kort.length, v.id).toBeGreaterThan(40);
			expect(v.varianten.length, v.id).toBeGreaterThan(0);
			expect(v.bronnen.length, v.id).toBeGreaterThan(0);
			for (const b of v.bronnen) expect(b.url, v.id).toMatch(/^https:\/\//);
			for (const va of v.varianten) for (const [van, tot] of va.nummers ?? []) expect(van, `${v.id} ${va.code}`).toBeLessThanOrEqual(tot);
			// Elke trein in de gids wordt ook herkend in de NS-data
			if (v.soort === 'trein') expect(materieelSoort(v.code)?.code, v.id).toBe(v.code);
		}
	});

	it('vindt het voertuig bij een type, ook bij FLIRT van NS of een regionale vervoerder', () => {
		expect(voertuigVoorType(lijst, 'VIRMm1 VI')?.id).toBe('virm');
		expect(voertuigVoorType(lijst, 'FLIRT 3 FFF', 'NS')?.id).toBe('flirt');
		expect(voertuigVoorType(lijst, 'FLIRT', 'Arriva')?.id).toBe('flirt-regio');
		expect(voertuigVoorType(lijst, 'onbekend')).toBeUndefined();
	});

	it('vindt de versie bij een treinstelnummer', () => {
		const virm = lijst.find((v) => v.id === 'virm')!;
		expect(virm.varianten[variantVoorNummer(virm, '8641')].code).toContain('VIRMm1');
		expect(virm.varianten[variantVoorNummer(virm, '9594')].code).toBe('VIRMm4');
		expect(virm.varianten[variantVoorNummer(virm, '9572')].code).toBe('VIRM-4');
		expect(variantVoorNummer(virm, '1234')).toBe(-1);
	});

	it('zoekt op naam en op treinstelnummer', () => {
		expect(zoekVoertuigen(lijst, 'koploper').map((t) => t.voertuig.id)).toContain('icm');
		expect(zoekVoertuigen(lijst, 'sprinter nieuwe')[0].voertuig.id).toBe('sng');
		const opNummer = zoekVoertuigen(lijst, '2735');
		expect(opNummer.map((t) => t.voertuig.id)).toEqual(['sng']);
		expect(opNummer[0].variant).toBeGreaterThanOrEqual(0);
		expect(zoekVoertuigen(lijst, '')).toHaveLength(lijst.length);
	});
});

describe('foto van Wikipedia', () => {
	it('haalt de bestandsnaam uit een (thumb-)URL', () => {
		expect(bestandUitUrl('https://upload.wikimedia.org/wikipedia/commons/a/ab/NS_VIRM_8641.jpg')).toBe('NS_VIRM_8641.jpg');
		expect(bestandUitUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/NS_VIRM_8641.jpg/320px-NS_VIRM_8641.jpg')).toBe('NS_VIRM_8641.jpg');
		expect(bestandUitUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Caf%C3%A9.jpg/320px-Caf%C3%A9.jpg')).toBe('Café.jpg');
	});

	it('neemt alleen https-links over', () => {
		expect(veiligeUrl('https://creativecommons.org/licenses/by/2.0')).toBe('https://creativecommons.org/licenses/by/2.0');
		expect(veiligeUrl('//upload.wikimedia.org/a.jpg')).toBe('https://upload.wikimedia.org/a.jpg');
		expect(veiligeUrl('javascript:alert(1)')).toBeUndefined();
		expect(veiligeUrl(undefined)).toBeUndefined();
	});

	it('maakt van de maker gewone tekst', () => {
		expect(tekstUitHtml('<a href="//commons.wikimedia.org/wiki/User:X">Jan &amp; Piet</a>')).toBe('Jan & Piet');
		expect(tekstUitHtml(undefined)).toBeUndefined();
	});
});
