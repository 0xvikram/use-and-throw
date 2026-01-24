export interface Wallet {
  walletId: string;
  isActive: boolean;
  privateKey: string;
  walletAddress: string;
  createdAt?: number; // epoch ms when wallet was created
  expiresAt?: number; // epoch ms when wallet should auto-expire
}
