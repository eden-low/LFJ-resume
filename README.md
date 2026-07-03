# LFJ Resume — Solo Leveling Style

A 4-page portfolio site for **Low Fang Jun**, styled after the "Solo Leveling" hunter status UI (neon purple/blue, cyber fonts, grid background). Built as static HTML/CSS with Tailwind CSS (via CDN) — no build step, no framework, no dependencies to install.

## Pages

| Page | File | Content |
|---|---|---|
| Home | [index.html](index.html) | Cinematic hero (photo background + mouse-parallax tilt), name/role tagline, quick-facts strip |
| Resume | [resume.html](resume.html) | Combined resume — Profile, Matrix, Quests, Events, Experience, Inventory sections with a sticky in-page sub-nav |
| Gallery | [gallery.html](gallery.html) | Firebase-backed photo gallery — public photos are visible to everyone; a Private section and an upload form appear after signing in (see below) |
| Contact | [contact.html](contact.html) | Email / phone / location, with a one-click "send message" CTA |

## Running locally

No install or build required — just open [index.html](index.html) in a browser, or serve the folder locally:

```powershell
npx serve .
```

## Tech stack

- HTML5 + [Tailwind CSS](https://tailwindcss.com/) (loaded via CDN, configured inline in each page's `<script>` block)
- [Chart.js](https://www.chartjs.org/) (loaded via CDN on `resume.html`) for the Matrix section's charts
- [Font Awesome 6](https://fontawesome.com/) for icons
- Google Fonts: Orbitron (cyber headings), Fira Code (code/labels), Inter (body text)
- [Firebase](https://firebase.google.com/) (Auth, Firestore, Storage) on `gallery.html`, loaded as ES modules straight from `gstatic.com` — no npm install, no bundler
- Shared custom styles in [styles.css](styles.css) (neon borders/glow, grid background, scrollbar, hero parallax layer)
- Shared behavior in [scripts.js](scripts.js) (scroll-reveal animations + the hero mouse-parallax tilt on `index.html`)

## Gallery: Firebase-backed photos

`gallery.html` no longer hardcodes `<img>` tags. [firebase-init.js](firebase-init.js) sets up the Firebase app/auth/Firestore/Storage handles (reused by any future page that needs login), and [gallery.js](gallery.js) handles sign-in, renders public photos from the `photos` Firestore collection into the three category grids, reveals a Private section + upload form once signed in as the owner (`jjun8647@gmail.com`, see `OWNER_EMAIL` in `firebase-init.js`), and lets the owner upload new photos (file → Storage, metadata → Firestore) straight from the page.

Access to private photos beyond the owner is controlled by an `allowedUsers` Firestore collection (doc ID = lowercase email) — inviting someone is just adding a document in the Firebase Console, no code changes needed. [firestore.rules](firestore.rules) and [storage.rules](storage.rules) are the source of truth for this access model; paste them into the Firebase Console's Rules tabs after any change (there's no Firebase CLI/deploy step wired up — keeping the "no build tools" philosophy).

Because photos are fetched at runtime, the gallery grids are empty until the owner signs in and uploads through the on-page form.

## Structure notes

Every page repeats the same header/nav and Tailwind theme config — there's no shared layout include, so changes to the nav or color palette need to be applied to each `.html` file individually. See [CLAUDE.md](CLAUDE.md) for details if editing with Claude Code.
