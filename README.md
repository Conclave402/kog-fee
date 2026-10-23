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
| expiry | `quote.expiresAt` is missing, `tx.blockTime` is missing, or block time is after `quote.expiresAt` |
| replay | the first signature was already seen in `seen` |
| failed tx | `tx.meta.err` is set |

The fee is measured as a **delta** (post minus pre), not a raw balance, and with
`BigInt` only, so a payee who already held the token is not treated as having
paid again. The owner comes from the balance entry; a balance without `owner`
is not counted (real `getTransaction` always fills it).

## Tests

```sh
node --test test/*.test.js      # 15 tests, offline, no network
```

Tasks. Tests are named after the acceptance lines (right fee, short fee, wrong
mint, wrong payee, expired quote, replay) plus replay-delta, failed-tx, a
missing-expiry case (A10) and a recorded real KOG transaction replay (A11).

`fixtures/kog_transfer_recorded.json` is a real KOG Token 2022 transfer captured
from Solana mainnet with `getTransaction` (jsonParsed); its provenance is in the
file. A11 replays it offline.

## Planted-bug check

Kognai's reviewer plants a bug and expects the tests to catch it, so the suite
does the same to itself:

```sh
node scripts/mutants.mjs     # 12 planted bugs, 12 caught, 0 survived, about 4 seconds
```

For each entry in `scripts/mutants.json` it copies the repo to a temporary
folder, applies **one** bug with a single exact string replacement (a removed
check, an inverted comparison, a boundary off by one, a balance read where a
delta is required, an ignored mint, payee or caller argument), runs the suite
there, and requires it to fail. The process fails if any mutant survives or if
the unmutated baseline does not pass first, so a green run is evidence, not a
claim. Offline, zero dependencies, nothing outside the OS temp folder is used.

## House rules

No secrets, no network, Latin digits, no long dashes in visible text, single
concern files, tests that fail without the change.
