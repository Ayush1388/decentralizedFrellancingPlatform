const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const USDC = (n) => BigInt(Math.round(n * 1e6));
const S = { Pending: 0, Funded: 1, Submitted: 2, Released: 3, Refunded: 4, Disputed: 5, Resolved: 6 };
const DAY = 24 * 60 * 60;
const DELIVERABLE = ethers.keccak256(ethers.toUtf8Bytes("https://github.com/acme/repo/pull/1"));

async function deploy() {
  const [owner, client, freelancer, arbiter, treasury, stranger] = await ethers.getSigners();
  const usdc = await ethers.deployContract("MockUSDC");
  const escrow = await ethers.deployContract("JobEscrow", [await usdc.getAddress(), arbiter.address, treasury.address, 200]);
  await usdc.mint(client.address, USDC(100_000));
  await usdc.connect(client).approve(await escrow.getAddress(), ethers.MaxUint256);
  return { owner, client, freelancer, arbiter, treasury, stranger, usdc, escrow };
}

// An escrow with milestones [400, 900, 500], escrowId 1.
async function withEscrow() {
  const f = await deploy();
  await f.escrow.connect(f.client).createEscrow(f.freelancer.address, [USDC(400), USDC(900), USDC(500)]);
  return f;
}

async function submitted() {
  const f = await withEscrow();
  await f.escrow.connect(f.client).fund(1, 0);
  await f.escrow.connect(f.freelancer).submit(1, 0, DELIVERABLE);
  return f;
}

