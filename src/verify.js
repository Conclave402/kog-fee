// verifyKogFee: pure verifier for an x402 payment in an SPL Token 2022 mint.
//
// The parsed transaction is passed in (no RPC inside). The transaction shape
// accepted is the standard Solana JSON-RPC `getTransaction` result restricted to
// the fields we read:
//
//   tx = {
//     slot,
//     blockTime,                      // unix seconds, optional
//     meta: {
//       err,                          // null when the tx succeeded
//       preTokenBalances:  [{ accountIndex, mint, owner, uiTokenAmount }],
//       postTokenBalances: [{ accountIndex, mint, owner, uiTokenAmount }]
//     },
//     transaction: {
//       signatures: [ "<base58 signature>", ... ],
//       message: {
//         accountKeys: [ "<base58 pubkey>", ... ]   // static + loaded
//       }
//     }
//   }
//
// Quote shape:
//
//   quote = { mint, payee, amount, expiresAt }        // amount in base units (BigInt/string)
//
// seen is any Set-like with .has(value) and .add(value); it carries replay
// protection across calls. When omitted no replay state is kept.

const MAX_U64 = (1n << 64n) - 1n;

function toBigInt(value, field) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new TypeError(`${field} must be an integer`);
    return BigInt(value);
  }
  if (typeof value === 'string') return BigInt(value);
  if (value && typeof value === 'object' && typeof value.amount === 'string') {
    return BigInt(value.amount);
  }
  throw new TypeError(`${field} is not an integer amount`);
}

// Reduce a token balance entry to {accountIndex, mint, owner, amount}.
function normBalance(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const accountIndex = entry.accountIndex;
  const mint = entry.mint;
  const owner = entry.owner;
  const raw = entry.uiTokenAmount ?? entry.tokenAmount ?? entry;
  let amount;
  try {
    amount = toBigInt(raw.amount ?? raw, 'balance');
  } catch {
    amount = 0n;
  }
  return { accountIndex, mint, owner, amount };
}

// Net amount of `mint` that arrived at `payee` during this transaction.
//
// The owner must come from the balance entry (real getTransaction fills it). We
// do NOT fall back to the account key, because that is the token account, not
// the wallet, and would confuse a token account for a payee.
function credited(tx, mint, payee) {
  const meta = (tx && tx.meta) || {};
  const pre = (meta.preTokenBalances || []).map(normBalance).filter(Boolean);
  const post = (meta.postTokenBalances || []).map(normBalance).filter(Boolean);
  let total = 0n;
  for (const b of post) {
    if (b.mint !== mint) continue;
    if (b.owner !== payee) continue;
    const before = pre.find((p) => p.accountIndex === b.accountIndex);
    const delta = b.amount - (before ? before.amount : 0n);
    if (delta > 0n) total += delta;
  }
  return total;
}

export function verifyKogFee({ tx, quote, payee, mint, seen } = {}) {
  if (!tx || typeof tx !== 'object') return { ok: false, reason: 'missing transaction' };
  if (!quote || typeof quote !== 'object') return { ok: false, reason: 'missing quote' };

  const expectMint = mint ?? quote.mint;
  const expectPayee = payee ?? quote.payee;
  if (!expectMint) return { ok: false, reason: 'missing mint' };
  if (!expectPayee) return { ok: false, reason: 'missing payee' };

  // A failed transaction never settles a payment.
  if (tx.meta && tx.meta.err) return { ok: false, reason: 'transaction failed' };

  // Expiry is mandatory: a quote with no expiry cannot be bounded, so stripping
  // the field must not bypass the check. tx.blockTime must be <= expiresAt.
  if (quote.expiresAt == null) return { ok: false, reason: 'missing quote expiry' };
  const blockTime = tx.blockTime;
  if (blockTime == null) return { ok: false, reason: 'missing block time' };
  const exp = toBigInt(quote.expiresAt, 'expiresAt');
  if (BigInt(blockTime) > exp) return { ok: false, reason: 'quote expired' };

  // Replay protection by transaction signature (first signature).
  const sigs = tx.transaction && tx.transaction.message
    ? tx.transaction.signatures
    : undefined;
  const signature = Array.isArray(sigs) && sigs.length ? sigs[0] : undefined;
  if (seen && signature != null && typeof seen.has === 'function' && seen.has(signature)) {
    return { ok: false, reason: 'replay' };
  }

  const paid = credited(tx, expectMint, expectPayee);
  const required = toBigInt(quote.amount, 'quote.amount');
  if (paid < required) {
    return { ok: false, reason: `short fee: paid ${paid} of ${required}` };
  }

  if (seen && signature != null && typeof seen.add === 'function') seen.add(signature);
  return { ok: true, reason: 'paid' };
}

export { MAX_U64 };
export default verifyKogFee;
