# matik-game

A Matiks-style competitive mental math game: live 1v1 duels with matchmaking and Elo ratings, a daily challenge, leaderboards, timed arithmetic sprints with adaptive difficulty, and cross-math puzzles.

## Features

**Competitive (phase 2)**

- **Live duels**: two players race through the same questions for 60 seconds over Socket.io; most right answers wins. The server generates every question from the duel seed, checks each answer and keeps the score, so a client can't fake a result. Leaving or resigning mid-duel is a loss.
- **Matchmaking**: a queue that pairs the longest-waiting players whose ratings are within 100 points, widening by 50 points for every second they wait.
- **Friend challenges**: create a six-character code or link (`/duel?code=ABC234`); the duel starts when your friend joins.
- **Elo ratings**: everyone starts at 1000; K-factor 32. Draws are possible.
- **Daily challenge**: one sprint and one medium puzzle per day, the same for everyone. Only your first attempt counts. The server replays every sprint answer against the day's seed and checks the puzzle grid before ranking you. Days roll over at midnight IST (configurable).
- **Leaderboards**: duel rating, today's sprint (points) and today's puzzle (fastest time).
- **Live scoreboard**: both scores drawn as tally marks while you play.

**Solo (phase 1)**

- **Practice sprints**: 30, 60 or 120 seconds of addition, subtraction, multiplication, division or a mix. Each question advances the moment you type the right answer; Enter on a wrong one counts a miss.
- **Adaptive difficulty**: 10 levels. Three fast correct answers in a row move you up; a miss or two slow answers move you down. Or pick a fixed level.
- **Cross-math puzzles**: 3×3 grids where every row and column is an equation (× and ÷ before + and −). Easy, medium and hard, with a timer and mistake count. Any valid placement counts, not just the generated one.
- **Accounts and stats**: username/password sign-in, best sprint scores per operation and length, fastest puzzle times, accuracy and recent games.
- **Server-verified puzzle solves**: puzzles come from a seeded generator, so the server rebuilds each puzzle from its seed and checks the submitted grid before saving a time.

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
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:4000` |

## Project layout

```
shared/src/
  rng.ts          seeded PRNG (same seed, same questions)
  questions.ts    question generator, levels 1-10
  adaptive.ts     difficulty that follows pace and accuracy
  crossmath.ts    cross-math generator, evaluator and checker
  duel.ts         duel/daily question sequence, Elo, daily seeds, socket event types
  types.ts        API request/response types
server/src/
  app.ts          REST routes: auth, results, stats, puzzles
  compete.ts      daily challenge and leaderboard routes
  duels.ts        matchmaking queue, friend challenges, live duels, Elo
  auth.ts         password hashing, JWT, auth middleware
  db.ts           SQLite schema
  socket.ts       authenticated Socket.io wired to the duel manager
web/src/
  app/            pages: home, duel, daily, practice, puzzles, leaderboard, auth, profile
  components/     top bar, choice chips, cross-math board, tally marks
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
| POST | `/api/results/puzzle` | yes | Verify and save a solved puzzle |
| GET | `/api/stats` | yes | Profile stats, including duel record |
| GET | `/api/daily` | optional | Today's sprint seed and puzzle, plus your results if signed in |
| POST | `/api/daily/sprint` | yes | Submit today's sprint answers for replay and ranking |
| POST | `/api/daily/puzzle` | yes | Submit today's puzzle solution |
| GET | `/api/leaderboard?kind=rating\|daily-sprint\|daily-puzzle` | | Top 50 |

### Socket events

Client to server: `queue:join`, `queue:leave`, `challenge:create`, `challenge:join {code}`, `challenge:cancel`, `duel:answer {index, value}`, `duel:forfeit`.

Server to client: `presence`, `queue:joined`, `queue:left`, `challenge:created {code}`, `challenge:error`, `duel:start`, `duel:progress`, `duel:wrong`, `duel:end`.

Sockets authenticate with the same JWT as the REST API (`auth: { token }`).

## Roadmap

- Rematch button and spectating
- Seasonal ratings and weekly leaderboards
- More puzzle types (KenKen-style, number targets)
- Streaks and achievements
- Mobile app (React Native) reusing `shared/`

## Limits

- The daily sprint's timing is measured in the browser, so the server checks the answers but trusts the one-minute limit (it does reject impossibly many correct answers).
- Matchmaking and open challenges live in server memory, so restarting the server clears the queue (finished duels and ratings are saved).
