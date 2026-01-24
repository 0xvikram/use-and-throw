"use client";

import { Wallet as EthersWallet } from "ethers";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Wallet } from "./types";

type WalletContextValue = {
  wallet: Wallet | undefined;
  chain: "ethereum" | "sepolia" | "holesky";
  setChain: (c: "ethereum" | "sepolia" | "holesky") => void;
  createBurner: (expiresAt?: number) => void;
  clearBurner: () => void;
  setExpiry: (expiresAt?: number) => void;
};

export const WalletContext = createContext<WalletContextValue | undefined>(
  undefined,
);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Wallet | undefined>();
  const [chain, setChain] = useState<"ethereum" | "sepolia" | "holesky">(
    "ethereum",
  );

  const createBurner = useCallback((expiresAt?: number) => {
    const generated = EthersWallet.createRandom();
    setWallet({
      walletId: generated.address,
      isActive: true,
      privateKey: generated.privateKey,
      walletAddress: generated.address,
      createdAt: Date.now(),
      expiresAt,
    });
  }, []);
  const clearBurner = useCallback(() => setWallet(undefined), []);

  const setExpiry = useCallback((expiresAt?: number) => {
    setWallet((prev) => (prev ? { ...prev, expiresAt } : prev));
  }, []);

  const value = useMemo(
    () => ({ wallet, chain, setChain, createBurner, clearBurner, setExpiry }),
    [wallet, chain, createBurner, clearBurner, setExpiry],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be inside WalletProvider");
  return ctx;
}
