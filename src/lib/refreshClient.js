// src/lib/refreshClient.js
// ProductPort refresh client. Thin adapter over microport-auth's
// createRefreshClient, which owns the wire protocol (Bearer refresh +
// X-Satellite-Token + X-Satellite-Id), the null-on-any-failure contract,
// and the revoke path.
//
// Slice 5a (2026-08-31): SalesPort's IdP endpoints are deleted, so the old
// `IDP_API_URL || SALESPORT_API_URL` fallback (matching this app's own
// /sso/exchange resolver — see routes/auth.js) could only ever resolve to
// routes that no longer exist. apiUrl() is now IDP_API_URL-only and
// fail-fast: unset now means refreshFromHub/revokeUpstreamRefresh REJECT
// instead of gracefully returning null (the shared lib's apiUrl() call sits
// outside its own try/catch, so this propagates as a thrown error).
// sharedSecret stays IDP_*-first with the SALESPORT_* fallback, unaffected
// by this slice.
const { createRefreshClient } = require('@matthewdbaldwin/microport-auth');

const client = createRefreshClient({
  // Slice 5a (2026-08-31): SalesPort's IdP endpoints are deleted, so the old
  // `|| process.env.SALESPORT_API_URL` fallback could only ever resolve to
  // routes that no longer exist. Required and fail-fast instead.
  //
  // ⚠ SALESPORT_API_URL itself is NOT retired and must stay set fleet-wide —
  // it is an overloaded variable that also addresses SalesPort's ordinary
  // business API (ExecPort's analytics proxy and SSE stream, FinPort's
  // reconciliation, and the bug-report relay in four apps). Only this
  // identity-exchange expression stops reading it.
  apiUrl: () => {
    const url = process.env.IDP_API_URL;
    if (!url) throw new Error('IDP_API_URL is required (SalesPort IdP fallback retired in SSO slice 5a)');
    return url;
  },
  sharedSecret: () => process.env.IDP_REFRESH_SHARED_SECRET || process.env.SALESPORT_REFRESH_SHARED_SECRET,
  satelliteId:  'productport',
});

// Single-flight: concurrent requests presenting the SAME raw refresh token
// (e.g. two browser tabs racing a near-expiry cookie) share ONE upstream
// call instead of each independently consuming it. The IdP's refresh
// tokens are single-use — a second consumer of an already-consumed token
// trips replay detection and gets the WHOLE FAMILY revoked, logging every
// sibling out. Keyed on the raw token string itself, since that's the
// only thing two concurrent callers sharing the same cookie have in
// common.
const inFlight = new Map();

function refreshFromHub(rawRefreshToken, logger) {
  if (inFlight.has(rawRefreshToken)) return inFlight.get(rawRefreshToken);
  // client.refreshFromSalesport never throws (null-on-any-failure
  // contract), so .finally always fires and this can't leak a stuck map
  // entry.
  const promise = client.refreshFromSalesport(rawRefreshToken, logger)
    .finally(() => inFlight.delete(rawRefreshToken));
  inFlight.set(rawRefreshToken, promise);
  return promise;
}

module.exports = {
  refreshFromHub,
  revokeUpstreamRefresh: client.revokeOnSalesport,
};
