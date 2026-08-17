# Product Catalog System documentation template contract

## Reference

- Retained source: `C:\Users\Mohamed Aiman\Desktop\Product Catalog System\Example\System Per Tab Explaination .docx`
- SHA-256: `88270f62762c4a7bffaa8ae44cd37c220c4b66b603152c43591d531f7b7106d9`
- Rendered with Microsoft Word: 15 pages.
- Evidence: `tmp\docgen\reference-docx-evidence.json`, `tmp\docgen\template-style-evidence.json`, and `tmp\docgen\reference-docx\page-01.png` through `page-15.png`.
- One section; US Letter portrait (8.5 x 11 in); 1 in margins on every side; no distinct first/odd/even header behavior.

## Page system and recurring elements

- Cover page: centered QSS logo in the middle third, centered 24 pt bold Times New Roman system title below it, large white space, and the standard footer.
- Pages 2-3: Table of Contents with dot leaders and right-aligned page numbers.
- Body begins on the next page with the user-guide title and short introduction.
- Footer: centered 9 pt Times New Roman blue-gray guide title (`#475569`), with page number aligned at the right edge.
- Header is intentionally blank.

## Typography

- Default family: Times New Roman, black.
- Body: 11 pt, justified, natural line wrapping, compact paragraph rhythm.
- Cover title: 24 pt bold, centered, 2 pt after.
- Opening guide title: 14 pt in the source; use a comparable 14-16 pt title role.
- Major numbered tab headings: bold, approximately 18 pt.
- Section headings: bold, approximately 14 pt.
- Procedure headings: bold, approximately 12 pt.
- Lists use real Word bullets or numbering with hanging indents; no typed bullet characters.
- Keep headings with the following paragraph and avoid headings stranded at page bottoms.

## Tables

- Full usable-width tables with thin black borders.
- Header cells use a pale blue-gray fill (approximately `#DDE6F0`) and bold 8.5 pt Times New Roman.
- Body cells use 8.5 pt Times New Roman, vertically centered, with compact but visible padding.
- No fixed row heights; repeated header rows when a table spans pages.

## Content flow and slots

- Editable slots: cover title, footer guide title, TOC entries, opening introduction, system flow, sidebar tree, navigation summary, role-access table, numbered tab explanations, procedures, and closing controls/good-practice sections.
- The Product Catalog guide may add or remove numbered tab sections to match the implemented navigation; the visual hierarchy and component treatment remain source-derived.
- Preserve: US Letter geometry, QSS branding, Times New Roman hierarchy, TOC position, table style, justified prose, real numbered/bulleted procedures, and footer placement.
- Replace: all credit-monitoring-specific prose, tables, access notes, role names, and workflows.

## Package preservation and fidelity gates

- The retained file remains unchanged. The new document may be constructed with the same source-derived components because the body structure changes substantially.
- Preserve-only reference feature: the QSS visual identity. Use the repository asset `public\QSS Healthcare.png` for the cover.
- Final gates: verify the source hash is unchanged; render the final DOCX using Microsoft Word; inspect every page; confirm the TOC is updated; confirm no clipped text, broken tables, missing page numbers, or unexpected font substitutions.

## Diagram visual authority

- Reference diagrams use very wide landscape canvases, a dark navy title block, a rounded blue/teal sign-in hub, pale color-coded module groups, thin connecting arrows, and compact sans-serif labels.
- Product Catalog diagrams will retain that visual language while using the four implemented roles: Super Admin, Admin, Product Specialist, and Graphic Designer.
