import { useState } from "react";
import { useAccount, useBalance, useChainId, useConnect, useConfig, useDisconnect, useReadContract, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { sepolia } from "wagmi/chains";
import { formatUnits } from "viem";
import { useAuth } from "../context/useAuth";
import { useChainConfig } from "../context/useChainConfig";
import { useWalletAuth } from "../lib/useWalletAuth";
import { useEscrow, friendlyError } from "../lib/useEscrow";
import { erc20Abi } from "../lib/abis";
import escrowAbi from "../contracts/JobEscrow.abi.json";
import { LOCAL_CHAIN_ID, USDC } from "../lib/wagmi";
import { shortAddr } from "../lib/format";
import { Badge, Button, ErrorNote, Icon, PageHeader } from "../Components/ui";

const fmt = (v, d, max = 4) => (v === undefined ? "—" : Number(formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: max }));

function Balances({ address, chain }) {
  const chainId = useChainId();
  const config = useConfig();
  const eth = useBalance({ address });
  // When the API is wired to a contract, use its token; otherwise fall back to Circle's USDC for the connected network.
  const token = chain && chain.chainId === chainId ? chain.usdc : USDC[chainId];
  const usdc = useReadContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address], query: { enabled: !!token, refetchInterval: 8000 } });
  const owed = useReadContract({
    address: chain?.escrow,
    abi: escrowAbi,
    functionName: "withdrawable",
    args: [address],
    chainId: chain?.chainId,
    query: { enabled: !!chain, refetchInterval: 8000 },
  });
  const escrowTx = useEscrow();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function withdraw() {
    setBusy("withdraw");
    setError("");
    try {
      await escrowTx.onchain("withdraw");
      owed.refetch();
      usdc.refetch();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy("");
    }
  }

  async function faucet() {
    setBusy("faucet");
    setError("");
    try {
      const hash = await writeContract(config, { address: token, abi: erc20Abi, functionName: "faucet", args: [10_000n * 1_000_000n] });
      await waitForTransactionReceipt(config, { hash });
      usdc.refetch();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy("");
    }
  }

  const canWithdraw = owed.data !== undefined && owed.data > 0n;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-6">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Icon name="coins" size={16} /> USDC balance
          </p>
          <p className="mt-2 text-3xl font-bold">{token ? fmt(usdc.data, 6, 2) : "—"}</p>
          {!token && <p className="mt-1 text-xs text-muted">USDC is not available on this network.</p>}
          {chainId === LOCAL_CHAIN_ID && token && (
            <Button size="sm" variant="secondary" className="mt-3" loading={busy === "faucet"} onClick={faucet}>
              Get 10,000 test USDC
            </Button>
          )}
        </div>
        <div className="card p-6">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Icon name="eth" size={16} /> ETH for gas
          </p>
          <p className="mt-2 text-3xl font-bold">{fmt(eth.data?.value, 18)}</p>
        </div>
      </div>

      {chain && chain.chainId === chainId && (
        <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <p className="flex items-center gap-2 text-sm text-muted">
              <Icon name="lock" size={16} /> Ready to withdraw from escrow
            </p>
            <p className="mt-1 text-3xl font-bold">{fmt(owed.data, 6, 2)} <span className="text-base font-medium text-muted">USDC</span></p>
            <p className="mt-1 text-xs text-muted">Payouts and refunds wait here until you pull them to your wallet.</p>
          </div>
          <Button loading={busy === "withdraw"} disabled={!canWithdraw} onClick={withdraw}>
            Withdraw
          </Button>
          {busy === "withdraw" && escrowTx.step && <p className="w-full text-sm text-green-800">{escrowTx.step}</p>}
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

export default function Wallet() {
  const { user, openLogin } = useAuth();
  const chain = useChainConfig();
  const { address, isConnected, chain: current } = useAccount();
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const link = useWalletAuth();

  const linked = user?.walletAddress && address && user.walletAddress.toLowerCase() === address.toLowerCase();
  const hasInjected = connectors.length > 0;
  const targetChain = chain?.chainId ?? sepolia.id;
  const wrongNetwork = current && current.id !== targetChain;

  return (
    <div className="container-page max-w-3xl pb-8">
      <PageHeader
        title="Wallet"
        image="/Business growth-rafiki.svg"
        subtitle="Connect an Ethereum wallet to fund milestones, receive payouts and withdraw from escrow."
      />

      {!isConnected ? (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-800">
            <Icon name="wallet" size={26} />
          </span>
          <h2 className="mt-4 text-xl font-semibold">Connect your wallet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">We use MetaMask or any browser wallet. Connecting never moves funds; you approve every transaction yourself.</p>
          <Button className="mt-6" loading={isPending} disabled={!hasInjected} onClick={() => connect({ connector: connectors[0] })}>
            Connect wallet
          </Button>
          {!hasInjected && <p className="mt-3 text-sm text-muted">No browser wallet detected. Install MetaMask to continue.</p>}
          <div className="mt-4 w-full max-w-sm">
            <ErrorNote>{connectError?.shortMessage}</ErrorNote>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="text-sm text-muted">Connected</p>
              <p className="mt-1 font-mono text-lg font-semibold" title={address}>
                {shortAddr(address)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={wrongNetwork ? "amber" : "green"}>{current?.name || "Unknown network"}</Badge>
                {linked && <Badge tone="violet">Linked to your account</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {wrongNetwork && (
                <Button size="sm" variant="secondary" onClick={() => switchChain({ chainId: targetChain })}>
                  Switch network
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
          </div>

          <Balances address={address} chain={chain} />

          <div className="card p-6">
            <h2 className="font-semibold">Account link</h2>
            {linked ? (
              <p className="mt-1 text-sm text-muted">This wallet is verified on your account. Clients and freelancers on your jobs will pay and be paid at this address.</p>
            ) : user ? (
              <>
                <p className="mt-1 text-sm text-muted">Sign a free message to prove this wallet is yours and attach it to your account. No transaction, no gas.</p>
                <Button className="mt-4" loading={link.busy} onClick={link.run}>
                  Verify & link wallet
                </Button>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">Log in to attach this wallet to your account, or sign in directly with it.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={openLogin} variant="secondary">
                    Log in
                  </Button>
                  <Button loading={link.busy} onClick={link.run}>
                    Sign in with this wallet
                  </Button>
                </div>
              </>
            )}
            <div className="mt-3">
              <ErrorNote>{link.error}</ErrorNote>
            </div>
          </div>

          {current?.id === sepolia.id && (
            <p className="rounded-xl bg-surface px-4 py-3 text-sm text-muted">
              You are on the Sepolia test network. Get free test USDC from Circle's faucet and test ETH from any Sepolia faucet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
