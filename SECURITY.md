# Security

## Reporting a problem

If you find a security issue in Mathlete Arena, please don't open a public issue. Contact the maintainer, Himanshu, through GitHub (@Himanshu-2005-code) with steps to reproduce, and allow time for a fix before sharing details.

## What the server already does

- **Passwords** are hashed with bcrypt and never logged. New passwords must be 6 to 72 bytes, because bcrypt ignores anything past 72.
- **Sign-in** uses a signed token (JWT) sent in a header, not a cookie. Set a long random `JWT_SECRET` in production; the server warns at startup if it's missing.
- **Rate limits**: 30 sign-in attempts per address per 15 minutes (`AUTH_RATE_LIMIT`) and 60 score submissions per address per minute (`WRITE_RATE_LIMIT`).
- **Scores are checked on the server**: puzzles are re-generated from their seed and verified; sprint scores must add up from the answers given; duel questions and scoring happen entirely on the server, impossibly fast answers are ignored, and wrong guesses lock the player out for a second.
- **Cross-site requests** are only accepted from the sites listed in `WEB_ORIGIN`.
- **Headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, a strict referrer policy, and `Cache-Control: no-store` on every API response.
- **Your data**: players can download everything stored about them, change their password, or delete their account from the profile page.
