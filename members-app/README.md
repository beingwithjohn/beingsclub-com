# Beings Club members entrance

The first private slice of the members area:

- an approved email asks for a six-digit, ten-minute, single-use code;
- the public response is identical whether or not the address is approved;
- a successful code creates a revocable 30-day bearer session;
- only a host session can read or change the approved-address list;
- the host page is static, but no member data is in it — the private API
  returns that only after checking the session and host role;
- the wider members area remains a private holding page until its features are
  ready.

The static source is in `members-app/app/` and builds to `/members/`:

```sh
node members-app/app/build.js
```

Production uses `https://practice-log.beingsclub.workers.dev`. For local work:

```sh
node members-app/app/build.js --api http://localhost:8787
```

Membership data is in the separate Cloudflare D1 database
`beings-club-members`. The current Worker shares the already-configured Beings
Club mail sender; it does not share Practice Log tables. Its migration is
`practice-log/members-migrations/0001_members.sql`, which seeds
`john@spacetobe.xyz` as the first approved address and host.

Apply migrations before deploying the Worker:

```sh
cd practice-log
npx wrangler d1 migrations apply beings-club-members --remote
npm test
npx wrangler deploy
```

Then publish the static client with the normal site wrapper from the repo root:

```sh
./build/deploy.sh "Open private member access"
```

Never put a code, session token, `LINK_KEY`, or `RESEND_API_KEY` in this repo.
