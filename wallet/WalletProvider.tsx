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
  createBurner: () => void;
  clearBurner: () => void;
};

export const WalletContext = createContext<WalletContextValue | undefined>(
  undefined,
);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Wallet | undefined>();
  const [chain, setChain] = useState<"ethereum" | "sepolia" | "holesky">(
    "ethereum",
  );

  const createBurner = useCallback(() => {
    const generated = EthersWallet.createRandom();
    setWallet({
      walletId: generated.address,
      isActive: true,
      privateKey: generated.privateKey,
      walletAddress: generated.address,
    });
  }, []);
  const clearBurner = useCallback(() => setWallet(undefined), []);

  const value = useMemo(
    () => ({ wallet, chain, setChain, createBurner, clearBurner }),
    [wallet, chain, createBurner, clearBurner],
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
