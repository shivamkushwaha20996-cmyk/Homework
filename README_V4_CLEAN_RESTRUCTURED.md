# Mobile R&D Technical Hub — V4 Clean Restructured

This build is based on the V1 Clean working dashboard and preserves the existing application/data/upload pipeline.

## V4 contracts
- Sidebar order: Active Model → Active Model Details → Portal Modules → Telemetry → Actions → Footer.
- Record count is derived from the actual current record dataset; the default dataset contains 19 records.
- All Cards: adaptive desktop grid with 4 cards at the tested 1440px viewport; cards are 65px when collapsed.
- All Cards expansion uses normal CSS grid flow; expanded cards push subsequent rows down.
- Group views: maximum 3 desktop columns and cards are always expanded.
- Record titles use controlled single-line ellipsis rather than arbitrary word breaks.
- Engineering Records toolbar is compact; the search field is 30px high in the tested desktop layout.
- Empty Recently Viewed panel is hidden until there are recently viewed records.
- Full document/version information remains in the dedicated Preview workspace rather than being dumped into collapsed cards.

## Visual audit
Chromium + Playwright visual audit was performed against the shipped record/sidebar markup and CSS contract at 1440x900. The execution environment blocks direct browser navigation to local HTTP/file URLs, so the audit used an offline Playwright set-content harness built from the exact shipped HTML/CSS and the same record markup contract.
