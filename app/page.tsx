"use client";

import {
  JsonRpcProvider,
  formatEther,
  parseEther,
  BrowserProvider,
} from "ethers";
import { useWallet } from "@/wallet/WalletProvider";
import { useMemo, useState, useEffect } from "react";

export default function Home() {
  const { wallet, chain, setChain, createBurner, clearBurner, setExpiry } = useWallet();
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
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  // MetaMask state
  const [metaMaskConnected, setMetaMaskConnected] = useState(false);
  const [metaMaskAddress, setMetaMaskAddress] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState("0.01");
  const [fundingInProgress, setFundingInProgress] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Wallet expiry state
  const [expiryMinutes, setExpiryMinutes] = useState(2); // default 2 minutes
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

  const chainHexMap: Record<"ethereum" | "sepolia" | "holesky", string> = {
    ethereum: "0x1",
    sepolia: "0xaa36a7",
    holesky: "0x4268",
  };

  const ensureCorrectNetwork = async (provider: BrowserProvider) => {
    const desiredChain = chainHexMap[chain];
    if (!desiredChain) return;
    const network = await provider.getNetwork();
    const current = "0x" + network.chainId.toString(16);
    if (current.toLowerCase() === desiredChain.toLowerCase()) return;
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: desiredChain }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (switchErr: any) {
      if (switchErr?.code === 4902 || switchErr?.data?.originalError?.code === 4902) {
        alert("Please add this network in MetaMask first, then retry.");
      }
      throw switchErr;
    }
  };

  // Prefer the MetaMask provider in multi-wallet environments
  const getMetaMaskProvider = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth: any = (window as any).ethereum;
    if (!eth) return null;
    if (eth.providers?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mm = eth.providers.find((p: any) => p.isMetaMask);
      if (mm) return mm;
    }
    return eth.isMetaMask ? eth : eth;
  };

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

  const copyPrivateKey = async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet.privateKey);
      alert(
        "Private key copied! Import it into MetaMask to make this wallet permanent.",
      );
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  // Connect to MetaMask
  const connectMetaMask = async () => {
    if (typeof window.ethereum === "undefined") {
      alert("MetaMask is not installed. Please install MetaMask extension.");
      return;
    }

    try {
      const mm = getMetaMaskProvider();
      if (!mm) {
        alert("No MetaMask provider detected. Ensure MetaMask is enabled.");
        return;
      }

      // First ensure correct network, then recreate provider to avoid network-changed errors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = new BrowserProvider(mm as any);
      await ensureCorrectNetwork(provider);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const freshProvider = new BrowserProvider(mm as any);
      const accounts = await freshProvider.send("eth_requestAccounts", []);
      setMetaMaskAddress(accounts[0]);
      setMetaMaskConnected(true);
    } catch (err) {
      console.error("MetaMask connection failed", err);
      alert("Failed to connect MetaMask");
    }
  };

  // Disconnect MetaMask
  const disconnectMetaMask = () => {
    setMetaMaskConnected(false);
    setMetaMaskAddress(null);
  };

  // Fund burner wallet from MetaMask
  const fundBurnerWallet = async () => {
    if (!wallet || !metaMaskConnected || !metaMaskAddress) {
      alert("Please connect MetaMask and create a burner wallet first");
      return;
    }

    try {
      setFundingInProgress(true);
      const mm = getMetaMaskProvider();
      if (!mm) {
        alert("No MetaMask provider detected. Ensure MetaMask is enabled.");
        setFundingInProgress(false);
        return;
      }

      // Ensure correct network, then recreate provider/signer to avoid network change errors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = new BrowserProvider(mm as any);
      await ensureCorrectNetwork(provider);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const freshProvider = new BrowserProvider(mm as any);
      const signer = await freshProvider.getSigner();

      const tx = await signer.sendTransaction({
        to: wallet.walletAddress,
        value: parseEther(fundAmount),
      });

      alert(`Transaction sent! Hash: ${tx.hash}`);
      await tx.wait();
      alert("Transaction confirmed! Burner wallet funded successfully.");

      // Refresh balance
      await fetchBalance();
    } catch (err) {
      console.error("Funding failed", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      if (errorMessage.toLowerCase().includes("insufficient funds")) {
        alert("MetaMask account has insufficient ETH on this network to cover amount + gas. Switch to the correct network (e.g., Sepolia) and ensure it has test ETH.");
      } else {
        alert(`Failed to fund wallet: ${errorMessage}`);
      }
    } finally {
      setFundingInProgress(false);
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
      const chainId =
        chain === "sepolia" ? "11155111" : chain === "holesky" ? "17000" : "1";
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

  // Format time remaining (HH:MM:SS)
  const formatTimeRemaining = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  // Timer countdown effect
  // Drive countdown off wallet.expiresAt for per-wallet sync
  useEffect(() => {
    if (!wallet || !wallet.expiresAt) {
      setTimeRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const remainingMs = wallet.expiresAt! - now;

      if (remainingMs <= 0) {
        clearInterval(interval);
        clearBurner();
        setTimeRemaining(null);
        alert("Burner wallet expired!");
      } else {
        setTimeRemaining(formatTimeRemaining(Math.ceil(remainingMs / 1000)));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [wallet, clearBurner]);

  // Override createBurner to set timer
  // Optional timer: apply only when user chooses
  const startTimer = () => {
    if (!wallet) return;
    const mins = Math.max(2, Math.min(1440, expiryMinutes));
    const expiresAt = Date.now() + mins * 60 * 1000;
    setExpiry(expiresAt);
  };

  const cancelTimer = () => {
    if (!wallet) return;
    setExpiry(undefined);
    setTimeRemaining(null);
  };

  const buttonStyle: React.CSSProperties = {
    padding: "0.6rem 1rem",
    borderRadius: "8px",
    border: "2px solid #fbbf24",
    background: "#1a1a1a",
    color: "#fbbf24",
    cursor: "pointer",
    fontSize: "0.95rem",
    fontWeight: 600,
    transition: "all 0.2s",
  };

  const ghostButton: React.CSSProperties = {
    ...buttonStyle,
    background: "rgba(251, 191, 36, 0.1)",
    color: "#fbbf24",
  };

  return (
    <main
      style={{
        padding: "2rem 1.5rem",
        minHeight: "100vh",
        background: "#000000",
        position: "relative",
      }}
    >
      {/* Background text */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: "clamp(3rem, 15vw, 10rem)",
          fontWeight: 900,
          color: "#fbbf24",
          opacity: 0.25,
          userSelect: "none",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 0,
        }}
      >
        USE AND THROW
      </div>

      {/* Content container */}
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          position: "relative",
          zIndex: 1,
        }}
      >
        <header style={{ textAlign: "center" }}>
          <p
            style={{
              color: "#ffffff",
              fontSize: "0.9rem",
              margin: 0,
              letterSpacing: "2px",
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            use-and-throw
          </p>
          <h1
            style={{ margin: "0.5rem 0", color: "#ffffff", fontSize: "2.5rem" }}
          >
            Burner Wallet
          </h1>
          <p
            style={{
              margin: 0,
              color: "#ffffff",
              maxWidth: 420,
              marginInline: "auto",
              opacity: 0.8,
            }}
          >
            Temporary Ethereum address generated in-memory. Refresh = gone.
          </p>
        </header>

        {/* MetaMask Connection Section */}
        <div
          style={{
            border: "2px solid #fbbf24",
            borderRadius: "12px",
            padding: "1rem",
            background: "rgba(251, 191, 36, 0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                color: "#ffffff",
                fontWeight: 600,
                marginBottom: "0.25rem",
              }}
            >
              {metaMaskConnected ? "MetaMask Connected" : "Connect MetaMask"}
            </div>
            {metaMaskAddress && (
              <div
                style={{
                  color: "#ffffff",
                  opacity: 0.7,
                  fontSize: "0.85rem",
                  fontFamily: "monospace",
                }}
              >
                {metaMaskAddress.slice(0, 6)}...{metaMaskAddress.slice(-4)}
              </div>
            )}
          </div>
          {!metaMaskConnected ? (
            <button style={buttonStyle} onClick={connectMetaMask}>
              Connect MetaMask
            </button>
          ) : (
            <button style={ghostButton} onClick={disconnectMetaMask}>
              Disconnect
            </button>
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <select
            value={chain}
            onChange={(e) =>
              setChain(e.target.value as "ethereum" | "sepolia" | "holesky")
            }
            style={{
              padding: "0.6rem 1rem",
              borderRadius: 8,
              border: "2px solid #fbbf24",
              background: "#1a1a1a",
              color: "#fbbf24",
              fontSize: "0.95rem",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <option value="ethereum">Mainnet</option>
            <option value="sepolia">Sepolia</option>
            <option value="holesky">Holesky</option>
          </select>
          <button style={buttonStyle} onClick={() => createBurner()}>
            Create burner
          </button>
          <button style={ghostButton} onClick={clearBurner} disabled={!wallet}>
            Forget
          </button>
          <button style={ghostButton} onClick={copyAddress} disabled={!wallet}>
            Copy address
          </button>
          <button
            style={ghostButton}
            onClick={fetchBalance}
            disabled={!wallet || loadingBalance}
          >
            {loadingBalance ? "Fetching..." : "Check balance"}
          </button>
          <button
            style={ghostButton}
            onClick={fetchTxs}
            disabled={!wallet || loadingTxs}
          >
            {loadingTxs ? "Loading..." : "Load activity"}
          </button>
        </div>

        {/* Wallet Expiry Timer Section */}
        {wallet && (
          <div
            style={{
              border: "2px solid #fbbf24",
              borderRadius: "12px",
              padding: "1rem",
              background: "rgba(251, 191, 36, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.25rem" }}>
                ⏱️ Wallet Expiry
              </div>
              {timeRemaining && (
                <div
                  style={{
                    fontSize: "1.3rem",
                    fontWeight: 900,
                    color: "#fbbf24",
                    fontFamily: "monospace",
                    letterSpacing: "2px",
                  }}
                >
                  {timeRemaining}
                </div>
              )}
              {!timeRemaining && wallet?.expiresAt && (
                <div style={{ color: "#ffffff", opacity: 0.7, fontSize: "0.9rem" }}>
                  Timer initializing…
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <label
                  style={{
                    color: "#ffffff",
                    fontSize: "0.85rem",
                    marginRight: "0.5rem",
                    fontWeight: 600,
                  }}
                >
                  Expiry (min):
                </label>
                <input
                  type="range"
                  min="2"
                  max="1440"
                  value={expiryMinutes}
                  onChange={(e) => setExpiryMinutes(parseInt(e.target.value))}
                  style={{
                    width: "150px",
                    cursor: "pointer",
                  }}
                />
                <div style={{ color: "#ffffff", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                  {expiryMinutes < 60
                    ? `${expiryMinutes}m`
                    : `${Math.floor(expiryMinutes / 60)}h ${expiryMinutes % 60}m`}
                </div>
              </div>
              {wallet?.expiresAt ? (
                <button onClick={cancelTimer} style={ghostButton}>
                  Cancel timer
                </button>
              ) : (
                <button onClick={startTimer} style={buttonStyle}>
                  Start timer
                </button>
              )}
            </div>
          </div>
        )}

        <section
          style={{
            border: "2px solid #fbbf24",
            borderRadius: "16px",
            padding: "1.5rem",
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            color: "#ffffff",
            boxShadow: "0 8px 32px 0 rgba(251, 191, 36, 0.2)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1rem",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>
              Current Burner
            </div>
            <span
              style={{
                fontSize: "0.85rem",
                color: "#000000",
                background: wallet ? "#fbbf24" : "#d97706",
                border: "none",
                padding: "0.25rem 0.75rem",
                borderRadius: "999px",
                fontWeight: 700,
              }}
            >
              {wallet ? "Ready" : "None"}
            </span>
          </div>

          {wallet ? (
            <>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "0.85rem",
                      color: "#ffffff",
                      marginBottom: "0.25rem",
                      fontWeight: 600,
                      opacity: 0.7,
                    }}
                  >
                    Address
                  </div>
                  <code
                    style={{
                      display: "block",
                      background: "rgba(251, 191, 36, 0.1)",
                      padding: "0.75rem",
                      borderRadius: "8px",
                      color: "#ffffff",
                      fontSize: "0.85rem",
                      wordBreak: "break-all",
                      border: "1px solid #fbbf24",
                    }}
                  >
                    {wallet.walletAddress}
                  </code>
                </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "#ffffff",
                        fontWeight: 600,
                        opacity: 0.7,
                      }}
                    >
                      Private Key
                    </div>
                    <button
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      style={{
                        background: "rgba(251, 191, 36, 0.2)",
                        border: "1px solid #fbbf24",
                        borderRadius: "6px",
                        padding: "0.25rem 0.5rem",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        color: "#ffffff",
                        fontWeight: 600,
                      }}
                    >
                      {showPrivateKey ? "Hide" : "Show"}
                    </button>
                  </div>
                  <code
                    style={{
                      display: "block",
                      background: "rgba(251, 191, 36, 0.1)",
                      padding: "0.75rem",
                      borderRadius: "8px",
                      color: "#ffffff",
                      fontSize: "0.85rem",
                      wordBreak: "break-all",
                      border: "1px solid #fbbf24",
                    }}
                  >
                    {showPrivateKey
                      ? wallet.privateKey
                      : "••••••••••••••••••••••••••••••••"}
                  </code>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "#ffffff",
                        marginBottom: "0.25rem",
                        fontWeight: 600,
                        opacity: 0.7,
                      }}
                    >
                      Chain
                    </div>
                    <div
                      style={{
                        background: "rgba(251, 191, 36, 0.1)",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid #fbbf24",
                        fontSize: "0.9rem",
                        textTransform: "capitalize",
                      }}
                    >
                      {chain}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "#ffffff",
                        marginBottom: "0.25rem",
                        fontWeight: 600,
                        opacity: 0.7,
                      }}
                    >
                      Balance
                    </div>
                    <div
                      style={{
                        background: "rgba(251, 191, 36, 0.1)",
                        padding: "0.75rem",
                        borderRadius: "8px",
                        border: "1px solid #fbbf24",
                        fontSize: "0.9rem",
                      }}
                    >
                      {balance ? `${balance} ETH` : "Not checked"}
                    </div>
                    {balanceError && (
                      <div
                        style={{
                          color: "#dc2626",
                          fontSize: "0.75rem",
                          marginTop: "0.25rem",
                        }}
                      >
                        {balanceError}
                      </div>
                    )}
                  </div>
                </div>

                {/* Fund Burner Wallet Section */}
                {metaMaskConnected && (
                  <div
                    style={{
                      border: "2px solid rgba(251, 191, 36, 0.5)",
                      borderRadius: "8px",
                      padding: "1rem",
                      background: "rgba(251, 191, 36, 0.05)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        marginBottom: "0.5rem",
                      }}
                    >
                      💰 Fund from MetaMask
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="number"
                        step="0.001"
                        value={fundAmount}
                        onChange={(e) => setFundAmount(e.target.value)}
                        placeholder="Amount in ETH"
                        style={{
                          flex: 1,
                          padding: "0.6rem",
                          borderRadius: "6px",
                          border: "1px solid #fbbf24",
                          background: "rgba(0, 0, 0, 0.5)",
                          color: "#ffffff",
                          fontSize: "0.9rem",
                        }}
                      />
                      <button
                        onClick={fundBurnerWallet}
                        disabled={fundingInProgress}
                        style={{
                          ...buttonStyle,
                          padding: "0.6rem 1.25rem",
                        }}
                      >
                        {fundingInProgress ? "Sending..." : "Send"}
                      </button>
                    </div>
                  </div>
                )}

                <a
                  href={`${explorerBase}/address/${wallet.walletAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "#ffffff",
                    textDecoration: "none",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    display: "inline-block",
                  }}
                >
                  View on Etherscan →
                </a>

                {/* Export to MetaMask Button */}
                <button
                  onClick={() => setShowExportModal(true)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    border: "2px solid #fbbf24",
                    background: "rgba(251, 191, 36, 0.1)",
                    color: "#fbbf24",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    cursor: "pointer",
                  }}
                >
                  🔐 Export to MetaMask (Make Permanent)
                </button>
              </div>

              <div
                style={{
                  borderTop: "2px solid rgba(251, 191, 36, 0.3)",
                  paddingTop: "1rem",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: "0.75rem",
                    fontSize: "1rem",
                  }}
                >
                  Recent Transactions
                </div>
                {txError && (
                  <p
                    style={{ color: "#dc2626", margin: 0, fontSize: "0.9rem" }}
                  >
                    {txError}
                  </p>
                )}
                {!txs && !txError && (
                  <p
                    style={{
                      color: "#ffffff",
                      margin: 0,
                      fontSize: "0.9rem",
                      opacity: 0.7,
                    }}
                  >
                    Click &quot;Load activity&quot; to fetch recent
                    transactions.
                  </p>
                )}
                {txs && txs.length === 0 && (
                  <p
                    style={{
                      color: "#ffffff",
                      margin: 0,
                      fontSize: "0.9rem",
                      opacity: 0.7,
                    }}
                  >
                    No transactions found for this address.
                  </p>
                )}
                {txs && txs.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}
                  >
                    {txs.map((t) => (
                      <div
                        key={t.hash}
                        style={{
                          padding: "0.75rem",
                          background: "rgba(251, 191, 36, 0.1)",
                          border: "1px solid rgba(251, 191, 36, 0.4)",
                          borderRadius: "8px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.25rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <a
                            href={`${explorerBase}/tx/${t.hash}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: "#ffffff",
                              fontSize: "0.85rem",
                              fontFamily: "monospace",
                              fontWeight: 600,
                            }}
                          >
                            {t.hash.slice(0, 16)}…
                          </a>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: "0.9rem",
                              color: "#ffffff",
                            }}
                          >
                            {formatEther(t.value)} ETH
                          </span>
                        </div>
                        <span
                          style={{
                            color: "#ffffff",
                            fontSize: "0.75rem",
                            opacity: 0.6,
                          }}
                        >
                          {new Date(
                            Number(t.timeStamp) * 1000,
                          ).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p
              style={{
                margin: 0,
                color: "#ffffff",
                textAlign: "center",
                padding: "2rem 0",
                opacity: 0.7,
              }}
            >
              No burner yet. Click &quot;Create burner&quot; to generate one.
            </p>
          )}
        </section>
      </div>

      {/* Export Modal */}
      {showExportModal && wallet && (
        <div
          onClick={() => setShowExportModal(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1a1a1a",
              border: "2px solid #fbbf24",
              borderRadius: "16px",
              padding: "2rem",
              maxWidth: 500,
              width: "100%",
              boxShadow: "0 8px 32px 0 rgba(251, 191, 36, 0.3)",
            }}
          >
            <h2
              style={{ color: "#fbbf24", marginTop: 0, marginBottom: "1rem" }}
            >
              🔐 Export to MetaMask
            </h2>

            <p style={{ color: "#ffffff", marginBottom: "1rem", opacity: 0.9 }}>
              Copy your private key below and import it into MetaMask to make
              this wallet permanent.
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#ffffff",
                  marginBottom: "0.5rem",
                  fontWeight: 600,
                  opacity: 0.7,
                }}
              >
                Private Key
              </div>
              <code
                style={{
                  display: "block",
                  background: "rgba(251, 191, 36, 0.1)",
                  padding: "1rem",
                  borderRadius: "8px",
                  color: "#fbbf24",
                  fontSize: "0.85rem",
                  wordBreak: "break-all",
                  border: "1px solid #fbbf24",
                  marginBottom: "0.75rem",
                }}
              >
                {wallet.privateKey}
              </code>
              <button
                onClick={copyPrivateKey}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  border: "2px solid #fbbf24",
                  background: "#fbbf24",
                  color: "#000000",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                  marginBottom: "1rem",
                }}
              >
                📋 Copy Private Key
              </button>
            </div>

            <div
              style={{
                background: "rgba(251, 191, 36, 0.1)",
                padding: "1rem",
                borderRadius: "8px",
                border: "1px solid rgba(251, 191, 36, 0.3)",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  color: "#fbbf24",
                  fontWeight: 600,
                  marginBottom: "0.5rem",
                  fontSize: "0.9rem",
                }}
              >
                📝 How to import into MetaMask:
              </div>
              <ol
                style={{
                  color: "#ffffff",
                  opacity: 0.9,
                  fontSize: "0.85rem",
                  margin: 0,
                  paddingLeft: "1.25rem",
                }}
              >
                <li>Open MetaMask extension</li>
                <li>Click on account icon → &quot;Import Account&quot;</li>
                <li>Paste your private key</li>
                <li>Click &quot;Import&quot;</li>
              </ol>
            </div>

            <div
              style={{
                background: "rgba(220, 38, 38, 0.1)",
                padding: "0.75rem",
                borderRadius: "8px",
                border: "1px solid rgba(220, 38, 38, 0.3)",
                marginBottom: "1rem",
              }}
            >
              <div style={{ color: "#fca5a5", fontSize: "0.85rem" }}>
                ⚠️ Warning: Never share your private key with anyone. Anyone
                with this key can access your funds.
              </div>
            </div>

            <button
              onClick={() => setShowExportModal(false)}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "8px",
                border: "2px solid #fbbf24",
                background: "rgba(251, 191, 36, 0.1)",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
