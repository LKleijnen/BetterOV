// Plekken compact in URL-parameters zetten en weer uitlezen (client en server).

import type { Plek, PlekType } from './types';

export function plekNaarParams(prefix: string, p: Plek | undefined, params: URLSearchParams): void {
	if (!p) return;
	params.set(prefix, `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`);
	params.set(`${prefix}Naam`, p.naam);
	if (p.stopId) params.set(`${prefix}Stop`, p.stopId);
	if (p.type) params.set(`${prefix}Type`, p.type);
	if (p.omschrijving) params.set(`${prefix}Oms`, p.omschrijving);
}

export function plekUitParams(prefix: string, params: URLSearchParams): Plek | undefined {
	const coord = params.get(prefix);
	if (!coord) return undefined;
	const [lat, lon] = coord.split(',').map(Number);
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
	return {
		lat,
		lon,
		naam: params.get(`${prefix}Naam`) || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
		stopId: params.get(`${prefix}Stop`) || undefined,
		type: (params.get(`${prefix}Type`) as PlekType) || undefined,
		omschrijving: params.get(`${prefix}Oms`) || undefined
	};
}
