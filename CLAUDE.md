# MMI Lab Website & Management System

## Project Overview
Website and internal management dashboard for the **Molecular Microbiology & Immunology (MMI) Lab** at **Tripura University**, led by **Dr. Surajit Bhattacharjee** (PI). Built as a static site + SPA dashboard backed by a Node.js API with SQLite.

## Architecture

### Stack
- **Frontend**: Static HTML/CSS pages (public site) + SPA dashboard (`dashboard.html` + `js/dashboard-app.js`)
- **Backend**: Node.js/Express API (`api/server.js`) on port 3500
- **Database**: SQLite via `better-sqlite3` (persistent Docker volume `mmilab-db`)
- **File Storage**: Uploaded docs in `/app/uploads` (persistent Docker volume `mmilab-uploads`)
- **Reverse Proxy**: Nginx (serves static files, proxies `/api/*` to Node)
- **Deployment**: Docker Compose (3 containers: nginx, api, cloudflare tunnel)

### Docker Services
```
mmilab-nginx    — nginx:alpine — serves static site + reverse proxy
mmilab-api      — node:20-alpine — Express API + SQLite
mmilab-tunnel   — cloudflared — free Cloudflare quick tunnel for public HTTPS
```

### Key Files
```
index.html              — Public homepage
team.html               — Team members grid (3-col CSS grid, divs not <a> tags)
gallery.html            — Photo gallery with lightbox + category filters
dashboard.html          — SPA shell (sidebar nav, all pages rendered by JS)
login.html              — JWT-based login
js/dashboard-app.js     — Core dashboard logic (all pages, modals, API calls)
css/styles.css          — Global styles (CSS variables, warm earth-tone theme)
css/profile.css         — Scholar card styles

api/server.js           — Express entry point
api/lib/init.js         — SQLite schema, migrations, user seeding
api/routes/auth.js      — Login, JWT, password change/reset, force-change
api/routes/strains.js   — Bacterial stock CRUD, checkout/checkin, QR codes
api/routes/docs.js      — Document upload, FTS5 search, download, delete
api/routes/projects.js  — Funded project management
api/routes/dashboard.js — Scholar profiles, PI overview

docker-compose.yml      — Production orchestration
api/Dockerfile          — Node 20 Alpine + build tools for native modules
nginx/default.conf      — Static files + API proxy config
.env                    — HOST_PORT, JWT_SECRET, TUNNEL_TOKEN (not in git)
deploy.sh               — One-command server update: git pull + docker compose up
get-url.sh              — Prints current Cloudflare tunnel URL
```

### Database Schema (SQLite)
- `users` — id, name, email, password_hash, role (pi/scholar), must_change_password
- `bacterial_inventory` — Vial_ID (PK), Organism, Phenotype_Notes, Stock_Type, Freezer_Location, Status, added_by
- `stock_log` — Tracks checkout/checkin/depleted/added actions per vial
- `documents` — Uploaded files with tag, folder, project_id; FTS5 via `document_search`
- `projects` — Funded projects (DBT, ICMR, DST, etc.) with members
- `scholar_profiles` — Research topics, enrollment dates, experiments
- `_migrations` — Tracks one-time migration keys (e.g., pw_reset_v3)

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
- **Google indexing**: `robots.txt`, `sitemap.xml`, SEO meta tags already added — need to submit to Google Search Console after domain
- **Document indexing**: .docx extraction works via mammoth; legacy .doc has limited support; scanned/image PDFs won't extract text (would need OCR)
- **Quick tunnel URL changes on restart** — will be fixed once named tunnel + domain is configured
