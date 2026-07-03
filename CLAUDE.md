# CLAUDE.md

Guidance for Claude Code when working in this repo. See [README.md](README.md) for the project overview.

## What this is

A static, 4-page HTML portfolio/resume for Low Fang Jun, styled like a "Solo Leveling" hunter status screen (dark background, neon purple/blue glow, cyber fonts). No build tools, no JS framework, no package.json — just plain HTML/CSS files opened directly in a browser or served statically. The one dynamic piece is `gallery.html`, which talks to Firebase (Auth/Firestore/Storage) via ES module imports straight from `gstatic.com` — this is the start of a bigger personal-platform direction (login-gated content, later phases may add notes/dashboard widgets), but it's still buildless: no npm, no bundler.

## Architecture

- **No shared layout/include system.** Every page (`index.html`, `resume.html`, `gallery.html`, `contact.html`) is a fully standalone HTML file that repeats the same `<head>` (fonts, Tailwind CDN, Font Awesome, `styles.css`) and the same header/nav markup.
- **Tailwind is loaded via CDN** (`cdn.tailwindcss.com`) and configured inline in a `<script>` block on every page — the same `tailwind.config` (colors, fonts) is copy-pasted into each file.
- **[styles.css](styles.css)** holds the few things Tailwind utility classes can't express directly: `.neon-border-purple`, `.neon-text-purple`/`.neon-text-blue`, `.neon-bg-purple`, `.grid-bg`, custom scrollbar styling, the `.reveal`/`.reveal-group` scroll-animation classes, and the `[data-parallax-layer]` transition used by the hero tilt effect (see below).
- **[scripts.js](scripts.js)** is the one shared JS file (loaded via `<script src="scripts.js" defer></script>` near the end of `<body>` on every page). It uses `IntersectionObserver` to add `.is-visible` to any `.reveal` element as it scrolls into view (respecting `prefers-reduced-motion`), and also drives the `index.html` hero's mouse-parallax tilt (guarded by checking for `[data-parallax-hero]`/`[data-parallax-layer]` elements, so it's a no-op on other pages). This is the one exception to "no shared files" — keep new cross-page behavior here rather than inlining duplicate `<script>` blocks.
- **resume.html** combines what used to be 6 separate pages (Status/Profile, Matrix, Quests, Events, Experience, Inventory) into one long page, each as a `<section id="...">` with `scroll-mt-24` so anchor jumps clear the sticky sub-nav. A sticky pill sub-nav (`sticky top-4`) sits under the header with anchor links to each section — this is in-page navigation only, not a routing system. It additionally loads Chart.js (`cdn.jsdelivr.net/npm/chart.js`) for the Matrix section's charts.
- **[images/](images/)** holds photo assets (`me1.jpeg`–`me4.jpeg`) used only for the `index.html` hero background now. `gallery.html` no longer reads from this folder — its photos are runtime data from Firebase Storage/Firestore (see below).
- **[firebase-init.js](firebase-init.js)** is the shared Firebase bootstrap (ES module): initializes the app from the project's config, exports `auth`, `googleProvider`, `db`, `storage`, `OWNER_EMAIL`, and `isOwner(user)`. Any future page that needs login (notes, dashboard) should import from here rather than re-initializing Firebase.
- **[gallery.js](gallery.js)** (ES module, loaded only by `gallery.html` via `<script type="module">`) owns all gallery behavior: `onAuthStateChanged` drives the sign-in/out UI; public `photos` docs (Firestore) always render into the three category grids (`#gallery-events-grid`, `#gallery-projects-grid`, `#gallery-personal-grid`); a Private section (`#gallery-private-section`) and an owner-only upload form (`#gallery-upload-section`) reveal once signed in. Dynamically-inserted photo `<img>` elements get `is-visible` added directly in `gallery.js` (not just `.reveal`) since they're created after `scripts.js`'s `IntersectionObserver` has already run its one-time query on page load.
- **[firestore.rules](firestore.rules) / [storage.rules](storage.rules)** are the security-rules source of truth for the `photos` and `allowedUsers` Firestore collections and the `gallery/{public,private}/...` Storage paths. There's no Firebase CLI/deploy wiring in this repo — after editing either file, paste its contents into the corresponding tab in the Firebase Console manually. The owner's email is hardcoded in three places that must stay in sync: `firebase-init.js` (`OWNER_EMAIL`), `firestore.rules`, and `storage.rules`.

## Conventions to follow when editing

- **Nav links**: every page's `<nav>` lists all 4 pages (Home, Resume, Gallery, Contact). If you add a new page, add its link to the nav in **all** existing HTML files, not just the new one.
- **Color palette**: `darkBg`, `cardBg`, `borderNeon`, `neonPurple`, `neonBlue`, `neonViolet`, `textGray` — defined identically in each page's inline `tailwind.config`. Keep them in sync if the palette changes; there's no single source of truth to edit.
- **Fonts**: `font-cyber` (Orbitron, headings/labels), `font-code` (Fira Code, small tags/labels), `font-sans` (Inter, body text, default).
- **Card style**: content blocks use `bg-cardBg/90 backdrop-blur-sm p-6 rounded-2xl neon-border-purple`, often with `hover:-translate-y-1 transition-all` on clickable cards.
- **Icons**: Font Awesome 6 solid icons (`fa-solid fa-*`), colored per section (purple/blue/emerald/amber/rose) to visually distinguish categories.
- **Scroll reveal**: add class `reveal` to any top-level section or card that should fade/slide in on scroll. When a group of sibling cards should stagger in one after another, add `reveal-group` to their shared parent (the stagger delays are defined in styles.css as `.reveal-group > .reveal:nth-child(n)`). Every page must include `<script src="scripts.js" defer></script>` before `</body>` for this to work.
- When adding a new section/page, copy the closest existing page (same head + header/nav block) as the starting template rather than writing one from scratch, to keep everything consistent.
- Avoid meta-commentary text referencing "the original resume" or "preserved exactly as intended" in page copy — content should read as the resume itself, not as a description of the HTML conversion.

## Keeping docs current

When adding a new page, section, or notable structural change (e.g. introducing a shared layout, a build step, or a new palette), update both [README.md](README.md) (page table / tech stack) and this file (architecture / conventions) so they stay accurate.
