import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	// De installatie-uitleg verschijnt bij de eerste keer; in tests is die al gezien
	await page.addInitScript(() => localStorage.setItem('uitleg-gezien', 'true'));
});

test('toont de installatie-uitleg bij de eerste keer', async ({ browser }) => {
	const page = await (await browser.newContext()).newPage();
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Begrepen' })).toBeVisible();
	await page.getByRole('button', { name: 'Begrepen' }).click();
	await expect(page.getByRole('button', { name: 'Begrepen' })).toBeHidden();
});

async function kiesPlek(page: Page, veld: RegExp, zoek: string, keuze: RegExp) {
	await page.getByRole('button', { name: veld }).first().click();
	await page.getByRole('searchbox').fill(zoek);
	await page.getByRole('button', { name: keuze }).click();
}

test('plannen, details, reis starten en vertrekbord', async ({ page }) => {
	const fouten: string[] = [];
	page.on('pageerror', (e) => fouten.push(e.message));

	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Plan reis' })).toBeVisible();

	await kiesPlek(page, /^Van/, 'oudegr', /Oudegracht 100/);
	await kiesPlek(page, /^Naar/, 'damrak', /Damrak 1/);
	await page.getByRole('button', { name: 'Plan reis' }).click();

	await page.waitForURL('**/reisadviezen');
	await expect(page.locator('a.advies')).toHaveCount(5);
	await expect(page.getByRole('button', { name: 'Eerder' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Later' })).toBeVisible();

	// Voorkeur wisselen herberekent zonder opnieuw in te voeren
	await page.getByRole('group', { name: 'Sorteer op' }).getByRole('button', { name: 'Minste overstappen' }).click();
	await expect(page.locator('a.advies').first().locator('.lijnlabel')).toHaveCount(1);

	// Favoriet bewaren
	await page.getByRole('button', { name: 'Bewaar als favoriet' }).click();

	await page.locator('a.advies').first().click();
	await expect(page.getByRole('button', { name: 'Start reis' })).toBeVisible();
	await expect(page.locator('li.rit').first()).toBeVisible();

	// Voertuiginfo en instapadvies
	await page.getByRole('button', { name: /Trein & instapadvies/ }).first().click();
	await expect(page.getByRole('heading', { name: 'Instapadvies' })).toBeVisible();
	await page.getByRole('button', { name: 'Sluiten' }).click();

	// Nu vertrekken: aftelling op basis van GPS
	await page.getByRole('button', { name: 'Nu vertrekken' }).click();
	await expect(page.getByText(/Vertrek over|haal je deze niet meer/)).toBeVisible();

	await page.getByRole('button', { name: 'Start reis' }).click();
	await page.waitForURL('**/reis');
	await expect(page.getByRole('heading', { name: /^Naar / })).toBeVisible();
	await expect(page.getByText(/Volgende stap|Nu/).first()).toBeVisible();

	// Actieve reis wordt het startscherm
	await page.goto('/');
	await page.waitForURL('**/reis');

	// Vertrekbord
	await page.goto('/vertrektijden');
	await page.getByRole('button', { name: /Halte of station/ }).click();
	await page.getByRole('searchbox').fill('utrecht c');
	await page.getByRole('button', { name: /Utrecht Centraal/ }).click();
	await expect(page.getByText(/Ververst elke 30 s/)).toBeVisible();

	// Favoriet staat in de lijst
	await page.goto('/favorieten');
	await expect(page.getByText('Oudegracht 100 → Damrak 1')).toBeVisible();

	expect(fouten).toEqual([]);
});

test('startscherm: tijd kiezen en recente zoekopdracht opnieuw plannen', async ({ page }) => {
	await page.goto('/');
	await kiesPlek(page, /^Van/, 'oudegr', /Oudegracht 100/);
	await kiesPlek(page, /^Naar/, 'damrak', /Damrak 1/);
	await page.getByRole('button', { name: 'Nu vertrekken' }).click();
	await page.getByRole('button', { name: 'Aankomst', exact: true }).click();
	await page.getByLabel('Tijd').fill('09:00');
	await page.getByRole('button', { name: 'Klaar' }).click();
	await expect(page.getByRole('button', { name: /Aankomst .* 09:00/ })).toBeVisible();
	await page.getByRole('button', { name: 'Plan reis' }).click();
	await page.waitForURL('**/reisadviezen');
	await expect(page.locator('a.advies').first()).toBeVisible();
	await expect(page.getByText(/Aankomst .* 09:00/)).toBeVisible();

	await page.getByRole('link', { name: 'Terug naar plannen' }).click();
	await page.waitForURL(/\/$/);
	await expect(page.getByRole('heading', { name: /Recent gezocht/ })).toBeVisible();
	await page.getByRole('button', { name: /Oudegracht 100 → Damrak 1/ }).click();
	await page.waitForURL('**/reisadviezen');
	await expect(page.locator('a.advies').first()).toBeVisible();
});

test('overstap klapt uit naar lopen en wachten', async ({ page }) => {
	await page.goto('/');
	await kiesPlek(page, /^Van/, 'amersfoort', /Amersfoort Centraal/);
	await kiesPlek(page, /^Naar/, 'amsterdam c', /Amsterdam Centraal/);
	await page.getByRole('button', { name: 'Plan reis' }).click();
	// Een advies met overstap (twee ritten)
	await page.locator('a.advies').filter({ has: page.locator('.lijnlabel').nth(1) }).first().click();
	const overstap = page.getByRole('button', { name: /overstap/i }).first();
	await expect(overstap).toHaveAttribute('aria-expanded', 'false');
	await overstap.click();
	await expect(page.getByText(/min wachten|te laat voor de aansluiting/)).toBeVisible();
	// Rijtijd per rit staat links tussen de tijden
	await expect(page.locator('.midden .duur').first()).toHaveText(/\d+ min|\d+ u/);
});

test('agenda-export levert een .ics-bestand', async ({ page }) => {
	await page.goto('/');
	await kiesPlek(page, /^Van/, 'utrecht c', /Utrecht Centraal/);
	await kiesPlek(page, /^Naar/, 'amsterdam c', /Amsterdam Centraal/);
	await page.getByRole('button', { name: 'Plan reis' }).click();
	await page.locator('a.advies').first().click();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Agenda' }).click();
	const bestand = await download;
	expect(bestand.suggestedFilename()).toMatch(/\.ics$/);
});

test('kaart laadt (worker) en tekent de route over het spoor', async ({ page }) => {
	const fouten: string[] = [];
	page.on('pageerror', (e) => fouten.push(e.message));
	page.on('console', (m) => m.type() === 'error' && fouten.push(m.text()));
	// Kaartstijl lokaal: de tegelserver hoeft voor deze test niet bereikbaar te zijn
	await page.route('https://tiles.openfreemap.org/**', (route) =>
		route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'achtergrond', type: 'background', paint: { 'background-color': '#dde' } }] })
		})
	);
	const spoorkaart = page.waitForResponse('**/api/spoorkaart');
	await page.goto('/');
	await kiesPlek(page, /^Van/, 'utrecht c', /Utrecht Centraal/);
	await kiesPlek(page, /^Naar/, 'amsterdam c', /Amsterdam Centraal/);
	await page.getByRole('button', { name: 'Plan reis' }).click();
	await page.locator('a.advies').first().click();
	await page.getByRole('button', { name: 'Kaart' }).first().click();
	expect((await spoorkaart).status()).toBe(200);
	await expect(page.getByRole('button', { name: 'Spoor' })).toBeVisible();
	await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(1);
	await expect(page.getByText('Kaart kon niet worden geladen.')).toHaveCount(0);
	expect(fouten.filter((f) => !/GL Driver|WebGL/.test(f))).toEqual([]);
});
