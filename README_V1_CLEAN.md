# Mobile R&D Technical Hub — V1 Clean Baseline

## Purpose

This package is a **new clean baseline**, not a patch layer on the previous dashboard iterations. The dashboard presentation and core layout contracts were restructured around the current requirements.

## V1 layout contracts

### 1. Stable cards + dedicated Preview
- Uploading a file does not inject a live preview into the card.
- Cards retain stable geometry regardless of file type, filename length, or preview availability.
- Each card has a dedicated **Preview** action.
- Preview opens a large workspace containing record information, document slots, file selection, supported image/PDF/text previews, and download controls.
- A **Download All Files** action is available from the record preview workspace.

### 2. All Cards view
- Uses an adaptive grid based on available container width.
- Cards have a minimum usable width so titles and actions are not crushed.
- Laptop-width layouts can show 4 cards per row when the available width supports it.
- Larger displays automatically gain additional columns when the minimum width remains satisfied.
- Titles wrap instead of disappearing or widening the grid.

### 3. Particular Group view
- Group view has an independent **maximum of 3 cards per row**.
- It naturally falls to 2 or 1 columns on narrower screens.
- Group expansion uses natural content height; it does not use fixed card heights.

### 4. Sidebar hierarchy
The actual DOM/component order is:

1. Active Model
2. Active Model Details
3. Portal Modules / Feature List
4. Sidebar Actions
5. Footer

This is structural rather than a CSS positioning trick.

## Functional behavior retained

- Model selection and model metadata
- Add/Edit/Delete custom model administration
- Model rename and stored-file key migration
- Engineering records and category filtering
- Search, sorting, favorites and Recently Viewed
- IndexedDB file storage
- Versioned uploads and audit logging
- File Command Center
- Presentation/fullscreen
- Engineering report and metadata backup
- Portal settings and themes
- Excel comparison
- R&D Lab Testing Setup
- Parameter 360°

## Clean-code decision

The new metadata namespace is `MOBILE_RND_DB_DATA_V1`. The application does not execute historical V64/V65 record-layout migration logic. Existing uploaded binaries remain an application storage feature, but the new UI does not depend on historical dashboard-layout code.

## Validation

All JavaScript files pass Node syntax validation and the core CSS has balanced braces. Browser-level Playwright execution must still be performed on a normal local machine because the current execution sandbox blocks local browser navigation.
