# MMI Lab Website & Management System

> **Read this file before exploring the codebase.** It is the maintained reference for
> architecture, schema, routes, and conventions. Trust it first and only open source files
> for the specific area you are changing - do not re-scan the whole repo to rebuild context.
> **When you change schema, routes, permissions, or conventions, update this file in the
> same commit** so it stays accurate.

## Project Overview
Website and internal management dashboard for the **Molecular Microbiology & Immunology (MMI) Lab** at **Tripura University**, led by **Dr. Surajit Bhattacharjee** (PI). Built as a static site + SPA dashboard backed by a Node.js API with SQLite.

## Architecture

### Stack
- **Frontend**: Static HTML/CSS pages (public site) + SPA dashboard (`dashboard.html` + `js/dashboard-app.js`)
- **Backend**: Node.js/Express API (`api/server.js`) on port 3500
- **Database**: SQLite via `better-sqlite3` (persistent Docker volume `mmilab-db`)
- **File Storage**: Uploaded docs in `/app/uploads` (persistent Docker volume `mmilab-uploads`)
- **Reverse Proxy**: Nginx (serves static files, proxies `/api/*` to Node)
- **Deployment**: Docker Compose (4 containers: nginx, api, cloudflare tunnel, tailscale funnel)

### Docker Services
```
mmilab-nginx      - nginx:alpine - serves static site + reverse proxy
mmilab-api        - node:20-alpine - Express API + SQLite
mmilab-cloudflare - cloudflared - free quick tunnel, URL changes on restart
mmilab-tailscale  - tailscale funnel - permanent URL (https://mmilab-server.taile8367f.ts.net)
```
Volumes: `mmilab-db` (SQLite), `mmilab-uploads` (documents + gallery), `tailscale-state`.

### Key Files
```
index.html              - Public homepage
team.html               - Team members grid (3-col CSS grid, divs not <a> tags)
gallery.html            - Photo gallery with lightbox + category filters
dashboard.html          - SPA shell (sidebar nav, all pages rendered by JS)
login.html              - JWT-based login
js/dashboard-app.js     - Core dashboard logic (all pages, modals, API calls)
css/styles.css          - Global styles (CSS variables, warm earth-tone theme)
css/dashboard.css       - Dashboard layout, tables, modals, consumables UI
css/profile.css         - Scholar card styles

api/server.js             - Express entry point
api/lib/init.js           - SQLite schema, migrations, user seeding
api/routes/auth.js        - Login, JWT, password change/reset, force-change
api/routes/strains.js     - Bacterial stock CRUD, checkout/checkin, QR codes
api/routes/docs.js        - Document upload, FTS5 search, download, delete
api/routes/projects.js    - Funded project management
api/routes/dashboard.js   - Scholar profiles, PI overview
api/routes/consumables.js - Consumable boxes, ledger, recount, rename, item types
api/routes/gallery.js     - Gallery image upload/list/delete

docker-compose.yml      - Production orchestration
api/Dockerfile          - Node 20 Alpine + build tools for native modules
nginx/default.conf      - Static files + API proxy config
.env                    - HOST_PORT, JWT_SECRET, TUNNEL_TOKEN (not in git)
deploy.sh               - One-command server update: git pull + docker compose up
get-url.sh              - Prints current Cloudflare tunnel URL
```

### Database Schema (SQLite)
Defined in `api/lib/init.js`. All tables use `CREATE TABLE IF NOT EXISTS`, so the file runs
on every API boot and is safe to re-run.

- `users` - id, name, email, password_hash, role (pi/scholar), must_change_password
- `bacterial_inventory` - Vial_ID (PK), Organism, Phenotype_Notes, Stock_Type, Freezer_Location, Status, added_by
- `stock_log` - Tracks checkout/checkin/depleted/added actions per vial
- `documents` - Uploaded files with tag, folder, project_id; FTS5 via `document_search`
- `projects` - Funded projects (DBT, ICMR, DST, etc.) with members
- `project_members` - project_id + user_id + role_in_project
- `scholar_profiles` - Research topics, enrollment dates, experiments
- `gallery_images` - filename, title, category (lab/fieldwork/events/team), uploaded_by
- `consumable_types` - name (UNIQUE), unit (pcs/bottles/rolls). Item types are data, not code
- `consumable_boxes` - id, item_type, box_label, initial_qty, current_qty,
  status (`active`/`locked`/`empty`), added_by, added_at, emptied_at
- `consumable_ledger` - Append-only audit trail. box_id, user_id, action, qty, qty_after, notes, timestamp
- `_migrations` - Tracks one-time migration keys

