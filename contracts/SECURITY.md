# JobEscrow security notes

This is a **self-review by the author, not an audit**. It records what was checked, what was changed because of it,
and what a professional auditor should still look at before any real money goes through. Do not deploy to mainnet on
the strength of this document.

## What the contract holds and who can touch it

| Role | Can | Cannot |
|---|---|---|
| Client | create an escrow, fund, approve, request changes (max 3 per milestone), refund after the freelancer's silence, dispute, withdraw | release money to anyone but the freelancer, change the freelancer, skip the review window |
| Freelancer | submit, claim after the client's silence, dispute, withdraw | approve their own work, claim inside the review window |
| Arbiter | split **one disputed milestone** between the two parties | touch any milestone that is not disputed, pay a third party |
| Owner | pause new money, change the arbiter, treasury, fee (cap 5%) and windows for **future** escrows | move user funds, change the terms of an escrow that already exists, block withdrawals |
| Anyone else | read | everything else |

## Properties the tests check

- Tokens in equals tokens out: a randomised test runs 20 milestones through refund, approve, claim, dispute and
  change-request paths and checks the contract ends at zero and every wallet balance adds up.
- A milestone moves only along the state machine; approving twice, claiming early or refunding submitted work reverts.
- Only the right party can call each function; admin functions are owner-only and bounded.
- `pause()` stops new money (createEscrow, fund) and never blocks a withdrawal or an exit.
- The fee and both windows are copied into each escrow at creation. Changing them later does not affect existing escrows.
- A change request restarts the freelancer's refund window and clears the old delivery, and cannot be repeated more than
  `MAX_REVISIONS` times, so it cannot be used to stall a payment forever or to turn a delivery into an instant refund.
- A token that takes a cut on transfer is rejected at funding instead of leaving the contract short of tokens.

## Changes made because of this review

1. **Terms are locked per escrow.** Before, `setFeeBps` and `setWindows` applied to work already funded, so the owner could
   shorten a review window or raise the fee mid-job. They now apply only to escrows created afterwards.
2. **`fund` checks what arrived.** Before, it credited the full amount even if the token delivered less. It now compares
   the contract's balance before and after and reverts on a mismatch.
3. **Change requests are bounded and reset the clocks.** Added together with the feature so it did not open a stalling attack.

## Known risks and trade-offs (not fixed)

- **The arbiter is one address.** It can only split a disputed milestone, but it decides every dispute alone. The owner can
  replace it at any time, including while a dispute is open. Mitigation: make the owner and arbiter multisigs; longer term
  use a panel or an on-chain court such as Kleros.
- **The owner is a single key** that can pause and swap the arbiter and treasury. Use a multisig and a timelock on mainnet.
- **USDC is centralised.** Circle can blacklist an address; a blacklisted freelancer cannot withdraw. Credits are pulled
  per address, so one blocked wallet never blocks anyone else.
- **Deliverables are links.** The contract stores only the hash of the link. If the link rots, the proof of delivery is
  the hash plus the chat and activity log kept by the API, which the arbiter reads.
- **`claim` and `refund` rely on block timestamps**, which a validator can skew by seconds. The windows are days.
- **Non-standard tokens** (rebasing, fee-on-transfer, hooks) are unsupported. The constructor does not verify the token;
  deploy with USDC and check the address.
- **The API trusts the chain, not the other way round.** It re-reads every transaction before updating its database, but a
  database mismatch can only affect what the website shows, never who can withdraw.
- **No upgrade path.** The contract is not upgradeable, so a bug means deploying a new one and migrating by hand.

## What a professional audit should focus on

1. The accounting in `_credit` and `resolve` (rounding of the fee and the split, dust).
2. `fund` and `withdraw` against hostile token behaviour, and reentrancy across `withdraw` plus the state changes.
3. The windows logic after `requestChanges` (`fundedAt` reset, `submittedAt` cleared) and the claim/refund races around it.
4. The owner and arbiter powers, and the plan for multisig, timelock and dispute resolution.
5. Gas griefing: `MAX_MILESTONES` is 20 and every loop is bounded by it.
6. `resolveStale`: the 30-day arbiter timeout (50/50 split) and `disputedAt`, so a dispute cannot be re-opened to reset the clock.
7. `freelancerBps`, the stored split of a resolved milestone, which the API reads back when it resyncs from the chain.

## Reporting

Found something? Open an issue on the repository, or contact the maintainer privately for anything that could put funds at risk.
