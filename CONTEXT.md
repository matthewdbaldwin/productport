# ProductPort

The product catalog and regulatory system of record: descriptive product data, regulatory-clearance status, and clinical evidence, organized by subsidiary and therapeutic area.

## Language

**Clearance**:
The umbrella concept for "this product is authorized to sell in a given jurisdiction." Exists at two granularities: `RegulatoryClearance` and `CountryClearance` (see both below).
_Avoid_: Registration (see below — narrower, don't use it for the umbrella concept), Approval (use only for the clearance `status` value APPROVED, not the concept itself).

**RegulatoryClearance**:
Clearance by regulatory-authority region: FDA (US), CE (EU/EEA — one approval covers every member state), NMPA (China), PMDA (Japan), TGA (Australia). Four of these five are already single countries; only CE is genuinely multi-country.

**CountryClearance**:
Clearance by ISO country, for markets `RegulatoryClearance`'s five jurisdictions don't cover. Deliberately excludes every country `RegulatoryClearance` already covers (US, China, Japan, Australia, every EU/EEA member) — the two never describe the same regulatory fact, so there is nothing to reconcile between them. See ADR-0001.

**Registration** (as in `certificateNumbers`):
The certificate/reference-number evidence attached to a clearance — a narrower attribute, not a synonym for clearance itself.
_Avoid_: Using "registration" to mean the clearance concept as a whole.

**Material ref**:
The local ERP material number that makes a product actually orderable in a given country — a second, separate gate from clearance itself. A product can be cleared (legally approved) in a country with no material ref yet (not orderable), or in principle have one without being fully cleared. ERP-agnostic name by design (not "SAP material number") since the specific ERP is a deployment detail, not a domain fact.
_Avoid_: SAP material number, SKU, product code (those name different things — see MDM code reference for the wider disambiguation).
