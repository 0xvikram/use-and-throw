export interface Wallet {
  walletId: string;
  chain: string;
  isActive: boolean;
  privateKey: string;
  walletAddress: string;
}
