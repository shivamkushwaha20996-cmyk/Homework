# Mobile R&D Technical Hub — V7 Clean Running Dashboard

V7 is a focused correction pass over the V6/V5 record workspace while preserving the original dashboard chrome.

## Locked visual contracts
- Preserve the original V1 upper/header bar appearance.
- Preserve the original V1 sidebar appearance; only structural order is enforced.
- Sidebar order: Active Model → Active Model Details → Portal Modules → Telemetry → Actions → Footer.
- Engineering Records count is derived from the actual dataset; default dataset contains 19 records.
- Remove the large record search bar from the All Cards workspace.
- All Cards: adaptive grid, 250px minimum card width, 4 columns at the target laptop viewport when space permits.
- Collapsed All Cards card: exactly 65px.
- Expanded cards use normal CSS grid flow; lower rows are pushed down naturally.
- Group views: maximum 3 desktop columns and every group card is always expanded.
- No artificial document counters such as 0/1, 1/2, or 2/2.
- Document state is explicitly shown as DOCUMENT READY or DOCUMENT MISSING.
- A record accepts unlimited additional documents; practical limits are browser storage constraints only.
- 2–3+ documents render as independent rows in an expanded card without overlap.
- Full metadata/version history/preview remains in the dedicated Preview workspace.
- Recently Viewed panel was removed from the primary record workspace.

## Important upload correction
New additional documents now generate one stable document base key before the binary/version is saved, and the same base key is persisted in the record metadata. This keeps newly uploaded documents discoverable after refresh/reload.

## QA performed
- JavaScript syntax checks: PASS.
- Software contract QA: 20/20 PASS.
- Chromium + Playwright visual harness using the shipped HTML/CSS and actual record renderer: PASS.
- 60-cycle browser interaction test: PASS.
- Visual states captured: sidebar + upper bar, All Cards, individual expanded card, 2-file card, 3-file card, all five group views, Schematics group with 3-file record, Settings, Model Add, Model Edit, Upload.

## Browser-environment limitation
The execution environment blocks direct navigation to local `file://` and `localhost` application URLs. The Playwright audit therefore used a controlled browser harness containing the exact shipped HTML/CSS and the actual `record-system.js` renderer, with deterministic record/file states. It does not claim a deployed GitHub page navigation test.
