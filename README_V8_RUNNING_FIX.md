# Mobile R&D Technical Hub — V8 Running Fix

## Critical fix
V7 could display the model metadata while showing `0 records` when an older/incomplete `MOBILE_RND_DB_DATA_V1` object was already present in localStorage. V8 normalizes stored model data against the default record schema on startup, preserving saved metadata/documents while restoring any missing default records.

## Windows launch
Do not double-click `index.html` for normal use. Double-click `START_DASHBOARD.bat` or run:

```bat
py -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

## Deployment
The same normalized data logic runs on GitHub Pages. Existing incomplete localStorage is repaired automatically on startup.


## V8 Problem-Fix Pass 1 — 2026-09-28

Implemented from the working `Mobile_RD_V8_FULL_QA_FIXED` baseline without replacing the existing architecture.

1. Fixed custom-model record initialization: newly added models now inherit the complete record schema safely, so selecting a newly added model no longer hits an undefined schematic template and freezes the Records workspace.
2. Centralized model refresh after add/edit/rename and strengthened model-delete cleanup so model-dependent UI is rebuilt consistently.
3. Removed the duplicate `STATUS` detail from expanded cards; `DOCUMENT STATUS` is now the single document-state field.
4. Added a safe `Refresh Dashboard` control in the established top bar. It performs a full page reload without deleting persisted models/documents.
5. Added clearer spacing between `Parameter 360°` and `Select Model`.
6. Improved `Engineering Records` heading visibility with a restrained typography adjustment.
7. Group view now equalizes cards to the tallest card in the active group after rendering, while All Cards keeps its natural-flow behavior.
8. Constrained the dedicated Preview workspace so the information column remains visible while document previews stay contained.

### Verification
- JavaScript syntax checks: PASS for `js/app.js` and `js/records/record-system.js`.
- Duplicate expanded-card status field: removed; `DOCUMENT STATUS` remains.
- Cache-busting query versions updated for the changed CSS/JS assets.
- Live Chromium interaction could not be completed in this environment because the browser runtime blocks local dashboard pages; no live-browser pass is claimed.