describe("JobEscrow", () => {
  describe("createEscrow", () => {
    it("stores parties and milestones and emits an event", async () => {
      const { escrow, client, freelancer } = await loadFixture(deploy);
      await expect(escrow.connect(client).createEscrow(freelancer.address, [USDC(10), USDC(20)]))
        .to.emit(escrow, "EscrowCreated")
        .withArgs(1, client.address, freelancer.address, [USDC(10), USDC(20)]);
      const [c, f, n] = await escrow.getEscrow(1);
      expect([c, f, n]).to.deep.equal([client.address, freelancer.address, 2n]);
      const m = await escrow.getMilestone(1, 1);
      expect(m.amount).to.equal(USDC(20));
      expect(m.status).to.equal(S.Pending);
    });

    it("rejects bad input", async () => {
      const { escrow, client, freelancer } = await loadFixture(deploy);
      const e = escrow.connect(client);
      await expect(e.createEscrow(ethers.ZeroAddress, [1])).to.be.revertedWithCustomError(escrow, "InvalidParams");
      await expect(e.createEscrow(client.address, [1])).to.be.revertedWithCustomError(escrow, "InvalidParams");
      await expect(e.createEscrow(freelancer.address, [])).to.be.revertedWithCustomError(escrow, "InvalidParams");
      await expect(e.createEscrow(freelancer.address, [0])).to.be.revertedWithCustomError(escrow, "InvalidParams");
      await expect(e.createEscrow(freelancer.address, Array(21).fill(1))).to.be.revertedWithCustomError(escrow, "InvalidParams");
    });
  });

  describe("happy path", () => {
    it("fund -> submit -> approve credits freelancer minus 2% and treasury the fee", async () => {
      const { escrow, usdc, client, freelancer, treasury } = await loadFixture(withEscrow);
      const addr = await escrow.getAddress();

      await expect(escrow.connect(client).fund(1, 1)).to.emit(escrow, "MilestoneFunded").withArgs(1, 1, USDC(900));
      expect(await usdc.balanceOf(addr)).to.equal(USDC(900));

      await expect(escrow.connect(freelancer).submit(1, 1, DELIVERABLE)).to.emit(escrow, "WorkSubmitted").withArgs(1, 1, DELIVERABLE);
      await expect(escrow.connect(client).approve(1, 1)).to.emit(escrow, "MilestoneReleased").withArgs(1, 1, USDC(882), USDC(18));

      expect(await escrow.withdrawable(freelancer.address)).to.equal(USDC(882));
      expect(await escrow.withdrawable(treasury.address)).to.equal(USDC(18));

      await escrow.connect(freelancer).withdraw();
      await escrow.connect(treasury).withdraw();
      expect(await usdc.balanceOf(freelancer.address)).to.equal(USDC(882));
      expect(await usdc.balanceOf(treasury.address)).to.equal(USDC(18));
      expect(await usdc.balanceOf(addr)).to.equal(0n);
    });

    it("withdraw pays once and then reverts", async () => {
      const { escrow, freelancer } = await loadFixture(submitted);
      await escrow.connect(await ethers.getSigner((await escrow.getEscrow(1))[0])).approve(1, 0);
      await escrow.connect(freelancer).withdraw();
      await expect(escrow.connect(freelancer).withdraw()).to.be.revertedWithCustomError(escrow, "NothingToWithdraw");
    });
  });

  describe("state machine", () => {
    it("blocks out-of-order transitions", async () => {
      const { escrow, client, freelancer } = await loadFixture(withEscrow);
      await expect(escrow.connect(freelancer).submit(1, 0, DELIVERABLE)).to.be.revertedWithCustomError(escrow, "BadStatus").withArgs(S.Pending);
      await expect(escrow.connect(client).approve(1, 0)).to.be.revertedWithCustomError(escrow, "BadStatus").withArgs(S.Pending);
      await escrow.connect(client).fund(1, 0);
      await expect(escrow.connect(client).fund(1, 0)).to.be.revertedWithCustomError(escrow, "BadStatus").withArgs(S.Funded);
      await expect(escrow.connect(client).approve(1, 0)).to.be.revertedWithCustomError(escrow, "BadStatus").withArgs(S.Funded);
      await expect(escrow.connect(freelancer).submit(1, 0, ethers.ZeroHash)).to.be.revertedWithCustomError(escrow, "InvalidParams");
    });

    it("cannot approve twice (no double payout)", async () => {
      const { escrow, client } = await loadFixture(submitted);
      await escrow.connect(client).approve(1, 0);
      await expect(escrow.connect(client).approve(1, 0)).to.be.revertedWithCustomError(escrow, "BadStatus").withArgs(S.Released);
    });

    it("rejects unknown escrows and milestones", async () => {
      const { escrow, client } = await loadFixture(withEscrow);
      await expect(escrow.connect(client).fund(99, 0)).to.be.revertedWithCustomError(escrow, "UnknownEscrow");
      await expect(escrow.connect(client).fund(1, 3)).to.be.revertedWithCustomError(escrow, "UnknownMilestone");
      await expect(escrow.getEscrow(0)).to.be.revertedWithCustomError(escrow, "UnknownEscrow");
    });
  });

  describe("access control", () => {
    it("only the right party can act", async () => {
      const { escrow, client, freelancer, stranger } = await loadFixture(withEscrow);
      await expect(escrow.connect(freelancer).fund(1, 0)).to.be.revertedWithCustomError(escrow, "NotClient");
      await expect(escrow.connect(stranger).fund(1, 0)).to.be.revertedWithCustomError(escrow, "NotClient");
      await escrow.connect(client).fund(1, 0);
      await expect(escrow.connect(client).submit(1, 0, DELIVERABLE)).to.be.revertedWithCustomError(escrow, "NotFreelancer");
      await escrow.connect(freelancer).submit(1, 0, DELIVERABLE);
      await expect(escrow.connect(freelancer).approve(1, 0)).to.be.revertedWithCustomError(escrow, "NotClient");
      await expect(escrow.connect(client).claim(1, 0)).to.be.revertedWithCustomError(escrow, "NotFreelancer");
      await expect(escrow.connect(stranger).dispute(1, 0)).to.be.revertedWithCustomError(escrow, "NotParty");
      await expect(escrow.connect(client).resolve(1, 0, 5000)).to.be.revertedWithCustomError(escrow, "NotArbiter");
    });

    it("admin functions are owner-only and bounded", async () => {
      const { escrow, owner, stranger } = await loadFixture(deploy);
      await expect(escrow.connect(stranger).pause()).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
      await expect(escrow.connect(stranger).setFeeBps(100)).to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
      await expect(escrow.connect(owner).setFeeBps(501)).to.be.revertedWithCustomError(escrow, "InvalidParams");
      await expect(escrow.connect(owner).setWindows(DAY - 1, 14 * DAY)).to.be.revertedWithCustomError(escrow, "InvalidParams");
      await expect(escrow.connect(owner).setWindows(7 * DAY, 91 * DAY)).to.be.revertedWithCustomError(escrow, "InvalidParams");
      await expect(escrow.connect(owner).setArbiter(ethers.ZeroAddress)).to.be.revertedWithCustomError(escrow, "InvalidParams");
      await escrow.connect(owner).setFeeBps(100);
      expect(await escrow.feeBps()).to.equal(100);
    });

    it("ownership moves in two steps", async () => {
      const { escrow, owner, stranger } = await loadFixture(deploy);
      await escrow.connect(owner).transferOwnership(stranger.address);
      expect(await escrow.owner()).to.equal(owner.address);
      await escrow.connect(stranger).acceptOwnership();
      expect(await escrow.owner()).to.equal(stranger.address);
    });
  });

  describe("auto-release (freelancer claim)", () => {
    it("is blocked inside the review window, allowed after", async () => {
      const { escrow, freelancer } = await loadFixture(submitted);
      await expect(escrow.connect(freelancer).claim(1, 0)).to.be.revertedWithCustomError(escrow, "TooEarly");
      await time.increase(7 * DAY + 1);
      await expect(escrow.connect(freelancer).claim(1, 0)).to.emit(escrow, "MilestoneReleased").withArgs(1, 0, USDC(392), USDC(8));
      expect(await escrow.withdrawable(freelancer.address)).to.equal(USDC(392));
    });

    it("respects a changed window", async () => {
      const { escrow, owner, freelancer } = await loadFixture(submitted);
      await escrow.connect(owner).setWindows(2 * DAY, 14 * DAY);
      await time.increase(2 * DAY + 1);
      await escrow.connect(freelancer).claim(1, 0);
    });
  });

  describe("refund (client reclaim)", () => {
    it("returns the full amount after the freelancer stays silent", async () => {
      const { escrow, usdc, client } = await loadFixture(withEscrow);
      await escrow.connect(client).fund(1, 2);
      await expect(escrow.connect(client).refund(1, 2)).to.be.revertedWithCustomError(escrow, "TooEarly");
      await time.increase(14 * DAY + 1);
      const before = await usdc.balanceOf(client.address);
      await expect(escrow.connect(client).refund(1, 2)).to.emit(escrow, "MilestoneRefunded").withArgs(1, 2, USDC(500));
      await escrow.connect(client).withdraw();
      expect((await usdc.balanceOf(client.address)) - before).to.equal(USDC(500));
    });

    it("is not available once work is submitted", async () => {
      const { escrow, client } = await loadFixture(submitted);
      await time.increase(30 * DAY);
      await expect(escrow.connect(client).refund(1, 0)).to.be.revertedWithCustomError(escrow, "BadStatus").withArgs(S.Submitted);
    });
  });

  describe("disputes", () => {
    it("freezes the milestone: nobody can approve, claim or refund", async () => {
      const { escrow, client, freelancer } = await loadFixture(submitted);
      await expect(escrow.connect(freelancer).dispute(1, 0)).to.emit(escrow, "MilestoneDisputed").withArgs(1, 0, freelancer.address);
      await time.increase(30 * DAY);
      await expect(escrow.connect(client).approve(1, 0)).to.be.revertedWithCustomError(escrow, "BadStatus").withArgs(S.Disputed);
      await expect(escrow.connect(freelancer).claim(1, 0)).to.be.revertedWithCustomError(escrow, "BadStatus").withArgs(S.Disputed);
      await expect(escrow.connect(client).refund(1, 0)).to.be.revertedWithCustomError(escrow, "BadStatus").withArgs(S.Disputed);
    });

    it("can be opened on a funded milestone too", async () => {
      const { escrow, client } = await loadFixture(withEscrow);
      await escrow.connect(client).fund(1, 0);
      await escrow.connect(client).dispute(1, 0);
      expect((await escrow.getMilestone(1, 0)).status).to.equal(S.Disputed);
    });

    it("arbiter splits 60/40 with the fee on the freelancer share only", async () => {
      const { escrow, arbiter, client, freelancer, treasury } = await loadFixture(submitted);
      await escrow.connect(client).dispute(1, 0);
      // amount 400: freelancer 60% = 240, fee 2% of 240 = 4.8, freelancer nets 235.2, client gets 160
      await expect(escrow.connect(arbiter).resolve(1, 0, 6000)).to.emit(escrow, "MilestoneResolved").withArgs(1, 0, 6000, USDC(235.2), USDC(160), USDC(4.8));
      expect(await escrow.withdrawable(freelancer.address)).to.equal(USDC(235.2));
      expect(await escrow.withdrawable(client.address)).to.equal(USDC(160));
      expect(await escrow.withdrawable(treasury.address)).to.equal(USDC(4.8));
    });

    it("supports full wins for either side and rejects out-of-range splits", async () => {
      const { escrow, arbiter, client, freelancer } = await loadFixture(withEscrow);
      await escrow.connect(client).fund(1, 0);
      await escrow.connect(client).fund(1, 1);
      await escrow.connect(client).dispute(1, 0);
      await escrow.connect(client).dispute(1, 1);
      await expect(escrow.connect(arbiter).resolve(1, 0, 10_001)).to.be.revertedWithCustomError(escrow, "InvalidParams");
      await escrow.connect(arbiter).resolve(1, 0, 0);
      expect(await escrow.withdrawable(client.address)).to.equal(USDC(400));
      expect(await escrow.withdrawable(freelancer.address)).to.equal(0n);
      await escrow.connect(arbiter).resolve(1, 1, 10_000);
      expect(await escrow.withdrawable(freelancer.address)).to.equal(USDC(882));
    });

    it("cannot be resolved twice or when not disputed", async () => {
      const { escrow, arbiter, client } = await loadFixture(submitted);
      await expect(escrow.connect(arbiter).resolve(1, 0, 5000)).to.be.revertedWithCustomError(escrow, "BadStatus").withArgs(S.Submitted);
      await escrow.connect(client).dispute(1, 0);
      await escrow.connect(arbiter).resolve(1, 0, 5000);
      await expect(escrow.connect(arbiter).resolve(1, 0, 5000)).to.be.revertedWithCustomError(escrow, "BadStatus").withArgs(S.Resolved);
    });
  });

  describe("pause", () => {
    it("stops new money in but never traps money already inside", async () => {
      const { escrow, owner, client, freelancer } = await loadFixture(submitted);
      await escrow.connect(owner).pause();
      await expect(escrow.connect(client).createEscrow(freelancer.address, [1])).to.be.revertedWithCustomError(escrow, "EnforcedPause");
      await expect(escrow.connect(client).fund(1, 1)).to.be.revertedWithCustomError(escrow, "EnforcedPause");
      // exits still work
      await escrow.connect(client).approve(1, 0);
      await escrow.connect(freelancer).withdraw();
      await escrow.connect(owner).unpause();
      await escrow.connect(client).fund(1, 1);
    });
  });

  describe("fee changes", () => {
    it("uses the fee in force at release", async () => {
      const { escrow, owner, client, freelancer } = await loadFixture(submitted);
      await escrow.connect(owner).setFeeBps(0);
      await escrow.connect(client).approve(1, 0);
      expect(await escrow.withdrawable(freelancer.address)).to.equal(USDC(400));
    });
  });

  describe("constructor", () => {
    it("rejects zero addresses and a fee above the cap", async () => {
      const [, a, b] = await ethers.getSigners();
      const usdc = await ethers.deployContract("MockUSDC");
      const F = await ethers.getContractFactory("JobEscrow");
      const t = await usdc.getAddress();
      await expect(F.deploy(ethers.ZeroAddress, a.address, b.address, 200)).to.be.revertedWithCustomError(F, "InvalidParams");
      await expect(F.deploy(t, ethers.ZeroAddress, b.address, 200)).to.be.revertedWithCustomError(F, "InvalidParams");
      await expect(F.deploy(t, a.address, ethers.ZeroAddress, 200)).to.be.revertedWithCustomError(F, "InvalidParams");
      await expect(F.deploy(t, a.address, b.address, 501)).to.be.revertedWithCustomError(F, "InvalidParams");
    });
  });

  // Conservation: whatever random path milestones take, every token funded ends up
  // withdrawable by exactly one of client / freelancer / treasury, and the contract's
  // token balance always equals the sum of what is still owed or still locked.
  describe("randomised conservation", () => {
    it("never creates or loses tokens", async () => {
      const f = await loadFixture(deploy);
      const { escrow, usdc, client, freelancer, arbiter, treasury } = f;
      const addr = await escrow.getAddress();
      let seed = 1234567;
      const rnd = (n) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);

      const amounts = Array.from({ length: 20 }, () => USDC(1 + rnd(5000) + rnd(100) / 100));
      await escrow.connect(client).createEscrow(freelancer.address, amounts);
      const totalFunded = amounts.reduce((a, b) => a + b, 0n);
      const start = (await usdc.balanceOf(client.address)) + (await usdc.balanceOf(freelancer.address)) + (await usdc.balanceOf(treasury.address));

      for (let i = 0; i < amounts.length; i++) {
        await escrow.connect(client).fund(1, i);
        const path = rnd(5);
        if (path === 0) {
          await time.increase(15 * DAY);
          await escrow.connect(client).refund(1, i);
        } else if (path === 1) {
          await escrow.connect(freelancer).submit(1, i, DELIVERABLE);
          await escrow.connect(client).approve(1, i);
        } else if (path === 2) {
          await escrow.connect(freelancer).submit(1, i, DELIVERABLE);
          await time.increase(8 * DAY);
          await escrow.connect(freelancer).claim(1, i);
        } else {
          if (path === 4) await escrow.connect(freelancer).submit(1, i, DELIVERABLE);
          await escrow.connect(freelancer).dispute(1, i);
          await escrow.connect(arbiter).resolve(1, i, rnd(10_001));
        }
      }

      const owed = (await escrow.withdrawable(client.address)) + (await escrow.withdrawable(freelancer.address)) + (await escrow.withdrawable(treasury.address));
      expect(owed).to.equal(totalFunded);
      expect(await usdc.balanceOf(addr)).to.equal(totalFunded);

      for (const s of [client, freelancer, treasury]) {
        if ((await escrow.withdrawable(s.address)) > 0n) await escrow.connect(s).withdraw();
      }
      const end = (await usdc.balanceOf(client.address)) + (await usdc.balanceOf(freelancer.address)) + (await usdc.balanceOf(treasury.address));
      expect(end).to.equal(start); // everything funded came back out to exactly these three wallets
      expect(await usdc.balanceOf(addr)).to.equal(0n);
    });
  });
});
