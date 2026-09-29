# Mobile R&D V6 — Preserve Dashboard Chrome

V6 is based on V5. The record workspace improvements remain, but the global dashboard chrome is preserved from the V1 Clean baseline.

## Preservation contracts
- Upper header/brand/model controls preserve V1 structure and styling.
- Sidebar styling preserves V1 CSS.
- Sidebar sequence is DOM-driven: Active Model → Active Model Details → Portal Modules → Telemetry → Actions → Footer.
- Telemetry is an additive section styled to match the existing sidebar; it does not restyle the existing sections.
- Record workspace keeps V5 requirements: 19 actual records, compact controls, unlimited documents, Ready/Missing status, group cards always expanded, and max 3 group columns.
