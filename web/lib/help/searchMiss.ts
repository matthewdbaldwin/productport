// web/lib/help/searchMiss.ts — fire-and-forget HelpSearchMiss writes,
// called from HelpLauncher's onSettledQuery (Task 8).
//
// `api` (web/lib/api.ts) is `api<T>(path, init: RequestInit): Promise<T>`;
// a leading-slash path is sent as-is, so '/api/help' hits the Express
// router mounted in src/app.js. role/userId are NOT sent — the server
// derives both from the session (src/routes/help.js).
import { api } from '@/lib/api';

export function recordHelpSearchMiss({
  query, wasFuzzyRescued, locale,
}: { query: string; wasFuzzyRescued: boolean; locale?: string }): void {
  try {
    api('/api/help', {
      method: 'POST',
      body: JSON.stringify({ query, wasFuzzyRescued, locale }),
    }).catch(() => { /* analytics only — a failed write must not disrupt search */ });
  } catch {
    // Same contract for a synchronous throw (e.g. fetch unavailable): never
    // let analytics bubble into the search UI.
  }
}
