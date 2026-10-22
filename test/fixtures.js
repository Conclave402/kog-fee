// Test fixtures: build a getTransaction-shaped result with a single SPL Token
// 2022 transfer that credits `payee` by `amount` of `mint`.
//
// We model only the fields verifyKogFee reads, so every test is offline and has
// no RPC and no secrets.

export const MINT = 'KOGmint111111111111111111111111111111111111';
export const PAYEE = 'Payee11111111111111111111111111111111111111';
export const PAYER = 'Payer11111111111111111111111111111111111111';
export const OTHER = 'Other11111111111111111111111111111111111111';

// tokenAccountIndex points into accountKeys; pre/post balances reference it.
export function txPaying({
  mint = MINT,
  payee = PAYEE,
  amount = '1000',
  pre = null,
  signature = 'Sig1111111111111111111111111111111111111111111111111111111111111111',
  blockTime = 1_700_000_000,
  err = null,
  accountIndex = 2,
  preAmount = null,
} = {}) {
  const before = preAmount ?? '0';
  return {
    slot: 460077577,
    blockTime,
    meta: {
      err,
      preTokenBalances: [
        {
          accountIndex,
          mint,
          owner: payee,
          uiTokenAmount: { amount: before, decimals: 6 },
        },
      ],
      postTokenBalances: [
        {
          accountIndex,
          mint,
          owner: payee,
          uiTokenAmount: { amount: String(BigInt(before) + BigInt(amount)), decimals: 6 },
        },
      ],
    },
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [PAYER, mint, 'TokenAcct1111111111111111111111111111111111'],
      },
    },
  };
}

export function quote({ mint = MINT, payee = PAYEE, amount = '1000', expiresAt = 1_700_000_100 } = {}) {
  return { mint, payee, amount, expiresAt };
}
