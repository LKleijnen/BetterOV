import { describe, expect, it } from 'vitest';
import { ApiFout } from './http';
import type { FsDocument } from './firestore';
import { codeHash, maakUitnodiging, wisselIn } from './uitnodiging';

/** Firestore in het geheugen, met dezelfde voorwaarde op updateTime als de echte */
function nepOpslag() {
	const docs = new Map<string, { data: Record<string, unknown>; updateTime: string }>();
	let klok = 0;
	const opslag = {
		docs,
		async get<T>(pad: string): Promise<FsDocument<T> | null> {
			const d = docs.get(pad);
			return d ? { id: pad.split('/').pop()!, pad, data: structuredClone(d.data) as T, updateTime: d.updateTime } : null;
		},
		async zet(pad: string, data: Record<string, unknown>, velden?: string[], alsOngewijzigdSinds?: string) {
			const oud = docs.get(pad);
			if (alsOngewijzigdSinds && oud?.updateTime !== alsOngewijzigdSinds) throw new ApiFout('FAILED_PRECONDITION', 400, 'firestore');
			const nieuw = velden ? { ...(oud?.data ?? {}), ...Object.fromEntries(velden.map((v) => [v, data[v]])) } : data;
			docs.set(pad, { data: nieuw, updateTime: `t${++klok}` });
		},
		async lijst<T>(collectie: string): Promise<FsDocument<T>[]> {
			return [...docs.entries()]
				.filter(([p]) => p.startsWith(`${collectie}/`))
				.map(([pad, d]) => ({ id: pad.split('/').pop()!, pad, data: d.data as T }));
		},
		async verwijder(pad: string) {
			docs.delete(pad);
		}
	};
	return opslag;
}

describe('uitnodigingslinks', () => {
	it('slaat alleen een hash op, niet de code zelf', async () => {
		const fs = nepOpslag();
		const code = await maakUitnodiging(fs, 'beheer@gmail.com', 'Oma');
		expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect([...fs.docs.keys()]).toEqual([`uitnodigingen/${await codeHash(code)}`]);
		expect(JSON.stringify([...fs.docs.values()])).not.toContain(code);
	});

	it('geeft toegang en werkt maar één keer', async () => {
		const fs = nepOpslag();
		const code = await maakUitnodiging(fs, 'beheer@gmail.com');
		expect(await wisselIn(fs, code, 'jan.jansen@gmail.com')).toEqual({ ok: true });
		expect(fs.docs.has('allowlist/jan.jansen@gmail.com')).toBe(true);
		expect(fs.docs.has('allowlist/janjansen@gmail.com')).toBe(true);
		// Zelfde persoon nog eens: prima; iemand anders: geweigerd
		expect(await wisselIn(fs, code, 'janjansen@gmail.com')).toEqual({ ok: true });
		expect(await wisselIn(fs, code, 'piet@gmail.com')).toEqual({ ok: false, reden: 'gebruikt' });
		expect(fs.docs.has('allowlist/piet@gmail.com')).toBe(false);
	});

	it('laat bij gelijktijdig gebruik maar één persoon toe', async () => {
		const fs = nepOpslag();
		const code = await maakUitnodiging(fs, 'beheer@gmail.com');
		const [a, b] = await Promise.all([wisselIn(fs, code, 'a@gmail.com'), wisselIn(fs, code, 'b@gmail.com')]);
		expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
		expect(fs.docs.has('allowlist/a@gmail.com') !== fs.docs.has('allowlist/b@gmail.com')).toBe(true);
	});

	it('weigert verlopen, ingetrokken en verzonnen codes', async () => {
		const fs = nepOpslag();
		const code = await maakUitnodiging(fs, 'beheer@gmail.com', undefined, Date.parse('2026-01-01T12:00:00Z'));
		expect(await wisselIn(fs, code, 'a@gmail.com', Date.parse('2026-01-09T12:00:00Z'))).toEqual({ ok: false, reden: 'verlopen' });
		expect(await wisselIn(fs, 'x'.repeat(32), 'a@gmail.com')).toEqual({ ok: false, reden: 'ongeldig' });
		expect(await wisselIn(fs, '../allowlist/iets', 'a@gmail.com')).toEqual({ ok: false, reden: 'ongeldig' });
	});
});