#### `consumable_ledger.action` values
The column has a `CHECK` constraint, so **adding a new action requires a table rebuild
migration** (SQLite cannot alter a CHECK in place - see `ledger_actions_recount_rename_v1`).

| action        | qty means                        | written by |
|---------------|----------------------------------|------------|
| `box_added`   | initial quantity                 | POST `/boxes` |
| `withdraw`    | units taken                      | POST `/:id/withdraw` |
| `correction`  | units removed (breakage, error)  | POST `/:id/correction` (negative input) |
| `return`      | units put back                   | POST `/:id/correction` (positive input) |
| `recount`     | size of the gap (0 if it matched) | POST `/:id/recount` |
| `rename`      | always 0 - metadata change        | PATCH `/:id/label` |
| `box_emptied` | always 0                          | withdraw/recount to zero, or mark-empty |

### Migration keys (in `_migrations`)
Applied in order at boot; each runs once. Never reuse a key.
- `pw_reset_v3`, `individual_passwords_v2` - password seeding from `.env`
- `drop_consumables_fresh_v1` - dropped early consumable tables with a bad CHECK
- `consumable_types_expanded_v1` - adds 21 item types (Motility Plate, tips, tubes, etc.), additive only
- `ledger_actions_recount_rename_v1` - **rebuilds `consumable_ledger`** to allow `recount`/`rename`;
  copies every row with its original id inside a transaction and logs `N of M entries preserved`.
  Back up the `mmilab-db` volume before first deploy of a rebuild migration.

## Important Patterns

### `window.dashApp` object
All functions called from inline `onclick` handlers **must** be exposed on `window.dashApp`. The dashboard JS runs inside an IIFE, so local functions are not accessible. If you add a new action button, add the handler to the `window.dashApp = { ... }` object at the bottom of `js/dashboard-app.js`.

### Document indexing
- Uses `mammoth` for .docx, `pdf-parse` for PDF, raw read for .txt/.csv
- `mammoth` does NOT support legacy .doc files (only .docx)
- FTS5 virtual table `document_search` indexes: filename + tag + folder + extracted text
- Text extraction has 30s timeout protection

### Password system
- All users seeded with `MMI@Tripura2026#` (migration key `pw_reset_v3`)
- `must_change_password` flag forces unclosable modal on dashboard load
- `force-change-password` endpoint clears the flag after setting new password
- PI can reset any user's password via `reset-password` endpoint

### Team page (team.html)
- Cards use `<div class="scholar-card scholar-card-link" onclick="...">` NOT `<a>` tags
- Nested `<a>` tags break the 3-column grid (browser splits elements, doubling grid items)

### Consumables module
Batch-tracked lab consumables (petri plates, tips, tubes, motility plates, ethanol...) with an
append-only ledger. Frontend lives in `js/dashboard-app.js` between the `CONSUMABLES TRACKING PAGE`
banner and the `DOCUMENTS PAGE` banner; styles are the `.cons-*` classes in `css/dashboard.css`.

**Model**: each physical box is a row in `consumable_boxes`. Boxes are consumed FIFO - the API
orders `active` (oldest first), then `locked`, then `empty`. New boxes start `locked`; a manager
activates them. A box hitting zero is set to `empty` and moves to the archive.

**UI layout** (`renderConsBoxes`): one card per item type. Card header shows total stock across
live boxes plus `N active / N locked`. Each in-use box is one row: label + date, progress bar,
`X of Y left`, status badge, a primary **Withdraw** button, and a `⋮` overflow menu
(`details.cons-menu`) holding everything else. Used-up boxes are **not listed** - the card footer
shows only a count with a "View archive" link.

**Archive** (`showArchive(itemType)`): modal listing used-up boxes. Called with an item type from
a card, or with no argument from the toolbar **Archive** button for a lab-wide view (which adds an
Item Type column). Ledger history is preserved for archived boxes.

**Stat tiles** (`renderConsSummary`): per-type totals with unit, flagging *Out of stock*,
*Running low* (`CONS_LOW_STOCK = 20`, a single hardcoded threshold - a per-type `reorder_level`
would be the better fix), and *No active box* (scholars cannot withdraw when everything is locked).

**Recount** (`POST /:id/recount`, open to all users): enter the physically counted quantity; the
gap against the recorded quantity is logged as **used but not tracked**. A matching count is still
logged so there is a record of when stock was last verified. Counting to zero retires the box.
Untracked usage deliberately does *not* appear in per-user stats - nobody owns it.

**Rename** (`PATCH /:id/label`, managers only): renames a box and writes a `rename` ledger row
recording both old and new label, so historical entries stay traceable.

