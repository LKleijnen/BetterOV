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

	// Snelst/minste overstappen/goedkoopst staan als label in de lijst, die op vertrektijd staat
	await expect(page.locator('a.advies .adviestag').first()).toBeVisible();
	const vertrektijden = await page.locator('a.advies .tijden .tijdblok:first-child .tijd').allTextContents();
	const minuten = vertrektijden.map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));
	// Oplopend (een sprong terug van meer dan 12 uur is middernacht)
	for (let i = 1; i < minuten.length; i++) expect(minuten[i] >= minuten[i - 1] || minuten[i - 1] - minuten[i] > 720).toBe(true);

	// Favoriet bewaren
	await page.getByRole('button', { name: 'Bewaar als favoriet' }).click();

	await page.locator('a.advies').first().click();
	await expect(page.getByRole('button', { name: 'Start reis' })).toBeVisible();
	await expect(page.locator('li.rit').first()).toBeVisible();

	// Voertuiginfo en instapadvies
	await page.getByRole('button', { name: 'Voertuiginfo' }).first().click();
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

test('reisopties: zonder bus plannen', async ({ page }) => {
	await page.goto('/');
	await kiesPlek(page, /^Van/, 'oudegr', /Oudegracht 100/);
	await kiesPlek(page, /^Naar/, 'kerkstraat', /Kerkstraat 12/);
	await page.getByRole('button', { name: 'Plan reis' }).click();
	await page.waitForURL('**/reisadviezen');
	// Met nepdata heeft één advies een bus aan het eind
	await expect(page.locator('a.advies .lijnlabel', { hasText: '12' })).toHaveCount(1);

	await page.getByRole('link', { name: 'Terug naar plannen' }).click();
	await page.getByRole('button', { name: /Reisopties/ }).click();
	await page.getByRole('group', { name: 'Vervoermiddelen' }).getByRole('button', { name: 'Bus' }).click();
	await page.getByRole('button', { name: '10 min' }).click();
	await page.getByRole('button', { name: 'Klaar' }).click();
	await expect(page.getByText('+10 min overstap · zonder bus')).toBeVisible();
	await page.getByRole('button', { name: 'Plan reis' }).click();
	await page.waitForURL('**/reisadviezen');
	await expect(page.locator('a.advies').first()).toBeVisible();
	await expect(page.locator('a.advies .lijnlabel', { hasText: '12' })).toHaveCount(0);
});

test("laatste trein naar huis verschijnt 's avonds ver van huis", async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-09-26T22:00:00+02:00'));
	await page.addInitScript(() => {
		if (!localStorage.getItem('lokaal:profiel'))
			localStorage.setItem('lokaal:profiel', JSON.stringify({ thuislocatie: { naam: 'Kerkstraat 12', lat: 52.1561, lon: 5.3878, type: 'adres' } }));
	});
	await page.goto('/');
	const kaart = page.getByRole('region', { name: 'Laatste trein naar huis' });
	await expect(kaart).toBeVisible();
	await expect(kaart).toContainText('Vertrek uiterlijk');
	await kaart.getByRole('button', { name: 'Waarschuw mij' }).click();
	await expect(kaart.getByRole('button', { name: 'Waarschuwing staat aan' })).toBeVisible();

	// Uit te zetten in Instellingen
	await page.goto('/instellingen');
	await page.getByRole('group', { name: 'Laatste trein naar huis' }).getByRole('button', { name: 'Uit' }).click();
	await page.getByRole('button', { name: 'Opslaan' }).click();
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Plan reis' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Laatste trein naar huis' })).toHaveCount(0);
});

