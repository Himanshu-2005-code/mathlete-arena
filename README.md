# matik-game

A Matiks-style competitive mental math game: live 1v1 duels with matchmaking and Elo ratings, a daily challenge, leaderboards, timed arithmetic sprints with adaptive difficulty, and four puzzle games: cross-math, KenKen, Sudoku and Math Maze.

## Features

**Competitive (phase 2)**

- **Live duels**: two players race through the same questions for 60 seconds over Socket.io; most right answers wins. The server generates every question from the duel seed, checks each answer and keeps the score, so a client can't fake a result. Leaving or resigning mid-duel is a loss.
- **Matchmaking**: a queue that pairs the longest-waiting players whose ratings are within 100 points, widening by 50 points for every second they wait.
- **Computer opponents**: if nobody turns up within 10 seconds, you play a bot instead (from `hypatia_bot` at 800 to `lovelace_bot` at 1600, whichever is closest to your rating). Bots are real accounts with ratings that move, they answer on the server at a pace that depends on their rating, and they're marked "computer" on the leaderboard. Usernames ending in `_bot` are reserved.
- **Friend challenges**: create a six-character code or link (`/duel?code=ABC234`); the duel starts when your friend joins.
- **Rematches**: for a minute after a duel, either player can ask for a rematch; it starts when the other accepts. Computer opponents accept at once.
- **Elo ratings**: everyone starts at 1000; K-factor 32. Draws are possible.
- **Daily challenge**: five games a day, the same for everyone: a sprint, a medium cross-math, a 5×5 KenKen, a 6×6 Sudoku and an easy Math Maze. Only your first attempt at each counts. The server replays every sprint answer against the day's seed and checks every puzzle answer before ranking you. Days roll over at midnight IST (configurable).
- **Daily streaks**: days in a row with at least one daily result, shown on the daily page and your profile, with your best run. Today's streak holds until midnight even if you haven't played yet.
- **Leaderboards**: duel rating, today's sprint (points), and today's fastest solve for each of the four puzzles.
- **Live scoreboard**: both scores drawn as tally marks while you play.
- **Sound and phones**: short synthesized blips for right and wrong answers (toggle in the top bar, remembered per browser), and a collapsible menu on narrow screens.

**Solo (phase 1)**

- **Practice sprints**: 30, 60 or 120 seconds of addition, subtraction, multiplication, division or a mix. Each question advances the moment you type the right answer; Enter on a wrong one counts a miss.
- **Adaptive difficulty**: 10 levels. Three fast correct answers in a row move you up; a miss or two slow answers move you down. Or pick a fixed level.
- **Cross-math**: 3×3 grids where every row and column is an equation (× and ÷ before + and −). Easy, medium and hard.
- **KenKen**: 5×5 or 6×6. Each number once per row and column, and each outlined cage must make its target with its operation. Every puzzle is checked to have exactly one solution.
- **Sudoku**: Mini 6×6 (2×3 boxes) and Classic 9×9, also with exactly one solution, and pencil notes.
- **Math Maze**: walk a 5×5 or 7×7 grid of alternating numbers and operators from top-left to bottom-right, without reusing a square, and land on the target. The path is worked out left to right, like a calculator.
- All puzzles have a timer and mistake count, play by tap or keyboard, and accept any valid answer, not just the generated one.
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
| `WEB_ORIGIN` | server | `http://localhost:3000` (CORS) |
| `DB_PATH` | server | `server/data/matik.db` |
| `DAILY_UTC_OFFSET_MIN` | server | `330` (daily challenge rolls over at midnight IST) |
| `BOT_AFTER_SECONDS` | server | `10` (seconds in the queue before a computer opponent steps in; `0` turns bots off) |
| `SERVE_WEB` | server | unset (set to `1` by `npm run start:prod` so one server serves the site too) |
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:4000` (empty in production builds, meaning same origin) |

## Deploying

In production one Node process serves everything: the API, the Socket.io duels and the Next.js site, on `$PORT`. Build and run it with:

```bash
npm ci
npm run build:prod   # builds the site to talk to its own origin
JWT_SECRET=some-long-random-string npm run start:prod
```

`start:prod` refuses to start without `JWT_SECRET`. The SQLite database lives at `DB_PATH`, which must be on persistent storage or accounts and ratings are lost on every deploy.

### Render (recommended)

The repo includes a `Dockerfile` and a `render.yaml` blueprint.

1. Sign in at [render.com](https://render.com) with GitHub.
2. New > Blueprint, and pick this repo. Render reads `render.yaml`, builds the Dockerfile, generates `JWT_SECRET`, and mounts a 1 GB disk at `/data` for the database.
3. Open the `onrender.com` URL it gives you. Every push to `main` redeploys.

The disk needs a paid instance (Starter). To try it on the free plan, delete the `disk` block from `render.yaml` first; it works, but the database resets on each deploy and the free instance sleeps when idle.

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
  puzzles.ts      registry of the four puzzle games: rules, difficulties, verify
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
  app/            pages: home, duel, daily, practice, puzzles, leaderboard, auth, profile
  components/     top bar, choice chips, puzzle boards (cross-math, KenKen/Sudoku, maze), tally marks
  lib/            API client, auth context, socket client
```

## API

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | | Create account, returns token |
| POST | `/api/auth/login` | | Sign in, returns token |
| GET | `/api/me` | yes | Current user |
| POST | `/api/results/practice` | yes | Save a finished sprint |
| GET | `/api/puzzles/crossmath?difficulty=` | | New puzzle without its solution |
| POST | `/api/results/puzzle` | yes | Verify and save a solved puzzle (`kind`: crossmath, kenken, sudoku or maze; `grid` or `path`) |
| GET | `/api/stats` | yes | Profile stats, including duel record |
| GET | `/api/daily` | optional | Today's sprint seed and puzzle, plus your results if signed in |
| POST | `/api/daily/sprint` | yes | Submit today's sprint answers for replay and ranking |
| POST | `/api/daily/puzzle` | yes | Submit a solution to one of today's puzzles (`kind`, then `grid` or `path`) |
| GET | `/api/leaderboard?kind=` | | Top 50: `rating`, `daily-sprint`, `daily-puzzle` (cross-math), `daily-kenken`, `daily-sudoku`, `daily-maze` |

### Socket events

Client to server: `queue:join`, `queue:leave`, `challenge:create`, `challenge:join {code}`, `challenge:cancel`, `duel:answer {index, value}`, `duel:forfeit`, `rematch:request`, `rematch:cancel`.

Server to client: `presence`, `queue:joined`, `queue:left`, `challenge:created {code}`, `challenge:error`, `duel:start`, `duel:progress`, `duel:wrong`, `duel:end`, `rematch:offered {from}`, `rematch:waiting {opponent}`, `rematch:declined {message}`.

Sockets authenticate with the same JWT as the REST API (`auth: { token }`).

## Roadmap

- Spectating live duels
- Seasonal ratings and weekly leaderboards
- Hard versions of the daily KenKen, Sudoku and maze
- Achievements
- Mobile app (React Native) reusing `shared/`

## Limits

- The daily sprint's timing is measured in the browser, so the server checks the answers but trusts the one-minute limit (it does reject impossibly many correct answers).
- Matchmaking and open challenges live in server memory, so restarting the server clears the queue (finished duels and ratings are saved).