**Permissions**: `canManageBoxes()` in `api/routes/consumables.js` grants box management to the PI
or the hardcoded email `argajit05@gmail.com` (mirrored frontend-side as `isBoxManager`).
Replacing this with a `can_manage_consumables` flag on `users` is a known TODO.
Withdraw, correction, and recount are open to every authenticated user.

**Escaping**: this section uses `escHtml()` for text and `jsArg()` for values embedded in
`onclick` attributes. Use them for any new interpolation - box labels and item types are
user-supplied.

### Stock system (-80C freezer)
- Location format: `-80°C / Top Shelf / Box W1, A1`
- Two shelves: "Top Shelf" and "Below Top Shelf"
- Vial ID convention: `XX-NN-T` (organism code - serial - Master/Working)
- Delete restricted to entry creator or PI

## Deployment

### Server
- PowerEdge R730, Ubuntu, Docker, 24/7 internet
- Access via AnyDesk only (no direct SSH from outside)
- Site directory: `~/Desktop/mmilab`
- `.env` on server has: HOST_PORT=8080, JWT_SECRET=..., TUNNEL_TOKEN=...

### Update workflow (laptop to server)
1. Edit code on laptop (this directory)
2. `git add` + `git commit` + `git push` (to GitHub: argajitsarkr/mmilab, public)
3. On server via AnyDesk: `cd ~/Desktop/mmilab && ./deploy.sh`
4. Check new tunnel URL: `bash get-url.sh`

### Cloudflare Tunnel
- Currently using **quick tunnel** (free, random URL, changes on restart)
- URL pattern: `https://random-words.trycloudflare.com`
- Check URL: `docker logs mmilab-tunnel 2>&1 | grep trycloudflare.com`
- Will switch to named tunnel + custom domain once tripurauniv.ac.in subdomain or Hostinger domain is purchased

## Registered Users
| Name | Email | Role |
|------|-------|------|
| Dr. Surajit Bhattacharjee | sbhattacharjee@gmail.com | PI |
| Mr. Suman Paul | sumanpaul93udp@gmail.com | Scholar |
| Mr. Argajit Sarkar | argajit05@gmail.com | Scholar |
| Mr. Debajyoti Datta | debajyotidatta14@gmail.com | Scholar |
| Ms. Moumita Debnath | iammou2001@gmail.com | Scholar |
| Ms. Barsha Ghosh | barshaghosh5023@gmail.com | Scholar |
| Ms. Diptani Saha | diptani24@gmail.com | Scholar |
| Ms. Sanchari Pal | thesanchari@gmail.com | Scholar |

## Pending / Future Work
- **Domain**: Planning to buy from Hostinger and/or get subdomain from tripurauniv.ac.in
- **SSL**: `docker-compose.ssl.yml` and `nginx/ssl.conf` ready for Let's Encrypt once domain is set
- **Google indexing**: `robots.txt`, `sitemap.xml`, SEO meta tags already added - need to submit to Google Search Console after domain
- **Document indexing**: .docx extraction works via mammoth; legacy .doc has limited support; scanned/image PDFs won't extract text (would need OCR)
- **Quick tunnel URL changes on restart** - will be fixed once named tunnel + domain is configured

### Consumables backlog (ranked)
1. **Withdraw by item, not by box** - scholars currently pick the box themselves, which defeats
   FIFO. Let them pick "Motility Plate → 5" and have the server debit the oldest active box.
2. **Per-type reorder level** - replace the single hardcoded `CONS_LOW_STOCK = 20` with a
   `reorder_level` column on `consumable_types`, editable from Manage Types.
3. **Auto-activate the next box** - when a box empties, the next locked box stays locked until a
   manager notices, so withdrawals silently become impossible. Activate it in the same transaction.
4. **Replace the hardcoded manager email** with a `can_manage_consumables` flag on `users`.
5. **Burn rate / runway** - every withdrawal is timestamped; "≈40 plates/month, ~3 weeks left"
   is one query away and is the number that prevents running out mid-experiment.
6. **CSV export of the ledger** for annual stock statements (~15 lines on `/ledger/all`).
7. **QR per box** - the QR infrastructure already exists for strains; scan-to-withdraw on a phone
   is what makes people actually log usage.
8. **Archive pagination** - `showArchive()` fetches all boxes and filters client-side. Add a
   `?status=empty` filter to the API once there are a few hundred boxes.

### Local dev note
The laptop has **no Node runtime and no local Docker daemon**, so API routes and migrations cannot
be executed here - they are verified by reading, plus browser-based syntax/logic checks, and get
their first real run on the server. Watch `docker logs mmilab-api` after deploy for `MIGRATION DONE`
lines. `.claude/launch.json` points at a Python path that does not exist on this machine.
