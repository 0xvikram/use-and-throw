"use client";

import { JsonRpcProvider, formatEther } from "ethers";
import { useWallet } from "@/wallet/WalletProvider";
import { useMemo, useState } from "react";

export default function Home() {
  const { wallet, chain, setChain, createBurner, clearBurner } = useWallet();
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [txs, setTxs] = useState<Array<{
    hash: string;
    from: string;
    to: string;
    value: string;
    timeStamp: string;
  }> | null>(null);
  const [loadingTxs, setLoadingTxs] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const explorerBase = useMemo(() => {
    if (chain === "sepolia") return "https://sepolia.etherscan.io";
    if (chain === "holesky") return "https://holesky.etherscan.io";
    return "https://etherscan.io";
  }, [chain]);

  const copyAddress = async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet.walletAddress);
      alert("Address copied");
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  const fetchBalance = async () => {
    if (!wallet) return;
    setLoadingBalance(true);
    setBalanceError(null);
    try {
      const rpc =
        chain === "sepolia"
          ? "https://ethereum-sepolia-rpc.publicnode.com"
          : chain === "holesky"
            ? "https://ethereum-holesky-rpc.publicnode.com"
            : "https://cloudflare-eth.com";
      const provider = new JsonRpcProvider(rpc);
      const raw = await provider.getBalance(wallet.walletAddress);
      setBalance(formatEther(raw));
    } catch (err) {
      console.error("Balance fetch failed", err);
      setBalanceError("Could not fetch balance. Try again.");
    } finally {
      setLoadingBalance(false);
    }
  };

  const fetchTxs = async () => {
    if (!wallet) return;
    const apiKey = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY;
    if (!apiKey) {
      setTxError("Set NEXT_PUBLIC_ETHERSCAN_API_KEY to fetch history.");
      return;
    }
    setLoadingTxs(true);
    setTxError(null);
    try {
      type EtherscanTx = {
        hash: string;
        from: string;
        to: string;
        value: string;
        timeStamp: string;
      };
      // Etherscan V2 API - unified endpoint with chainid parameter
      const chainId = chain === "sepolia" ? "11155111" : chain === "holesky" ? "17000" : "1";
      const apiBase = "https://api.etherscan.io/v2/api";

      const url = `${apiBase}?chainid=${chainId}&module=account&action=txlist&address=${wallet.walletAddress}&startblock=0&endblock=99999999&page=1&offset=10&sort=desc&apikey=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      console.log("Etherscan API response:", data);
      console.log("Response status:", data.status);
      console.log("Response message:", data.message);
      console.log("Result type:", typeof data.result);
      console.log("Result value:", data.result);
      
      // Handle case where result is a string (error message)
      if (typeof data.result === "string") {
        console.warn("API returned string result:", data.result);
        setTxs([]);
        return;
      }
      
      if (!data.result || !Array.isArray(data.result)) {
        console.warn("No valid result array in API response");
        setTxs([]);
        return;
      }
      
      if (data.status === "0" && data.message === "No transactions found") {
        console.log("No transactions found for this address");
        setTxs([]);
        return;
      }
      
      if (data.status === "1") {
        setTxs(
          data.result.map((t: EtherscanTx) => ({
            hash: t.hash,
            from: t.from,
            to: t.to,
            value: t.value,
            timeStamp: t.timeStamp,
          })),
        );
      } else {
        console.warn("Unexpected API status:", data.status);
        setTxs([]);
      }
    } catch (err) {
      console.error("Tx fetch failed", err);
      setTxError("Could not fetch transactions.");
    } finally {
      setLoadingTxs(false);
    }
  };

  const buttonStyle: React.CSSProperties = {
    padding: "0.6rem 1rem",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    background: "#111827",
    color: "white",
    cursor: "pointer",
    fontSize: "0.95rem",
  };

  const ghostButton: React.CSSProperties = {
    ...buttonStyle,
    background: "#f3f4f6",
    color: "#111827",
  };

  return (
    <main
      style={{
        padding: "1.5rem",
        maxWidth: 520,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      <header>
        <p style={{ color: "#6b7280", fontSize: "0.9rem", margin: 0 }}>
          use-and-throw
        </p>
        <h1 style={{ margin: "0.2rem 0" }}>Burner wallet</h1>
        <p style={{ margin: 0, color: "#4b5563" }}>
          Temporary Ethereum address generated in-memory. Refresh = gone.
        </p>
      </header>

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <select
          value={chain}
          onChange={(e) =>
            setChain(e.target.value as "ethereum" | "sepolia" | "holesky")
          }
          style={{
            padding: "0.5rem",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "white",
          }}
        >
          <option value="ethereum">Mainnet</option>
          <option value="sepolia">Sepolia</option>
          <option value="holesky">Holesky</option>
        </select>
        <button style={buttonStyle} onClick={createBurner}>
          Create burner
        </button>
        <button style={ghostButton} onClick={clearBurner} disabled={!wallet}>
          Forget
        </button>
        <button
          style={{ ...ghostButton, borderStyle: "dashed" }}
          onClick={copyAddress}
          disabled={!wallet}
        >
          Copy address
        </button>
        <button
          style={{ ...ghostButton, borderStyle: "dotted" }}
          onClick={fetchBalance}
          disabled={!wallet || loadingBalance}
        >
          {loadingBalance ? "Fetching..." : "Check balance"}
        </button>
        <button
          style={{ ...ghostButton, borderStyle: "dotted" }}
          onClick={fetchTxs}
          disabled={!wallet || loadingTxs}
        >
          {loadingTxs ? "Loading txs..." : "Load activity"}
        </button>
      </div>

      <section
        style={{
          border: "1px solid #111827",
          borderRadius: "12px",
          padding: "1rem",
          background: "#0b0c10",
          color: "#f9fafb",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.75rem",
          }}
        >
          <div style={{ fontWeight: 600 }}>Current burner</div>
          <span
            style={{
              fontSize: "0.85rem",
              color: wallet ? "#bbf7d0" : "#fcd34d",
              background: wallet ? "#064e3b" : "#78350f",
              border: wallet ? "1px solid #10b981" : "1px solid #f59e0b",
              padding: "0.15rem 0.5rem",
              borderRadius: "999px",
            }}
          >
            {wallet ? "Ready" : "None"}
          </span>
        </div>

        {wallet ? (
          <>
            <ul
              style={{
                lineHeight: 1.7,
                margin: 0,
                paddingLeft: "1rem",
                color: "#e5e7eb",
              }}
            >
              <li>
                <strong>Address:</strong>{" "}
                <code style={{ background: "#111827", color: "#fefefe" }}>
                  {wallet.walletAddress}
                </code>
              </li>
              <li>
                <strong>Private key:</strong>{" "}
                <code style={{ background: "#111827", color: "#fefefe" }}>
                  {wallet.privateKey}
                </code>
              </li>
              <li>
                <strong>Chain:</strong> {chain}
              </li>
              <li>
                <strong>Balance:</strong>{" "}
                {balance ? `${balance} ETH` : "Not checked"}
                {balanceError ? (
                  <span style={{ color: "#f87171", marginLeft: "0.5rem" }}>
                    {balanceError}
                  </span>
                ) : null}
              </li>
              <li>
                <a
                  href={`${explorerBase}/address/${wallet.walletAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#93c5fd" }}
                >
                  View activity on Etherscan
                </a>
              </li>
            </ul>
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                Recent transactions
              </div>
              {txError && (
                <p style={{ color: "#f87171", margin: 0 }}>{txError}</p>
              )}
              {!txs && !txError && (
                <p style={{ color: "#9ca3af", margin: 0 }}>
                  Click &quot;Load activity&quot; to fetch recent transactions.
                </p>
              )}
              {txs && txs.length === 0 && (
                <p style={{ color: "#9ca3af", margin: 0 }}>
                  No transactions found for this address.
                </p>
              )}
              {txs && txs.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {txs.map((t) => (
                    <li
                      key={t.hash}
                      style={{
                        padding: "0.5rem 0",
                        borderTop: "1px solid #1f2937",
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <a
                        href={`${explorerBase}/tx/${t.hash}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#93c5fd" }}
                      >
                        {t.hash.slice(0, 10)}…
                      </a>
                      <span style={{ color: "#9ca3af" }}>
                        {new Date(Number(t.timeStamp) * 1000).toLocaleString()}
                      </span>
                      <span style={{ marginLeft: "auto" }}>
                        {formatEther(t.value)} ETH
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <p style={{ margin: 0, color: "#d1d5db" }}>
            No burner yet. Click &quot;Create burner&quot; to generate one.
          </p>
        )}
      </section>
    </main>
  );
}
