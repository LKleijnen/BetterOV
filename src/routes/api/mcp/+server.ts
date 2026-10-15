import { mcpGet, mcpLeeg, mcpPost } from '$lib/server/mcp/route';
import type { RequestHandler } from './$types';

// MCP-endpoint ("Streamable HTTP", zonder sessies): hier praat een AI-assistent met BetterOV.
// Inloggen met een MCP-sleutel in de Authorization-kop; dat regelt hooks.server.ts.
// Kan een client geen koppen sturen, dan mag de sleutel ook achter het pad: /api/mcp/<sleutel>.
// Uitleg en het maken van sleutels: /mcp in de app.

export const POST: RequestHandler = ({ request, locals }) => mcpPost(request, locals.gebruiker);
export const GET: RequestHandler = () => mcpGet();
export const DELETE: RequestHandler = () => mcpLeeg();
export const OPTIONS: RequestHandler = () => mcpLeeg();
