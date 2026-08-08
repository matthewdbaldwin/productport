# CountryClearance excludes jurisdictions RegulatoryClearance already covers

We're adding `CountryClearance` (per-ISO-country clearance data) alongside the existing `RegulatoryClearance` (per-regulatory-region: FDA/CE/NMPA/PMDA/TGA), to serve OpsPort's order-readiness check for markets outside those five. Four of the five regions are already single countries (FDA=US, NMPA=China, PMDA=Japan, TGA=Australia); only CE is genuinely multi-country (EU/EEA).

Decided: `CountryClearance` rejects a row for any country `RegulatoryClearance` already covers (US, China, Japan, Australia, any EU/EEA member). The two models are mutually exclusive by construction — they never describe the same regulatory fact in two places, so there's no reconciliation logic to build or drift to guard against.

Considered and rejected: allowing overlap for finer per-country granularity within an already-cleared region. Rejected because it reopens exactly the two-sources-of-truth risk this boundary exists to close, for a granularity nobody asked for (CE clearance is genuinely one approval for the whole bloc).
