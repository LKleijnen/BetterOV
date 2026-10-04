<script lang="ts">
	import { ArrowLeftRight, Building2, ChevronDown, CircleX, Hourglass, Info, Map as KaartIcoon, Split, TrainFront, TriangleAlert } from '@lucide/svelte';
	import type { Advies, Leg, TreinInfo } from '$lib/types';
	import { isOV, overstappen, type Overstap } from '$lib/reis';
	import { duurTekst, klok } from '$lib/tijd';
	import Tijd from './Tijd.svelte';
	import LijnLabel from './LijnLabel.svelte';
	import Drukte from './Drukte.svelte';
	import ModusIcoon from './ModusIcoon.svelte';
	import Spoor from './Spoor.svelte';
	import { heeftVoertuiginfo } from '$lib/voertuig';
	import { untrack } from 'svelte';
	import { plekOpLijn, ritVoortgang, spreidPosities, stopPosities, stopTijden, voorbij } from '$lib/voortgang';
	import { splitsTekst } from '$lib/splitsen';

	let {
		advies,
		treinInfo = {},
		actieveLeg = -1,
		nu,
		onVoertuig,
		onKaart
	}: {
		advies: Advies;
		treinInfo?: Record<number, TreinInfo | undefined>;
		actieveLeg?: number;
		/** Tijdens de reis: tijdstip in ms, voor het bolletje op de lijn en het doorstrepen van haltes */
		nu?: number;
		onVoertuig?: (index: number) => void;
		onKaart?: (index: number) => void;
	} = $props();

	type Item =
		| { soort: 'rit'; i: number; leg: Leg }
		| { soort: 'lopen'; i: number; leg: Leg }
		| { soort: 'overstap'; o: Overstap; lopen: { i: number; leg: Leg }[] };

	// Looplegs tussen twee ritten horen bij de overstap; lopen aan begin en eind staat los
	const items = $derived.by((): Item[] => {
		const o = overstappen(advies);
		const inOverstap = new Set(o.flatMap((x) => Array.from({ length: x.naarLeg - x.vanLeg - 1 }, (_, k) => x.vanLeg + 1 + k)));
		const lijst: Item[] = [];
		advies.legs.forEach((leg, i) => {
			const overstap = o.find((x) => x.naarLeg === i);
			if (overstap) {
				const lopen = advies.legs
					.slice(overstap.vanLeg + 1, i)
					.map((l, k) => ({ i: overstap.vanLeg + 1 + k, leg: l }))
					.filter((x) => x.leg.duur >= 30);
				lijst.push({ soort: 'overstap', o: overstap, lopen });
			}
			if (isOV(leg)) lijst.push({ soort: 'rit', i, leg });
			else if (!inOverstap.has(i) && leg.duur >= 30) lijst.push({ soort: 'lopen', i, leg });
		});
		return lijst;
	});

	let tussenstopsOpen = $state<Record<number, boolean>>({});
	// Tijdens de reis staan de tussenstops van de rit waarin je zit open, tenzij je ze dichtklapt
	const stopsOpen = (i: number) => tussenstopsOpen[i] ?? (nu !== undefined && i === actieveLeg);

	// ---------- Tussenstops op de lijn, op tijd verdeeld, en het bolletje van de voortgang ----------
	/** Gemeten per rit (px vanaf de bovenkant van de rit): midden van het vertrek- en aankomstpunt,
	 *  de hoogte van het middenstuk (de lijn tussen de twee haltes) en hoe ver de regel van het vertrek-
	 *  en aankomststation onder en boven het punt doorloopt */
	interface Maat {
		van: number;
		naar: number;
		midden: number;
		vanRand: number;
		naarRand: number;
	}
	let maten = $state<Record<number, Maat>>({});

	/** Meet een rit, en opnieuw als hij groter of kleiner wordt */
	function meetRit(i: number) {
		return (rit: HTMLElement) => {
			const meet = () => {
				// Absolute posities rekenen vanaf binnen de rand
				const basis = rit.getBoundingClientRect().top + rit.clientTop;
				const midden = (sel: string) => {
					const r = rit.querySelector(sel)?.getBoundingClientRect();
					return r ? r.top + r.height / 2 - basis : NaN;
				};
				const rij = (sel: string) => rit.querySelector(sel)?.closest('.halte')?.getBoundingClientRect();
				const van = midden('[data-punt="van"]');
				const naar = midden('[data-punt="naar"]');
const blok = rit.querySelector('.midden')?.getBoundingClientRect();
				const m: Maat = {
					van: Math.round(van),
					naar: Math.round(naar),
					vanRand: Math.round((rij('[data-punt="van"]')?.bottom ?? NaN) - basis - van),
					naarRand: Math.round(naar - ((rij('[data-punt="naar"]')?.top ?? NaN) - basis)),
midden: Math.round(blok?.height ?? NaN)
				};
				if (!Object.values(m).every(Number.isFinite)) return;
				const oud = untrack(() => maten[i]);
				if (oud && oud.van === m.van && oud.naar === m.naar && oud.midden === m.midden && oud.vanRand === m.vanRand && oud.naarRand === m.naarRand) return;
				maten[i] = m;
			};
			// Eén frame later meten: de nieuwe maten veranderen de rit zelf weer (geen ResizeObserver-lus)
			let frame = 0;
			const ro = new ResizeObserver(() => {
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame(meet);
			});
			ro.observe(rit);
			meet();
			return () => {
				cancelAnimationFrame(frame);
				ro.disconnect();
				delete maten[i];
			};
		};
	}

	const STOP_AFSTAND = 24; // minimale afstand tussen twee uitgeklapte tussenstops (px)
	const STOP_RUIMTE = 34; // gemiddelde ruimte per uitgeklapte tussenstop (px)
	const STOP_MARGE = 14; // afstand van een uitgeklapte tussenstop tot de regel van het vertrek- of aankomststation (px)

	/**
	 * Waar de haltes van een rit op de lijn staan (px vanaf de bovenkant van de rit, vertrek en aankomst
	 * meegeteld) en hoe hoog het middenstuk daarvoor moet zijn. Ingeklapt is de lijn altijd ongeveer even
	 * lang en staan de stipjes puur op tijd; uitgeklapt op tijd, met genoeg ruimte voor de namen.
	 */
	function lijnVan(i: number, leg: Leg): { ys: number[]; midden: number } | null {
		const m = maten[i];
		if (!m) return null;
		const posities = stopPosities(stopTijden(leg, true));
		const n = leg.tussenstops.length;
		// Alleen het middenstuk bepaalt hoe lang de lijn is; de rest (halve haltes) blijft gelijk
		const vast = m.naar - m.van - m.midden;
		const minLengte = vast + 20;
		const rel =
			stopsOpen(i) && n > 0
				? spreidPosities(posities, (n + 1) * STOP_RUIMTE, STOP_AFSTAND, m.vanRand + STOP_MARGE, m.naarRand + STOP_MARGE)
				: posities.map((p) => p * Math.max(minLengte, Math.min(140, 80 + 6 * n)));
		rel[rel.length - 1] = Math.max(rel[rel.length - 1], minLengte);
		return { ys: rel.map((y) => m.van + y), midden: Math.round(rel[rel.length - 1] - vast) };
	}

	const lijnen = $derived.by(() => {
		const uit: Record<number, ReturnType<typeof lijnVan>> = {};
		advies.legs.forEach((leg, i) => {
			if (isOV(leg)) uit[i] = lijnVan(i, leg);
		});
		return uit;
	});

	/** Bolletje op de lijn van de rit waarin je zit */
	const bolletje = $derived.by(() => {
		if (nu === undefined || actieveLeg < 0) return null;
		const leg = advies.legs[actieveLeg];
		const lijn = lijnen[actieveLeg];
		if (!leg || !isOV(leg) || !lijn) return null;
		const plek = ritVoortgang(stopTijden(leg, true), nu);
		return plek ? plekOpLijn(lijn.ys, plek) : null;
	});
	let overstapOpen = $state<Record<number, boolean>>({});

	function afstand(m: number) {
		return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`;
	}

	/** Link naar de stationspagina; bij een overstap met de sporen erbij */
	function stationLink(h: { naam: string; lat: number; lon: number }, sporen: { aankomst?: string; vertrek?: string } = {}): string {
		const q = new URLSearchParams({ naam: h.naam, lat: String(h.lat), lon: String(h.lon) });
		if (sporen.aankomst) q.set('aankomst', sporen.aankomst);
		if (sporen.vertrek) q.set('vertrek', sporen.vertrek);
		return `/station?${q}`;
	}

	function lijnKleur(leg: Leg): string {
		if (leg.isNS) return '#ffc917';
		return leg.kleur ?? 'var(--primair)';
	}
</script>

{#snippet looprij(leg: Leg, i: number)}
	<div class="rij looprij">
		<ModusIcoon modus={leg.modus} grootte={16} />
		<span class="flex">
			{Math.max(1, Math.round(leg.duur / 60))} min {leg.modus === 'fiets' ? 'fietsen' : 'lopen'}{leg.naar.naam ? ` naar ${leg.naar.naam}` : ''}
			{#if leg.afstand}<span class="zwak">· {afstand(leg.afstand)}</span>{/if}
		</span>
		{#if onKaart}
			<button type="button" class="icoonknop klein-knop" aria-label="Looproute op de kaart" onclick={() => onKaart(i)}><KaartIcoon size={16} /></button>
		{/if}
	</div>
{/snippet}

<ol class="tijdlijn lijst">
	{#each items as item, n (n)}
		{#if item.soort === 'overstap'}
			{@const o = item.o}
			{@const open = !!overstapOpen[o.naarLeg]}
			<li class="overstap-blok">
				<button
					type="button"
					class="overstap"
					class:krap={o.krap && o.haalbaar}
					class:onhaalbaar={!o.haalbaar}
					aria-expanded={open}
					onclick={() => (overstapOpen[o.naarLeg] = !open)}
				>
					{#if !o.haalbaar}<CircleX size={16} aria-hidden="true" />{:else if o.krap}<TriangleAlert size={16} aria-hidden="true" />{:else}<ArrowLeftRight size={16} aria-hidden="true" />{/if}
					<span class="flex">
						{#if !o.haalbaar}<strong>Overstap niet haalbaar</strong>{:else if o.krap}<strong>Krappe overstap</strong>{:else}Overstap{/if}
						· <strong>{o.overstaptijd} min</strong>
					</span>
					<ChevronDown size={16} aria-hidden="true" style="transform: rotate({open ? 180 : 0}deg)" />
				</button>
				{#if open}
					{@const aankomst = advies.legs[o.vanLeg]}
					{@const vertrek = advies.legs[o.naarLeg]}
					<div class="opbouw">
						{#if aankomst?.modus === 'trein' && vertrek?.modus === 'trein'}
							<a class="rij looprij stationrij" href={stationLink(vertrek.van, { aankomst: aankomst.naar.spoor, vertrek: vertrek.van.spoor })}>
								<Building2 size={16} aria-hidden="true" />
								<span class="flex">
									Station {vertrek.van.naam}{#if aankomst.naar.spoor && vertrek.van.spoor}: spoor {aankomst.naar.spoor} → {vertrek.van.spoor}{/if}
								</span>
							</a>
						{/if}
						{#each item.lopen as l (l.i)}{@render looprij(l.leg, l.i)}{/each}
						<div class="rij looprij" class:status-fout={o.marge < 0}>
							<Hourglass size={16} aria-hidden="true" />
							<span class="flex">{o.marge >= 0 ? `${o.marge} min wachten` : `${-o.marge} min te laat voor de aansluiting`}</span>
						</div>
					</div>
				{/if}
			</li>
		{:else if item.soort === 'lopen'}
			<li class="los-lopen" class:actief={actieveLeg === item.i}>
				<span class="tijdkolom klein zwak getal">{klok(item.leg.vertrek.verwacht)}</span>
				<span class="lijnkolom"><span class="stippel"></span></span>
				{@render looprij(item.leg, item.i)}
			</li>
		{:else}
			{@const leg = item.leg}
			{@const i = item.i}
			{@const info = treinInfo[i]}
			{@const splits = splitsTekst(info)}
			{@const trein = leg.modus === 'trein'}
			{@const vertrokken = nu !== undefined && voorbij(leg.vertrek, nu)}
			{@const aangekomen = nu !== undefined && voorbij(leg.aankomst, nu)}
			{@const lijn = lijnen[i]}
			{@const open = stopsOpen(i) && leg.tussenstops.length > 0}
			<li class="rit" class:actief={actieveLeg === i} class:uitgevallen={leg.uitgevallen} style:--lijnkleur={lijnKleur(leg)} {@attach meetRit(i)}>
				{#if lijn}
					<span class="lijnstuk" style:top="{lijn.ys[0]}px" style:height="{lijn.ys[lijn.ys.length - 1] - lijn.ys[0]}px" aria-hidden="true"></span>
					{#each leg.tussenstops as t, k (k)}
						<span
							class="stopje"
							class:voorbij={nu !== undefined && voorbij(t.vertrek ?? t.aankomst, nu)}
							class:uitgevallen={t.uitgevallen}
							style:top="{lijn.ys[k + 1]}px"
							aria-hidden="true"
						></span>
					{/each}
					{#if open}
						<ol class="lijst tussenstops klein" aria-label="Tussenstops">
							{#each leg.tussenstops as t, k (k)}
								<li
									class="rij"
									class:uitgevallen={t.uitgevallen}
									class:voorbij={nu !== undefined && voorbij(t.vertrek ?? t.aankomst, nu)}
									style:top="{lijn.ys[k + 1]}px"
								>
									<span class="getal tijdje"><Tijd tijd={t.vertrek ?? t.aankomst} uitgevallen={t.uitgevallen} /></span>
									<span class="stopnaam">{t.naam}</span>
									{#if t.uitgevallen}<span class="status-fout">vervalt</span>{/if}
								</li>
							{/each}
						</ol>
					{/if}
					{#if actieveLeg === i && bolletje !== null}
						<span class="bolletje" style:top="{bolletje}px" role="img" aria-label="Hier ben je nu ongeveer"></span>
					{/if}
				{/if}
				<div class="ritinfo">
					<div class="rij lijnrij">
						<LijnLabel {leg} />
						<span class="richting">richting <strong>{leg.richting ?? leg.naar.naam}</strong></span>
						{#if leg.isNS && leg.drukte}<Drukte drukte={leg.drukte} tekst={false} />{/if}
						{#if info?.aantalBakken && !info.ingekort}<span class="zwak klein">{info.aantalBakken} bakken</span>{/if}
					</div>

					{#if leg.uitgevallen}
						<div class="melding fout klein"><CircleX size={16} /> <span><strong>Rijdt niet.</strong> {leg.meldingen[0]?.kop ?? ''}</span></div>
					{/if}
					{#if info?.ingekort}
						<div class="melding waarschuwing klein" role="note">
							<TriangleAlert size={16} />
							<span><strong>Kortere trein</strong>{#if info.aantalBakken && info.normaalBakken}: {info.aantalBakken} i.p.v. {info.normaalBakken} bakken{/if}</span>
						</div>
					{/if}
					{#if splits}
						<div class="melding info klein" role="note">
							<Split size={16} />
							<span><strong>{splits.kop}.</strong> {splits.jouw}</span>
						</div>
					{/if}
					{#each leg.meldingen.slice(leg.uitgevallen ? 1 : 0, 3) as m, j (j)}
						<details class="melding {m.ernst === 'ernstig' ? 'fout' : m.ernst === 'waarschuwing' ? 'waarschuwing' : 'info'} klein">
							<summary><Info size={15} /> <span>{m.kop}</span></summary>
							{#if m.tekst}<p>{m.tekst}</p>{/if}
						</details>
					{/each}

					<div class="rij acties">
						{#if leg.tussenstops.length > 0}
							<button type="button" class="tekstknop" aria-expanded={open} onclick={() => (tussenstopsOpen[i] = !stopsOpen(i))}>
								{leg.tussenstops.length} {leg.tussenstops.length === 1 ? 'tussenstop' : 'tussenstops'}
								<ChevronDown size={15} style="transform: rotate({open ? 180 : 0}deg)" />
							</button>
						{/if}
						{#if onVoertuig && heeftVoertuiginfo(leg)}
							<button type="button" class="tekstknop" onclick={() => onVoertuig(i)}>
								<TrainFront size={15} /> Voertuiginfo
							</button>
						{/if}
						<span class="flex"></span>
						{#if onKaart}
							<button type="button" class="icoonknop klein-knop" aria-label="Rit op de kaart" onclick={() => onKaart(i)}><KaartIcoon size={16} /></button>
						{/if}
					</div>

				</div>

				<div class="halte">
					<span class="tijdkolom"><Tijd tijd={leg.vertrek} uitgevallen={leg.uitgevallen || leg.van.uitgevallen} stapel /></span>
					<span class="lijnkolom"><span class="punt" data-punt="van"></span></span>
					<span class="naamkolom">
						<span class="naamlink">
							<strong class="halte-naam" class:voorbij={vertrokken}>{leg.van.naam}</strong>
							{#if trein}<a class="stationlink" href={stationLink(leg.van)} aria-label="Station {leg.van.naam}"><Building2 size={15} /></a>{/if}
						</span>
						<Spoor halte={leg.van} {trein} />
					</span>
				</div>

				<div class="midden" class:gemeten={!!lijn} style:height={lijn ? `${lijn.midden}px` : undefined}>
					<span class="tijdkolom duur zwak klein getal">{duurTekst(leg.duur)}</span>
					<span class="lijnkolom">{#if !lijn}<span class="balk"></span>{/if}</span>
				</div>

				<div class="halte">
					<span class="tijdkolom"><Tijd tijd={leg.aankomst} uitgevallen={leg.uitgevallen || leg.naar.uitgevallen} stapel /></span>
					<span class="lijnkolom"><span class="punt" data-punt="naar"></span></span>
					<span class="naamkolom">
						<span class="naamlink">
							<strong class="halte-naam" class:voorbij={aangekomen}>{leg.naar.naam}</strong>
							{#if trein}<a class="stationlink" href={stationLink(leg.naar)} aria-label="Station {leg.naar.naam}"><Building2 size={15} /></a>{/if}
						</span>
						<Spoor halte={leg.naar} {trein} />
					</span>
				</div>
				{#if leg.naar.uitgevallen}<p class="klein status-fout stopt-niet">Stopt hier niet</p>{/if}
			</li>
		{/if}
	{/each}
</ol>

<style>
	.tijdlijn {
		--tijd: 58px;
		--lijn: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.rit {
		background: var(--kaart);
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		padding: 10px 12px;
	}
	.rit {
		position: relative;
	}
	.rit.actief {
		outline: 3px solid var(--primair);
		outline-offset: -1px;
	}
/* Midden van de lijnkolom: padding + tijdkolom + kolomafstand + halve lijnkolom */
	.bolletje,
	.stopje {
		position: absolute;
		left: calc(12px + var(--tijd) + 8px + var(--lijn) / 2);
		transform: translate(-50%, -50%);
		border-radius: 50%;
		pointer-events: none;
	}
	.stopje {
		width: 9px;
		height: 9px;
		background: var(--kaart);
		border: 2px solid var(--tekst-zwak);
		z-index: 1;
	}
	.stopje.voorbij {
		background: var(--tekst-zwak);
	}
	.stopje.uitgevallen {
		border-color: var(--fout);
	}
	.bolletje {
		width: 16px;
		height: 16px;
		background: var(--primair);
		border: 3px solid #fff;
		box-shadow: 0 0 0 2px var(--primair), 0 2px 6px rgb(0 0 0 / 30%);
		z-index: 2;
		transition: top 0.8s ease;
	}
	.halte-naam.voorbij,
	.tussenstops .voorbij .stopnaam {
		text-decoration: line-through;
		text-decoration-thickness: 1px;
		color: var(--tekst-zwak);
	}
	.tussenstops .voorbij {
		color: var(--tekst-zwak);
	}
	.rit.uitgevallen {
		border-color: var(--fout);
	}
	.halte,
	.midden,
	.los-lopen {
		display: grid;
		grid-template-columns: var(--tijd) var(--lijn) 1fr;
		column-gap: 8px;
	}
	.halte {
		align-items: center;
		min-height: 30px;
	}
	.naamkolom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-width: 0;
	}
	.halte-naam {
		font-size: 1rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.naamlink {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}
	.stationlink {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		color: var(--tekst-zwak);
	}
	.stationlink:active {
		background: var(--kaart-2);
	}
	.stationrij {
		color: var(--primair);
		text-decoration: none;
	}
	.lijnkolom {
		position: relative;
		display: flex;
		justify-content: center;
		align-self: stretch;
	}
	.punt {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 3px solid var(--tekst);
		background: var(--kaart);
		align-self: center;
		position: relative;
		z-index: 1;
	}
	.balk {
		width: 5px;
		background: var(--lijnkleur);
		border-radius: 3px;
		margin: -6px 0;
	}
	.stippel {
		width: 0;
		border-left: 3px dotted var(--tekst-zwak);
	}
	.duur {
		align-self: center;
	}
	/* Lijn, richting, meldingen en knoppen staan boven het vertrek, zodat de lijn helemaal vrij is voor de tussenstops */
	.ritinfo {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 0 6px;
		min-width: 0;
	}
	.midden:not(.gemeten) {
		min-height: 56px;
	}
	/* De lijn van vertrekpunt tot aankomstpunt (na het meten; daarvoor de balk in het middenstuk) */
	.lijnstuk {
		position: absolute;
		left: calc(12px + var(--tijd) + 8px + var(--lijn) / 2);
		width: 5px;
		transform: translateX(-50%);
		background: var(--lijnkleur);
		border-radius: 3px;
	}
	.lijnrij {
		flex-wrap: wrap;
		gap: 4px 8px;
	}
	.richting {
		font-size: 0.92rem;
	}
	.acties {
		flex-wrap: wrap;
		gap: 2px 14px;
	}
	.flex {
		flex: 1;
		min-width: 0;
	}
	.klein-knop {
		width: 34px;
		height: 34px;
	}
	details.melding {
		display: block;
	}
	details.melding summary {
		display: flex;
		gap: 6px;
		align-items: flex-start;
		list-style: none;
		cursor: pointer;
	}
	details.melding summary::-webkit-details-marker {
		display: none;
	}
	details.melding p {
		margin: 6px 0 0 21px;
	}
	/* Uitgeklapte tussenstops: naam naast het eigen stipje op de lijn */
	.tussenstops li {
		position: absolute;
		left: calc(12px + var(--tijd) + 8px + var(--lijn) + 8px);
		right: 12px;
		transform: translateY(-50%);
		gap: 6px;
		white-space: nowrap;
		line-height: 1.25;
	}
	.stopnaam {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tijdje {
		min-width: 52px;
	}
	.tussenstops .uitgevallen {
		text-decoration: line-through;
		color: var(--tekst-zwak);
	}
	.stopt-niet {
		margin: 0 0 0 calc(var(--tijd) + var(--lijn) + 16px);
	}
	.los-lopen {
		align-items: center;
		padding: 0 12px;
		color: var(--tekst-zwak);
	}
	.los-lopen.actief {
		color: var(--tekst);
	}
	.looprij {
		gap: 8px;
		min-height: 34px;
		font-size: 0.92rem;
	}
	.overstap {
		appearance: none;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px;
		border: 0;
		border-radius: var(--radius-klein);
		background: var(--kaart-2);
		color: var(--tekst);
		font: inherit;
		font-size: 0.92rem;
		text-align: left;
		cursor: pointer;
	}
	.overstap.krap {
		background: var(--vertraagd-zacht);
	}
	.overstap.krap :global(svg:first-child) {
		color: var(--vertraagd);
	}
	.overstap.onhaalbaar {
		background: var(--fout-zacht);
	}
	.overstap.onhaalbaar :global(svg:first-child) {
		color: var(--fout);
	}
	.opbouw {
		padding: 2px 12px 0 36px;
		color: var(--tekst-zwak);
	}
	@media (max-width: 380px) {
		.tijdlijn {
			--tijd: 50px;
			--lijn: 12px;
		}
	}
</style>
