// Onraadbare codes en hashes, voor uitnodigingslinks en MCP-sleutels.
// In Firestore bewaren we alleen de hash, zodat de database zelf geen bruikbare codes bevat.

/** Onraadbare code, veilig in een URL of HTTP-kop (24 bytes = 192 bits) */
export function nieuwGeheim(bytes = 24): string {
	const ruw = new Uint8Array(bytes);
	crypto.getRandomValues(ruw);
	return btoa(String.fromCharCode(...ruw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(tekst: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tekst));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
