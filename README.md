# matik-game

A Matiks-style competitive mental math game: timed arithmetic sprints with adaptive difficulty, cross-math puzzles, player accounts and stats. Real-time duels with matchmaking, Elo ratings, leaderboards and a daily challenge are next (see [Roadmap](#roadmap)).

## Features (phase 1)

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
| `NEXT_PUBLIC_API_URL` | web | `http://localhost:4000` |

## Project layout

```
shared/src/
  rng.ts          seeded PRNG (same seed, same questions)
  questions.ts    question generator, levels 1-10
  adaptive.ts     difficulty that follows pace and accuracy
  crossmath.ts    cross-math generator, evaluator and checker
  types.ts        API request/response types
server/src/
  app.ts          REST routes: auth, results, stats, puzzles
  auth.ts         password hashing, JWT, auth middleware
  db.ts           SQLite schema
  socket.ts       authenticated Socket.io (presence for now)
web/src/
  app/            pages: home, practice, puzzles, auth, profile
  components/     top bar, choice chips
  lib/            API client, auth context
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
| GET | `/api/stats` | yes | Profile stats |

## Roadmap

**Phase 2: multiplayer**
- 1v1 duels over Socket.io: both players get the same seeded questions, first to the target score wins
- Matchmaking queue by rating, plus challenge-a-friend links
- Elo rating updated after every duel
- Global and weekly leaderboards
- Daily challenge: one seeded sprint and puzzle per day, same for everyone

**Later**
- More puzzle types (KenKen-style, number targets)
- Streaks and achievements
- Mobile app (React Native) reusing `shared/`
