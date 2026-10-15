import { mcpGet, mcpLeeg, mcpPost } from '$lib/server/mcp/route';
import type { RequestHandler } from './$types';

// Zelfde endpoint als /api/mcp, met de sleutel in het pad. Voor clients (zoals de connectoren van
// claude.ai) die geen eigen HTTP-kop kunnen meesturen. De sleutel staat dan in de URL, dus hij is
// net zo geheim als de URL zelf; de nette manier blijft de Authorization-kop.

export const POST: RequestHandler = ({ request, locals }) => mcpPost(request, locals.gebruiker);
export const GET: RequestHandler = () => mcpGet();
export const DELETE: RequestHandler = () => mcpLeeg();
export const OPTIONS: RequestHandler = () => mcpLeeg();
