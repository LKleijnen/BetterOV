<script lang="ts">
	import { ArrowLeftRight, ChevronDown, CircleX, Hourglass, Info, Map as KaartIcoon, TrainFront, TriangleAlert } from '@lucide/svelte';
	import type { Advies, Leg, TreinInfo } from '$lib/types';
	import { isOV, overstappen, type Overstap } from '$lib/reis';
	import { duurTekst, klok } from '$lib/tijd';
	import Tijd from './Tijd.svelte';
	import LijnLabel from './LijnLabel.svelte';
	import Drukte from './Drukte.svelte';
	import ModusIcoon from './ModusIcoon.svelte';
	import Spoor from './Spoor.svelte';

	let {
		advies,
		treinInfo = {},
		actieveLeg = -1,
		onVoertuig,
		onKaart
	}: {
		advies: Advies;
		treinInfo?: Record<number, TreinInfo | undefined>;
		actieveLeg?: number;
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
	let overstapOpen = $state<Record<number, boolean>>({});

	function afstand(m: number) {
		return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m / 10) * 10} m`;
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
					<div class="opbouw">
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
			{@const trein = leg.modus === 'trein'}
			<li class="rit" class:actief={actieveLeg === i} class:uitgevallen={leg.uitgevallen} style:--lijnkleur={lijnKleur(leg)}>
				<div class="halte">
					<span class="tijdkolom"><Tijd tijd={leg.vertrek} uitgevallen={leg.uitgevallen || leg.van.uitgevallen} stapel /></span>
					<span class="lijnkolom"><span class="punt"></span></span>
					<span class="naamkolom">
						<strong class="halte-naam">{leg.van.naam}</strong>
						<Spoor halte={leg.van} {trein} />
					</span>
				</div>

				<div class="midden">
					<span class="tijdkolom duur zwak klein getal">{duurTekst(leg.duur)}</span>
					<span class="lijnkolom"><span class="balk"></span></span>
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
						{#each leg.meldingen.slice(leg.uitgevallen ? 1 : 0, 3) as m, j (j)}
							<details class="melding {m.ernst === 'ernstig' ? 'fout' : m.ernst === 'waarschuwing' ? 'waarschuwing' : 'info'} klein">
								<summary><Info size={15} /> <span>{m.kop}</span></summary>
								{#if m.tekst}<p>{m.tekst}</p>{/if}
							</details>
						{/each}

						<div class="rij acties">
							{#if leg.tussenstops.length > 0}
								<button type="button" class="tekstknop" aria-expanded={!!tussenstopsOpen[i]} onclick={() => (tussenstopsOpen[i] = !tussenstopsOpen[i])}>
									{leg.tussenstops.length} {leg.tussenstops.length === 1 ? 'tussenstop' : 'tussenstops'}
									<ChevronDown size={15} style="transform: rotate({tussenstopsOpen[i] ? 180 : 0}deg)" />
								</button>
							{/if}
							{#if onVoertuig}
								<button type="button" class="tekstknop" onclick={() => onVoertuig(i)}>
									<TrainFront size={15} /> {leg.isNS ? 'Trein & instapadvies' : 'Voertuiginfo'}
								</button>
							{/if}
							<span class="flex"></span>
							{#if onKaart}
								<button type="button" class="icoonknop klein-knop" aria-label="Rit op de kaart" onclick={() => onKaart(i)}><KaartIcoon size={16} /></button>
							{/if}
						</div>

						{#if tussenstopsOpen[i]}
							<ol class="lijst tussenstops klein">
								{#each leg.tussenstops as t, k (k)}
									<li class="rij" class:uitgevallen={t.uitgevallen}>
										<span class="getal tijdje"><Tijd tijd={t.vertrek ?? t.aankomst} uitgevallen={t.uitgevallen} /></span>
										<span>{t.naam}</span>
										{#if t.uitgevallen}<span class="status-fout">vervalt</span>{/if}
									</li>
								{/each}
							</ol>
						{/if}
					</div>
				</div>

				<div class="halte">
					<span class="tijdkolom"><Tijd tijd={leg.aankomst} uitgevallen={leg.uitgevallen || leg.naar.uitgevallen} stapel /></span>
					<span class="lijnkolom"><span class="punt"></span></span>
					<span class="naamkolom">
						<strong class="halte-naam">{leg.naar.naam}</strong>
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
	.rit.actief {
		outline: 3px solid var(--primair);
		outline-offset: -1px;
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
	.ritinfo {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 6px 0;
		min-width: 0;
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
	.tussenstops {
		display: flex;
		flex-direction: column;
		gap: 4px;
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
