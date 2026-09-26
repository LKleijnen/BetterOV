<script lang="ts">
	import { ChevronDown, CircleX, Info, TrainFront, TriangleAlert, Repeat, Map as KaartIcoon } from '@lucide/svelte';
	import type { Advies, Leg, TreinInfo } from '$lib/types';
	import { isOV, legNaam, overstappen, spoorGewijzigd } from '$lib/reis';
	import { klok } from '$lib/tijd';
	import Tijd from './Tijd.svelte';
	import LijnLabel from './LijnLabel.svelte';
	import Drukte from './Drukte.svelte';
	import ModusIcoon from './ModusIcoon.svelte';

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

	const overstapPerLeg = $derived(new Map(overstappen(advies).map((o) => [o.naarLeg, o])));
	let open = $state<Record<number, boolean>>({});

	function perron(leg: Leg) {
		return leg.modus === 'trein' ? 'Spoor' : 'Perron';
	}
</script>

<ol class="tijdlijn lijst">
	{#each advies.legs as leg, i (i)}
		{@const overstap = overstapPerLeg.get(i)}
		{#if overstap}
			<li class="overstap" class:krap={overstap.krap} class:onhaalbaar={!overstap.haalbaar}>
				{#if !overstap.haalbaar}
					<CircleX size={18} aria-hidden="true" />
					<span><strong>Overstap niet haalbaar</strong> · {overstap.marge} min in {overstap.halte}</span>
				{:else if overstap.krap}
					<TriangleAlert size={18} aria-hidden="true" />
					<span><strong>Krappe overstap: {overstap.marge} min</strong> in {overstap.halte}{#if overstap.looptijd} ({overstap.looptijd} min lopen){/if}</span>
				{:else}
					<Repeat size={18} aria-hidden="true" />
					<span><strong>{overstap.marge} min</strong> overstaptijd in {overstap.halte}{#if overstap.looptijd} (incl. {overstap.looptijd} min lopen){/if}</span>
				{/if}
			</li>
		{/if}

		{#if isOV(leg)}
			{@const info = treinInfo[i]}
			<li class="leg ov" class:actief={actieveLeg === i} class:uitgevallen={leg.uitgevallen}>
				<div class="halte">
					<div class="tijdkolom"><Tijd tijd={leg.vertrek} uitgevallen={leg.uitgevallen || leg.van.uitgevallen} /></div>
					<div class="punt" aria-hidden="true"></div>
					<div class="naamkolom">
						<div class="rij tussen">
							<strong class="halte-naam">{leg.van.naam}</strong>
							{#if leg.van.spoor}
								<span class="spoor" class:gewijzigd={spoorGewijzigd(leg.van)}>
									{perron(leg)} <strong>{leg.van.spoor}</strong>
									{#if spoorGewijzigd(leg.van)}<span class="klein"> (was {leg.van.geplandSpoor})</span>{/if}
								</span>
							{/if}
						</div>
					</div>
				</div>

				<div class="rit">
					<div class="lijnrij rij">
						<LijnLabel {leg} />
						<span class="richting">{legNaam(leg)} richting <strong>{leg.richting ?? leg.naar.naam}</strong></span>
					</div>
					<div class="rij extra klein">
						{#if leg.vervoerder}<span class="zwak">{leg.vervoerder}</span>{/if}
						{#if leg.isNS && leg.drukte}<Drukte drukte={leg.drukte} />{/if}
						{#if info?.aantalBakken}<span class="zwak">{info.aantalBakken} bakken</span>{/if}
					</div>

					{#if leg.uitgevallen}
						<div class="melding fout klein"><CircleX size={16} /> <span><strong>Rijdt niet.</strong> {leg.meldingen[0]?.kop ?? ''}</span></div>
					{/if}
					{#if info?.ingekort}
						<div class="melding waarschuwing klein" role="note">
							<TriangleAlert size={16} />
							<span>
								<strong>Kortere trein</strong>{#if info.aantalBakken && info.normaalBakken}: {info.aantalBakken} i.p.v. {info.normaalBakken} bakken{/if}.
								{info.instapadvies?.samenvatting[0] ?? ''}
							</span>
						</div>
					{/if}
					{#each leg.meldingen.slice(leg.uitgevallen ? 1 : 0, 3) as m, j (j)}
						<div class="melding {m.ernst === 'ernstig' ? 'fout' : m.ernst === 'waarschuwing' ? 'waarschuwing' : 'info'} klein">
							<Info size={16} /> <span><strong>{m.kop}</strong>{#if m.tekst} {m.tekst}{/if}</span>
						</div>
					{/each}

					<div class="rij acties">
						{#if leg.tussenstops.length > 0}
							<button type="button" class="knop tweede klein" aria-expanded={!!open[i]} onclick={() => (open[i] = !open[i])}>
								<ChevronDown size={16} style="transform: rotate({open[i] ? 180 : 0}deg)" />
								{leg.tussenstops.length} {leg.tussenstops.length === 1 ? 'tussenstop' : 'tussenstops'}
							</button>
						{/if}
						{#if onVoertuig}
							<button type="button" class="knop tweede klein" onclick={() => onVoertuig(i)}>
								<TrainFront size={16} /> {leg.isNS ? 'Trein & instapadvies' : 'Voertuiginfo'}
							</button>
						{/if}
						{#if onKaart}
							<button type="button" class="knop tweede klein" onclick={() => onKaart(i)}><KaartIcoon size={16} /> Kaart</button>
						{/if}
					</div>

					{#if open[i]}
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

				<div class="halte">
					<div class="tijdkolom"><Tijd tijd={leg.aankomst} uitgevallen={leg.uitgevallen || leg.naar.uitgevallen} /></div>
					<div class="punt" aria-hidden="true"></div>
					<div class="naamkolom">
						<div class="rij tussen">
							<strong class="halte-naam">{leg.naar.naam}</strong>
							{#if leg.naar.spoor}
								<span class="spoor" class:gewijzigd={spoorGewijzigd(leg.naar)}>{perron(leg)} <strong>{leg.naar.spoor}</strong></span>
							{/if}
						</div>
						{#if leg.naar.uitgevallen}<span class="klein status-fout">Stopt hier niet</span>{/if}
					</div>
				</div>
			</li>
		{:else if leg.duur >= 30}
			<li class="leg lopen" class:actief={actieveLeg === i}>
				<div class="rij">
					<span class="tijdkolom klein zwak getal">{klok(leg.vertrek.verwacht)}</span>
					<ModusIcoon modus={leg.modus} grootte={18} />
					<span>
						{Math.max(1, Math.round(leg.duur / 60))} min {leg.modus === 'fiets' ? 'fietsen' : 'lopen'} naar {leg.naar.naam}
						{#if leg.afstand}<span class="zwak klein">({leg.afstand >= 1000 ? `${(leg.afstand / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(leg.afstand / 10) * 10} m`})</span>{/if}
					</span>
					{#if onKaart}
						<button type="button" class="icoonknop klein-knop" aria-label="Looproute op de kaart" onclick={() => onKaart(i)}><KaartIcoon size={16} /></button>
					{/if}
				</div>
			</li>
		{/if}
	{/each}
</ol>

<style>
	.tijdlijn {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.leg.ov {
		background: var(--kaart);
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.leg.actief {
		outline: 3px solid var(--primair);
		outline-offset: -1px;
	}
	.leg.uitgevallen {
		border-color: var(--fout);
	}
	.halte {
		display: grid;
		grid-template-columns: 64px 14px 1fr;
		align-items: baseline;
		gap: 8px;
	}
	.tijdkolom {
		min-width: 0;
	}
	.punt {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 3px solid var(--tekst);
		background: var(--kaart);
		align-self: center;
	}
	.halte-naam {
		font-size: 1.02rem;
	}
	.spoor {
		white-space: nowrap;
		padding: 1px 8px;
		border-radius: 8px;
		background: var(--kaart-2);
		font-size: 0.9rem;
	}
	.spoor strong {
		font-size: 1.05rem;
	}
	.spoor.gewijzigd {
		background: var(--vertraagd-zacht);
		color: var(--vertraagd);
		outline: 2px solid var(--vertraagd);
	}
	.rit {
		margin-left: 68px;
		padding-left: 14px;
		border-left: 3px solid var(--rand);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.lijnrij {
		flex-wrap: wrap;
	}
	.extra {
		flex-wrap: wrap;
		gap: 4px 12px;
	}
	.acties {
		flex-wrap: wrap;
		gap: 6px;
	}
	.tussenstops {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 4px 0;
	}
	.tijdje {
		min-width: 64px;
	}
	.tussenstops .uitgevallen {
		text-decoration: line-through;
		color: var(--tekst-zwak);
	}
	.leg.lopen {
		padding: 4px 12px;
		color: var(--tekst-zwak);
	}
	.leg.lopen .tijdkolom {
		width: 56px;
	}
	.klein-knop {
		width: 36px;
		height: 36px;
		margin-left: auto;
	}
	.overstap {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-radius: var(--radius-klein);
		background: var(--kaart-2);
		font-size: 0.92rem;
	}
	.overstap.krap,
	.overstap.onhaalbaar {
		background: var(--fout-zacht);
		color: var(--fout);
	}
	.overstap.krap span,
	.overstap.onhaalbaar span {
		color: var(--tekst);
	}
	.overstap :global(svg) {
		flex: 0 0 auto;
	}
	@media (max-width: 380px) {
		.halte {
			grid-template-columns: 56px 12px 1fr;
		}
		.rit {
			margin-left: 58px;
		}
	}
</style>
