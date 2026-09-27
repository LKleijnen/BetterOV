// Positie van een trein of bus: GPS van NS als die er is, anders geschat uit de dienstregeling
// (over het spoor als de spoorkaart beschikbaar is).

import type { Leg, VoertuigPositie } from '$lib/types';
import { isOV } from '$lib/reis';
import { geschattePositie } from '$lib/voertuig';
import { api } from './api';
import { legLijnOverSpoor } from './spoorkaart';

export async function voertuigPositie(leg: Leg | undefined): Promise<VoertuigPositie | null> {
	if (!leg || !isOV(leg)) return null;
	if (leg.isNS && leg.ritnummer) {
		const gps = await api<VoertuigPositie | null>(`/api/voertuig?ritnummer=${leg.ritnummer}`).catch(() => null);
		if (gps) return gps;
	}
	return geschattePositie(leg, Date.now(), await legLijnOverSpoor(leg));
}
