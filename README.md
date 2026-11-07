# Mathlete Arena

A Matiks-inspired competitive mental math game: live 1v1 duels with matchmaking and Elo ratings, a daily challenge, leaderboards, timed arithmetic sprints with adaptive difficulty, eight puzzle games (cross-math, KenKen, Sudoku, Killer Sudoku, Futoshiki, Math Maze, Hectoc, Make 24) and five arcade games (Flash Anzan, Number Memory, and three 60-second blitzes).

**Play it live: [mathlete-arena.onrender.com](https://mathlete-arena.onrender.com)**

Hosted on Render's free plan, so the first visit after a quiet spell can take up to a minute while the server wakes up, and accounts and scores reset whenever it redeploys.

## Features

**Competitive (phase 2)**

- **Live duels**: two players race through the same questions for 60 seconds over Socket.io; most right answers wins. The server generates every question from the duel seed, checks each answer and keeps the score, so a client can't fake a result. Leaving or resigning mid-duel is a loss.
- **Matchmaking**: a queue that pairs the longest-waiting players whose ratings are within 100 points, widening by 50 points for every second they wait.
- **Computer opponents**: if nobody turns up within 10 seconds, you play a bot instead (from `hypatia_bot` at 800 to `lovelace_bot` at 1600, whichever is closest to your rating). Bots are real accounts with ratings that move, they answer on the server at a pace that depends on their rating, and they're marked "computer" on the leaderboard. Usernames ending in `_bot` are reserved.
- **Friend challenges**: create a six-character code or link (`/duel?code=ABC234`); the duel starts when your friend joins.
- **Rematches**: for a minute after a duel, either player can ask for a rematch; it starts when the other accepts. Computer opponents accept at once.
- **Elo ratings**: everyone starts at 1000; K-factor 32. Draws are possible.
- **Daily challenge**: six games a day, the same for everyone: a sprint, a medium cross-math, a 5×5 KenKen, a 6×6 Sudoku, an easy Math Maze and a Hectoc. Only your first attempt at each counts. The server replays every sprint answer against the day's seed and checks every puzzle answer before ranking you. Days roll over at midnight IST (configurable).
- **Daily streaks**: days in a row with at least one daily result, shown on the daily page and your profile, with your best run. Today's streak holds until midnight even if you haven't played yet.
- **Leaderboards**: duel rating, today's sprint (points), today's fastest solve for each daily puzzle, and all-time bests for every arcade game.
- **Live scoreboard**: both scores drawn as tally marks while you play.
- **Sound and phones**: short synthesized blips for right and wrong answers (toggle in the top bar, remembered per browser), and a collapsible menu on narrow screens.

**Players and polish**

- **Achievements**: 15 to earn (first win, 100-point sprint, 7-day streak, 10 digits remembered and more), shown on the profile. They're worked out from your stats, so games played before they existed count too.
- **Weekly leaderboard**: daily sprint points added up from Monday to today (India time), next to the daily boards.
- **Player pages**: `/player/<name>` shows anyone's rating, duel record, daily streak and bests. Names on leaderboards and in recent duels link there.
- **Profile**: a chart of your rating over your last 50 duels, plus changing your password and deleting your account (both need your current password).
- **Leaderboards** show your own rank below the top 50 when you're further down, and refresh every 30 seconds while on screen.
- **Practice**: after a sprint, a table of the questions you missed and your slowest answers, and a note when you beat your best for that mode and length. Esc or "Stop sprint" ends a sprint without saving.
- **Puzzles**: Undo (button or Ctrl+Z) on the number grids, and on the Puzzles page a Hint that fills one correct cell and counts as a mistake. Daily puzzles have no hints.
- **Daily**: a countdown to the next set, and a button that copies a short summary of your results to share.
- **Theme**: light, dark or follow the device, remembered per browser, with no flash on load.
- Friendly not-found and error pages, an app icon and web manifest, link previews, `robots.txt` and a sitemap.

**Solo (phase 1)**

- **Practice sprints**: 30, 60 or 120 seconds of addition, subtraction, multiplication, division or a mix. Each question advances the moment you type the right answer; Enter on a wrong one counts a miss.
- **Adaptive difficulty**: 10 levels. Three fast correct answers in a row move you up; a miss or two slow answers move you down. Or pick a fixed level.
- **Cross-math**: 3×3 grids where every row and column is an equation (× and ÷ before + and −). Easy, medium and hard.
- **KenKen**: 5×5 or 6×6. Each number once per row and column, and each outlined cage must make its target with its operation. Every puzzle is checked to have exactly one solution.
- **Sudoku**: Mini 6×6 (2×3 boxes) and Classic 9×9, also with exactly one solution, and pencil notes.
- **Killer Sudoku**: 6×6 Sudoku with dashed cages (each inside one box) whose digits are distinct and add up to the cage's total. Usually no more than three starting numbers, and exactly one solution.
- **Futoshiki**: 5×5 or 6×6; each number once per row and column, and every < > ∧ ∨ sign between neighbours must hold. Exactly one solution.
- **Math Maze**: walk a 5×5 or 7×7 grid of alternating numbers and operators from top-left to bottom-right, without reusing a square, and land on the target. The path is worked out left to right, like a calculator.
- **Hectoc**: make 100 from six digits kept in order, with + − × ÷ ^, brackets, and neighbouring digits joined into bigger numbers. Every deal is checked to be solvable.
- **Make 24**: five hands of four numbers (1–9 or 1–13); make 24 from each using all four once with + − × ÷ and brackets. Every hand is solvable.
- Hectoc and Make 24 answers are typed as expressions (or tapped on a pad), shown live with their value, and evaluated in exact fractions by a small parser, never `eval`.
- All puzzles have a timer and mistake count, play by tap or keyboard, and accept any valid answer, not just the generated one.
- **Flash Anzan** (arcade): numbers flash one at a time and you type their total. Ten levels, from three 1-digit numbers a second apart to ten 3-digit numbers at 0.6 s; one wrong total ends the run.
- **Number Memory** (arcade): a number shows for a moment and you type it back; each round adds a digit.
- **Blitzes** (arcade): 60 seconds of quick choices, where a wrong one costs 3 seconds. **True or False** (is the sum right?), **Bigger or Smaller** (pick the larger of two sums) and **Missing Sign** (which of + − × ÷ fits; only ever one does). Questions get bigger every five right answers; play by tap or keyboard.
- **Accounts and stats**: username/password sign-in, best sprint scores per operation and length, fastest puzzle times, accuracy and recent games.
- **Server-verified puzzle solves**: puzzles come from seeded generators, so the server rebuilds each puzzle from its seed and checks the submitted grid or path before saving a time.

## Stack

| Part | Tech |
| --- | --- |
| `web/` | Next.js 15 (App Router), React 19, TypeScript, plain CSS |
| `server/` | Node, Express, Socket.io, better-sqlite3, bcrypt + JWT, zod |
| `shared/` | TypeScript game engine used by both: question generator, adaptive difficulty, cross-math generator and checker, API types |

npm workspaces tie the three together.

## Getting started

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

This starts the API and sockets on http://localhost:4000 and the web app on http://localhost:3000.

Other commands:

```bash
npm test          # engine and API tests (vitest + supertest)
npm run typecheck # type-check shared and server
npm run build     # production build of the web app
npm start         # run the built app and the server
```

### Configuration

| Variable | Where | Default |
| --- | --- | --- |
| `PORT` | server | `4000` |
| `JWT_SECRET` | server | insecure dev secret (required when `NODE_ENV=production`) |
| `WEB_ORIGIN` | server | `http://localhost:3000`; sites allowed to call the API and open sockets, comma-separated, `https://*.vercel.app` style wildcards allowed |
| `DB_PATH` | server | `server/data/mathlete.db` |
| `DAILY_UTC_OFFSET_MIN` | server | `330` (daily challenge rolls over at midnight IST) |
| `AUTH_RATE_LIMIT` | server | `30` (sign-in and sign-up attempts per address every 15 minutes) |
| `WRITE_RATE_LIMIT` | server | `60` (score submissions per address per minute: sprints, puzzles, daily and arcade) |
| `BACKUP_EVERY_HOURS` | server | `0` (off); back the database up this often while running, e.g. `24` |
| `BACKUP_DIR` | server | `backups/` next to the database |
| `BACKUP_KEEP` | server | `7` (older backups are deleted) |
| `GOOGLE_CLIENT_ID` | server | Unset (Google sign-in hidden). The Google OAuth client ID enables "Continue with Google" |
| `TURSO_DATABASE_URL` | server | Unset (plain local SQLite). A `libsql://…` Turso address makes `DB_PATH` a synced replica, so data survives deploys |
| `TURSO_AUTH_TOKEN` | server | Token for the Turso database |
| `TURSO_SYNC_SECONDS` | server | `60` (how often the replica pulls changes from Turso) |
| `TRUST_PROXY` | server | `1` in production (read client addresses from the host's proxy for rate limiting) |
| `BOT_AFTER_SECONDS` | server | `10` (seconds in the queue before a computer opponent steps in; `0` turns bots off) |
| `SERVE_WEB` | server | unset (set to `1` by `npm run start:prod` so one server serves the site too) |
| `LOG_REQUESTS` | server | `1` in production (one log line per API call: method, path, status, time; no query strings or bodies) |
| `SITE_URL` | web | Optional. The public address used in the sitemap and `robots.txt`; when unset it's taken from each request's host, so it's right on any domain |
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:4000` (empty in production builds, meaning same origin) |

## Deploying

In production one Node process serves everything: the API, the Socket.io duels and the Next.js site, on `$PORT`. Build and run it with:

```bash
npm ci
npm run build:prod   # builds the site to talk to its own origin
JWT_SECRET=some-long-random-string npm run start:prod
```

`start:prod` refuses to start without `JWT_SECRET`. Sign-in and sign-up are rate limited per address, and every response carries basic security headers. The SQLite database lives at `DB_PATH`, which must be on persistent storage or accounts and ratings are lost on every deploy.

### Google sign-in

Players can sign in with Google as well as a username and password. The first Google sign-in creates an account (username taken from their name, made unique); later ones sign in to the same account. Google-only players can set a password from their profile, and confirm account deletion by typing their username.

1. In Google Cloud Console, create an OAuth client ID of type **Web application**, with your site (e.g. `https://mathlete-arena.onrender.com`, plus `http://localhost:3000` for development) under **Authorized JavaScript origins**.
2. Set `GOOGLE_CLIENT_ID` on the server to that client ID. No client secret is needed: the server checks Google's signed ID token against the client ID.

Without `GOOGLE_CLIENT_ID` the Google button simply doesn't appear.

### Keeping data on the free plan with Turso

The server stores data with libSQL, which is SQLite-compatible. On its own it's a plain SQLite file. Give it a [Turso](https://turso.tech) database and the file becomes a local replica that syncs with Turso, so accounts and scores survive restarts and deploys on hosts without a disk:

1. Create a free Turso database and an auth token for it.
2. Set `TURSO_DATABASE_URL` (the `libsql://…` address) and `TURSO_AUTH_TOKEN` on the server, e.g. in Render > Environment.
3. Redeploy. Reads come from the local replica (fast); writes go to Turso.

Leave both unset for local development and tests.

### Render free plan

`render.yaml` (the default Blueprint) runs on Render's free plan. It costs nothing, but free instances have no disk, so accounts and scores reset on every restart or deploy, and the service sleeps after 15 idle minutes. Use `render.starter.yaml` as the Blueprint path (Starter plan, about $7/month, with a 1 GB disk) when you want data to stick.

### Backups

`npm run backup` copies the database at `DB_PATH` into `BACKUP_DIR` using SQLite's `VACUUM INTO`, so it's safe while the game is running, and keeps the newest `BACKUP_KEEP` copies. Set `BACKUP_EVERY_HOURS` to have the server do it on a schedule (the Render blueprint backs up daily). A backup on the same disk protects against a bad deploy or a corrupted file, not against losing the disk, so download one now and then: each is a single `.db` file you can open with any SQLite tool. To restore, stop the server and copy a backup over `DB_PATH`.

### Render (recommended)

The repo includes a `Dockerfile` and two Render blueprints: `render.yaml` (free plan, the default) and `render.starter.yaml` (Starter plan with a disk).

1. Sign in at [render.com](https://render.com) with GitHub.
2. New > Blueprint, and pick this repo. Render reads `render.yaml`, builds the Dockerfile and generates `JWT_SECRET`. To keep data across deploys, set the Blueprint path to `render.starter.yaml`, which also mounts a 1 GB disk at `/data` for the database.
3. Open the `onrender.com` URL it gives you. Every push to `main` redeploys.

The disk needs a paid instance (Starter). On the free plan the database resets on each deploy and the instance sleeps when idle.

### Vercel (site) + Render (game server)

Vercel runs sites as short-lived functions, so it can host the Next.js site but not the game server: duels need a long-lived Socket.io connection and the database needs a disk. Run the server on Render (above) and the site on Vercel:

1. Deploy the server on Render first and note its address, e.g. `https://mathlete-arena.onrender.com`.
2. In Vercel: Add New > Project, import this repo, and set **Root Directory** to `web`. `web/vercel.json` installs the whole workspace and builds the site.
3. Add these environment variables in the Vercel project, then deploy:
   - `NEXT_PUBLIC_API_URL` = the Render address (the build stops with a clear error if it's missing)
   - `SITE_URL` = your Vercel address, e.g. `https://mathlete.vercel.app` (for the sitemap)
4. On Render, set `WEB_ORIGIN` to the Vercel address so the server accepts its requests. Add `https://*.vercel.app` to the list too if you want preview deployments to work: `https://mathlete.vercel.app,https://*.vercel.app`.

Sign-in uses a token in the request header rather than cookies, so the site and the server can live on different domains. The Render address still serves the full game on its own as well.

### Railway or Fly.io

Both build the `Dockerfile` as is. Add a volume mounted at `/data` and set `JWT_SECRET`. The container listens on `$PORT` (default 8080) and answers health checks at `/api/health`.

### CI

`.github/workflows/ci.yml` runs the type check, the tests and a production build on every push to `main` and every pull request.

## Project layout

```
shared/src/
  rng.ts          seeded PRNG (same seed, same questions)
  questions.ts    question generator, levels 1-10
  adaptive.ts     difficulty that follows pace and accuracy
  crossmath.ts    cross-math generator, evaluator and checker
  kenken.ts       KenKen generator (unique solutions), solver, checker
  sudoku.ts       6×6 and 9×9 Sudoku generator (unique solutions), solver, checker
  maze.ts         Math Maze generator, path evaluator, checker
  expr.ts         safe expression parser and exact-fraction arithmetic
  hectoc.ts       Hectoc generator, solver and checker
  make24.ts       Make 24 generator, solver and checker
  gridsolver.ts   constraint solver for number grids (rows, columns, boxes, sum cages, < signs) and uniqueness
  killer.ts       Killer Sudoku generator and checker
  futoshiki.ts    Futoshiki generator and checker
  blitz.ts        True or False, Bigger or Smaller and Missing Sign question generators
  arcade.ts       arcade games: Flash Anzan levels, Number Memory, blitz list and score limits
  puzzles.ts      registry of the eight puzzle games: rules, difficulties, verify
  duel.ts         duel/daily question sequence, Elo, daily seeds, socket event types
  types.ts        API request/response types
server/src/
  app.ts          REST routes: auth, results, stats, puzzles
  compete.ts      daily challenge and leaderboard routes
  duels.ts        matchmaking queue, friend challenges, live duels, Elo
  bots.ts         computer opponents: accounts, pacing, matching
  auth.ts         password hashing, JWT, auth middleware
  db.ts           SQLite schema
  socket.ts       authenticated Socket.io wired to the duel manager
web/src/
  app/            pages: home, duel, daily, practice, puzzles, arcade, leaderboard, auth, profile
  components/     top bar, choice chips, puzzle boards (cross-math, KenKen/Sudoku, maze), tally marks
  lib/            API client, auth context, socket client
```

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | | Create account, returns token |
| POST | `/api/auth/login` | | Sign in, returns token |
| GET | `/api/health` | | Database check, uptime and version, for uptime monitors |
| GET | `/api/config` | | Runtime settings for the web app (Google client ID) |
| POST | `/api/auth/google` | | Sign in or sign up with a Google ID token (`credential`) |
| POST | `/api/auth/password` | yes | Change password (`current`, `next`) |
| GET | `/api/me/export` | yes | Download everything stored for your account as JSON |
| POST | `/api/auth/delete` | yes | Delete your account and its results (`password`) |
| GET | `/api/me` | yes | Current user |
| GET | `/api/players/:username` | | Public profile: rating, duel record, streak and bests |
| POST | `/api/results/practice` | yes | Save a finished sprint; returns your previous best and whether this beats it |
| GET | `/api/puzzles/crossmath?difficulty=` | | New puzzle without its solution |
| POST | `/api/results/puzzle` | yes | Verify and save a solved puzzle (`kind`: crossmath, kenken, sudoku or maze; `grid` or `path`) |
| GET | `/api/stats` | yes | Profile stats, including duel record |
| GET | `/api/daily` | optional | Today's sprint seed and puzzle, plus your results if signed in |
| POST | `/api/daily/sprint` | yes | Submit today's sprint answers for replay and ranking |
| POST | `/api/daily/puzzle` | yes | Submit a solution to one of today's puzzles (`kind`, then `grid` or `path`) |
| POST | `/api/arcade` | yes | Save an arcade run (`game`: flash, memory, truefalse, compare or sign; `score`); returns your best and rank |
| GET | `/api/leaderboard?kind=` | optional | Top 50 (plus your own row as `me` if you're signed in and ranked lower): `rating`, `daily-sprint`, `daily-puzzle` (cross-math), `daily-kenken`, `daily-sudoku`, `daily-maze`, `daily-hectoc`, `weekly-sprint`, `arcade-flash`, `arcade-memory`, `arcade-truefalse`, `arcade-compare`, `arcade-sign` |

### Socket events

Client to server: `queue:join`, `queue:leave`, `challenge:create`, `challenge:join {code}`, `challenge:cancel`, `duel:answer {index, value}`, `duel:forfeit`, `rematch:request`, `rematch:cancel`.

Server to client: `presence`, `queue:joined`, `queue:left`, `challenge:created {code}`, `challenge:error`, `duel:start`, `duel:progress`, `duel:wrong`, `duel:end`, `rematch:offered {from}`, `rematch:waiting {opponent}`, `rematch:declined {message}`.

Sockets authenticate with the same JWT as the REST API (`auth: { token }`).

## Roadmap

- Spectating live duels
- Seasonal ratings
- Hard versions of the daily KenKen, Sudoku and maze
- Mobile app (React Native) reusing `shared/`

## Limits

- The daily sprint's timing is measured in the browser, so the server checks the answers but trusts the one-minute limit (it does reject impossibly many correct answers).
- Arcade scores are reported by the browser; the server only rejects scores above each game's maximum.
- Matchmaking and open challenges live in server memory, so restarting the server clears the queue (finished duels and ratings are saved).
