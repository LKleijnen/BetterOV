import { error } from '@sveltejs/kit';
import { config } from '$lib/server/config';
import type { RequestHandler } from './$types';

// Proxy voor Firebase Auth (/__/auth/* en /__/firebase/*), zodat inloggen via redirect
// ook werkt in Safari en in een op het beginscherm geïnstalleerde PWA.
// Zie https://firebase.google.com/docs/auth/web/redirect-best-practices (optie 3).
const proxy: RequestHandler = async ({ params, url, request }) => {
	const projectId = config().projectId;
	if (!projectId || !/^(auth|firebase)(\/|$)/.test(params.pad)) error(404, 'Niet gevonden');
	const doel = `https://${projectId}.firebaseapp.com/__/${params.pad}${url.search}`;
	const kop = new Headers(request.headers);
	kop.delete('host');
	const antwoord = await fetch(doel, {
		method: request.method,
		headers: kop,
		body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
		redirect: 'manual'
	});
	return new Response(antwoord.body, { status: antwoord.status, headers: antwoord.headers });
};

export const GET = proxy;
export const POST = proxy;
