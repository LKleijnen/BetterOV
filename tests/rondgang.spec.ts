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

	await expect(page.getByRole('heading', { name: 'Reisadviezen' })).toBeVisible();
	await expect(page.locator('a.advies')).toHaveCount(5);
	await expect(page.getByRole('button', { name: 'Eerder' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Later' })).toBeVisible();

	// Voorkeur wisselen herberekent zonder opnieuw in te voeren
	await page.getByRole('group', { name: 'Sorteer op' }).getByRole('button', { name: 'Minste overstappen' }).click();
	await expect(page.locator('a.advies').first()).toContainText('Direct');

	// Favoriet bewaren
	await page.getByRole('button', { name: 'Bewaar als favoriet' }).click();

	await page.locator('a.advies').first().click();
	await expect(page.getByRole('button', { name: 'Start reis' })).toBeVisible();
	await expect(page.getByText(/overstaptijd|Krappe overstap|Direct/).first()).toBeVisible();

	// Voertuiginfo en instapadvies
	await page.getByRole('button', { name: /Trein & instapadvies/ }).first().click();
	await expect(page.getByRole('heading', { name: 'Instapadvies' })).toBeVisible();
	await page.getByRole('button', { name: 'Sluiten' }).click();

	// Nu vertrekken: aftelling op basis van GPS
	await page.getByRole('switch').check();
	await expect(page.getByText(/Vertrek over|haal je deze niet meer/)).toBeVisible();

	await page.getByRole('button', { name: 'Start reis' }).click();
	await page.waitForURL('**/reis');
	await expect(page.getByText('Onderweg naar')).toBeVisible();
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

test('agenda-export levert een .ics-bestand', async ({ page }) => {
	await page.goto('/');
	await kiesPlek(page, /^Van/, 'utrecht c', /Utrecht Centraal/);
	await kiesPlek(page, /^Naar/, 'amsterdam c', /Amsterdam Centraal/);
	await page.getByRole('button', { name: 'Plan reis' }).click();
	await page.locator('a.advies').first().click();
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'In agenda' }).click();
	const bestand = await download;
	expect(bestand.suggestedFilename()).toMatch(/\.ics$/);
});