test('voertuiginfo: splitsende trein met haakjes per bestemming', async ({ page }) => {
	// Nepdata: oneven ritnummers splitsen onderweg (voorste deel naar Den Haag, achterste naar Rotterdam)
	await page.route('**/api/trein/**', async (route) => {
		const r = await route.fetch({ url: route.request().url().replace(/trein\/\d+/, 'trein/3885') });
		await route.fulfill({ response: r });
	});
	await page.goto('/');
	await kiesPlek(page, /^Van/, 'utrecht c', /Utrecht Centraal/);
	await kiesPlek(page, /^Naar/, 'amsterdam c', /Amsterdam Centraal/);
	await page.getByRole('button', { name: 'Plan reis' }).click();
	await page.locator('a.advies').first().click();
	// Ook in de reistijdlijn: waar hij splitst en in welk deel je moet zitten
	await expect(page.locator('li.rit').getByText(/Deze trein splitst in Leiden Centraal/).first()).toBeVisible();
	await page.getByRole('button', { name: 'Voertuiginfo' }).first().click();
	const paneel = page.getByRole('dialog', { name: 'Voertuiginfo' });
	await expect(paneel.getByText(/Deze trein splitst in Leiden Centraal/)).toBeVisible();
	// Ruwe NS-data is te kopiëren (om het echte formaat te kunnen controleren)
	await paneel.getByText('Ruwe NS-data (voor controle)').click();
	await expect(paneel.getByRole('button', { name: 'Kopieer alles' })).toBeVisible();
	const trein = page.locator('figure.trein');
	await expect(trein.locator('.bestemming', { hasText: 'Den Haag Centraal' })).toBeVisible();
	await expect(trein.locator('.bestemming.jouw', { hasText: 'Rotterdam Centraal' })).toContainText('Jouw deel');
	// Bakken met kenmerken, liggend naast elkaar
	await expect(trein.getByRole('img', { name: /eerste klas/ }).first()).toBeAttached();
	await expect(page.getByRole('heading', { name: 'Over deze trein' })).toBeVisible();
	await expect(page.getByText('Talbot en De Dietrich')).toBeVisible();
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

test('reis onderweg: samenvatting, kaartje, voortgang en alternatieven', async ({ page }) => {
	const fouten: string[] = [];
	page.on('pageerror', (e) => fouten.push(e.message));
	await page.route('https://tiles.openfreemap.org/**', (route) =>
		route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'achtergrond', type: 'background', paint: { 'background-color': '#dde' } }] })
		})
	);
	await page.clock.install({ time: new Date() });
	await page.goto('/');
	await kiesPlek(page, /^Van/, 'oudegr', /Oudegracht 100/);
	await kiesPlek(page, /^Naar/, 'damrak', /Damrak 1/);
	await page.getByRole('button', { name: 'Plan reis' }).click();
	await page.locator('a.advies').first().click();
	await page.getByRole('button', { name: 'Start reis' }).click();
	await page.waitForURL('**/reis');

	// Bovenaan de ritten achter elkaar, zoals bij het zoeken
	await expect(page.locator('header.kop .lijnlabel').first()).toBeVisible();
	// Kaart staat klein in de pagina en kan schermvullend
	await expect(page.getByRole('button', { name: 'Live kaart' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Kaart schermvullend' }).click();
	await expect(page.getByRole('dialog', { name: 'Live kaart' })).toBeVisible();
	// De hele rit staat erop, met de haltes ervoor en erna; hun namen linken naar de stationspagina
	await expect(page.getByText(/zwart: de rest van de rit/)).toBeVisible();
	await expect(page.locator('a.haltelabel[href^="/station?"]', { hasText: 'Beginstation' })).toBeAttached();
	await expect(page.locator('a.haltelabel', { hasText: 'Halte erna' })).toBeAttached();
	await page.getByRole('button', { name: 'Kaart verkleinen' }).click();
	await expect(page.getByRole('dialog', { name: 'Live kaart' })).toHaveCount(0);

	// Halverwege de treinrit: bolletje op de lijn, gepasseerde haltes doorgestreept, snelheid
	const legs = await page.evaluate(() => {
		const r = JSON.parse(localStorage.getItem('lokaal:reizen') ?? '[]')[0];
		return r.advies.legs.map((l: { modus: string; vertrek: { verwacht: string }; aankomst: { verwacht: string } }) => [l.modus, l.vertrek.verwacht, l.aankomst.verwacht]);
	});
	const trein = legs.find((l: string[]) => l[0] === 'trein');
	await page.clock.fastForward(Math.round((Date.parse(trein[1]) + Date.parse(trein[2])) / 2 - Date.now()));
	await expect(page.getByRole('img', { name: 'Hier ben je nu ongeveer' })).toBeVisible();
	await expect(page.locator('li.rit.actief .halte-naam.voorbij').first()).toBeVisible();
	await expect(page.getByText(/km\/u/)).toBeVisible();

	// Andere opties: inklapbaar, zonder knoppen; kiezen gaat op de detailpagina
	await page.getByRole('button', { name: 'Andere opties' }).click();
	const kop = page.getByRole('button', { name: /^Alternatieven vanaf/ });
	await expect(page.locator('#alt-lijst a.advies').first()).toBeVisible();
	await expect(page.getByRole('button', { name: 'Kies dit alternatief' })).toHaveCount(0);
	await kop.click();
	await expect(page.locator('#alt-lijst')).toHaveCount(0);
	await kop.click();
	await page.locator('#alt-lijst a.advies').first().click();
	await page.getByRole('button', { name: 'Kies dit alternatief' }).click();
	await page.waitForURL('**/reis');
	expect(fouten).toEqual([]);
});

test('station: vanuit een overstap naar de stationspagina met sporen, kaart en voorzieningen', async ({ page }) => {
	const fouten: string[] = [];
	page.on('pageerror', (e) => fouten.push(e.message));
	await page.route('https://tiles.openfreemap.org/**', (route) =>
		route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'achtergrond', type: 'background', paint: { 'background-color': '#dde' } }] })
		})
	);
	await page.goto('/');
	await kiesPlek(page, /^Van/, 'amersfoort', /Amersfoort Centraal/);
	await kiesPlek(page, /^Naar/, 'amsterdam c', /Amsterdam Centraal/);
	await page.getByRole('button', { name: 'Plan reis' }).click();
	await page.locator('a.advies', { has: page.locator('.lijnlabel').nth(1) }).first().click();
	// Stationsicoon bij elke treinhalte
	await expect(page.getByRole('link', { name: /^Station / }).first()).toBeVisible();
	// Overstap uitklappen: link naar het station met beide sporen
	await page.locator('button.overstap').first().click();
	await page.locator('a.stationrij').first().click();
	await page.waitForURL(/\/station\?.*aankomst=/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Utrecht Centraal');
	await expect(page.getByText(/Overstap:/)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Plattegrond' })).toBeVisible();
	await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(1);
	await expect(page.getByRole('heading', { name: 'Sporen' })).toBeVisible();
	await expect(page.getByText('143 fietsen beschikbaar')).toBeVisible();
	// Vertrektijden van dit station
	await page.getByRole('button', { name: 'Vertrektijden' }).click();
	await page.waitForURL('**/vertrektijden');
	await expect(page.getByText(/Ververst elke 30 s/)).toBeVisible();
	expect(fouten).toEqual([]);
});
