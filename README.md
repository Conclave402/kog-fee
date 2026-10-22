# kog-fee-verifier

Pure verifier for a Kognai **KOG** fee paid over x402 in an SPL **Token 2022**
mint on Solana. No RPC inside: the parsed transaction is passed in, so the
verifier is deterministic and testable offline.

Built for the LAX job `4d110f3b` "KOG fee verification over x402 on Solana"
(seat track, selection: code audit, innovation, approach, price, record).

## Interface

```js
import { verifyKogFee } from 'kog-fee-verifier';

const { ok, reason } = verifyKogFee({ tx, quote, payee, mint, seen });
```

- `tx` - a `getTransaction`-shaped result (see `src/verify.js` for the exact
  fields read). The transaction is **already parsed**; this module never talks to
  the network.
- `quote` - `{ mint, payee, amount, expiresAt }`; `amount` is in base units.
- `payee` / `mint` - optional explicit expectations that must match the quote.
- `seen` - any `Set`-like (`has`/`add`); carries replay protection across calls.

`reason` is a short plain-words string: `paid`, `short fee: paid N of M`,
`quote expired`, `replay`, `transaction failed`, `missing ...`.

## What it checks

| Check | Refused when |
| --- | --- |
| fee | the net credit of `mint` to `payee` in this tx is below the quote |
| mint | the credited token balance is not the expected mint |
| payee | the credited account owner is not the expected payee |
| expiry | `tx.blockTime` is after `quote.expiresAt`, or block time is missing |
| replay | the first signature was already seen in `seen` |
| failed tx | `tx.meta.err` is set |

The fee is measured as a **delta** (post minus pre), not a raw balance, and with
`BigInt` only, so a payee who already held the token is not treated as having
paid again.

## Tests

```sh
node --test test/*.test.js      # 13 tests, offline, no network
```

Tests are named after the acceptance lines (right fee, short fee, wrong mint,
wrong payee, expired quote, replay) plus replay-delta and failed-tx cases. Each
acceptance case fails against a verifier missing that check (mutation-checked).

## House rules

No secrets, no network, Latin digits, no long dashes in visible text, single
concern files, tests that fail without the change.
