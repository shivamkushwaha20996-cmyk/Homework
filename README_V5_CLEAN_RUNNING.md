# Mobile R&D Technical Hub — V5 Clean Running Dashboard

## Fixed in V5
- Removed artificial per-record document-count/slot presentation (`0/1`, `1/2`, `2/2`).
- Removed the large Engineering Records search control from the record workspace.
- Added explicit `DOCUMENT READY` / `DOCUMENT MISSING` card status.
- Added unlimited additional-document uploads per record; practical browser storage is the only capacity constraint.
- File type and per-file size application caps were removed from the upload selector.
- Existing document slots and version history remain supported.
- Additional documents are persisted in the record metadata and IndexedDB, and appear in cards and Preview.
- All Cards remain 65px collapsed with 4 columns at the audited 1440px viewport.
- Group views remain capped at 3 columns and always expanded.
- Sidebar order is explicit: Active Model, Active Model Details, Portal Modules, Telemetry, Actions, Footer.

## QA
- Chromium/Playwright visual harness executed.
- 60-cycle interaction stress test passed.
- 19-record rendering passed.
- 65px collapsed-card contract passed.
- 4-column All Cards and <=3-column Group contracts passed at 1440x900.
- Group cards remained expanded through all 60 cycles.
- Visual fixtures include All Records, individual expanded cards with 3 and 2 files, and every group category.
