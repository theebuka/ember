# Responsive sweep

`scripts/responsive.mjs`, 2026-10-10.

18 screens at 320, 375, 414, 640, 768, 1024, 1280, 1440, 1920px — 162 combinations.

The check is that the document never scrolls horizontally. Wide content —
the positions table, the risk comparison — is allowed to scroll, but only
inside its own container, never by pushing the page sideways.

**No horizontal overflow at any width.**
