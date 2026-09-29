# Mobile R&D Technical Hub — V3 Clean Restructured

This build starts from the working V1 Clean baseline and restructures the record presentation layer without replacing the application's data/storage/upload pipeline.

## Architecture

- `js/app.js` remains the application/state boundary: model data, filtering, upload/storage, authentication, settings, navigation and existing dashboard modules.
- `js/records/record-system.js` is the presentation boundary for engineering records:
  - RecordViewModel generation
  - compact card rendering
  - expand/collapse rendering
  - dedicated record Preview workspace
  - file preview/download actions
- `css/record-system.css` is the single stylesheet for record cards, record grids and the dedicated Preview workspace.
- `css/dashboard.css` no longer contains the old record-card/grid/preview layout rules.

## Layout contracts

- All Cards: adaptive CSS Grid with `minmax(210px, 1fr)` so a laptop can fit four cards when space permits and larger screens can fit more.
- Group view: maximum three cards per row on desktop; two/one at narrower breakpoints.
- Collapsed card: exactly `65px` total height using normal flow and border-box sizing.
- Expanded card: natural height; CSS Grid flow pushes following rows down. No absolute positioning or JavaScript height synchronization.
- Titles use ellipsis/nowrap instead of arbitrary character wrapping.
- Full filenames, version history and detailed file metadata stay in the Preview workspace rather than being dumped into the collapsed card.

## Preservation

The working V1 data loading, filtering, upload, database/storage, model administration, sidebar and other dashboard modules are retained. The rebuild changes the presentation boundary rather than replacing the application orchestration.
