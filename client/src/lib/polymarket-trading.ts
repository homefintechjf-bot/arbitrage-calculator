import { ethers } from 'ethers';

const CLOB_HOST = 'https://clob.polymarket.com';
const GAMMA_HOST = 'https://gamma-api.polymarket.com';

const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC on Polygon
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E'; // Polymarket CTF Exchange

const USDC_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

export interface OrderArgs {
  tokenId: string;
  price: number;
  size: number;
  side: 'BUY' | 'SELL';
}

export interface UserPosition {
  tokenId: string;
  size: number;
  avgPrice: number;
  outcome: string;
  marketTitle: string;
}

export interface WalletBalance {
  usdc: number;
  matic: number;
  usdcAllowance: number;
}

export class PolymarketTradingClient {
  private signer: ethers.Signer | null = null;
  private provider: ethers.Provider | null = null;
  private address: string | null = null;

  async connect(signer: ethers.Signer): Promise<boolean> {
    try {
      this.signer = signer;
      this.provider = signer.provider;
      this.address = await signer.getAddress();
      return true;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      return false;
    }
  }

  disconnect(): void {
    this.signer = null;
    this.provider = null;
    this.address = null;
  }

  isConnected(): boolean {
    return this.signer !== null && this.address !== null;
  }

  getAddress(): string | null {
    return this.address;
  }

  async getBalance(): Promise<WalletBalance> {
    if (!this.address || !this.provider) {
      return { usdc: 0, matic: 0, usdcAllowance: 0 };
    }

    try {
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, this.provider);

      const [usdcBalance, maticBalance, allowance, decimals] = await Promise.all([
        usdcContract.balanceOf(this.address),
        this.provider.getBalance(this.address),
        usdcContract.allowance(this.address, CTF_EXCHANGE),
        usdcContract.decimals(),
      ]);

      return {
        usdc: parseFloat(ethers.formatUnits(usdcBalance, decimals)),
        matic: parseFloat(ethers.formatEther(maticBalance)),
        usdcAllowance: parseFloat(ethers.formatUnits(allowance, decimals)),
      };
    } catch (error) {
      console.error('Failed to get balance:', error);
      return { usdc: 0, matic: 0, usdcAllowance: 0 };
    }
  }

  async approveUsdc(amount: number): Promise<{ success: boolean; txHash?: string; error?: string }> {
    if (!this.signer || !this.address) {
      return { success: false, error: 'Wallet not connected' };
    }

    try {
      const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, this.signer);
      const amountWei = ethers.parseUnits(amount.toString(), 6);

      const tx = await usdcContract.approve(CTF_EXCHANGE, amountWei);
      await tx.wait();

      return { success: true, txHash: tx.hash };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Approval failed',
      };
    }
  }

  async getMarketPrice(tokenId: string): Promise<{ bid: number; ask: number; mid: number } | null> {
    try {
      const response = await fetch(`${CLOB_HOST}/price?token_id=${tokenId}`);
      if (!response.ok) return null;
      const data = await response.json();
      return {
        bid: parseFloat(data.bid || '0'),
        ask: parseFloat(data.ask || '0'),
        mid: parseFloat(data.mid || '0'),
      };
    } catch (error) {
      console.error('Failed to get market price:', error);
      return null;
    }
  }

  async getOrderBook(tokenId: string): Promise<{ bids: Array<[number, number]>; asks: Array<[number, number]> } | null> {
    try {
      const response = await fetch(`${CLOB_HOST}/book?token_id=${tokenId}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Failed to get order book:', error);
      return null;
    }
  }

  async getUserPositions(): Promise<UserPosition[]> {
    if (!this.address) return [];

    try {
      const response = await fetch(`${GAMMA_HOST}/positions?user=${this.address.toLowerCase()}`);
      if (!response.ok) return [];

      const data = await response.json();
      if (!Array.isArray(data)) return [];

      return data.map((pos: any) => ({
        tokenId: pos.asset?.id || pos.token_id || '',
        size: parseFloat(pos.size || '0'),
        avgPrice: parseFloat(pos.avgCost || pos.avg_price || '0'),
        outcome: pos.asset?.outcome || pos.outcome || 'Unknown',
        marketTitle: pos.market?.question || pos.market_title || 'Unknown Market',
      }));
    } catch (error) {
      console.error('Failed to get user positions:', error);
      return [];
    }
  }

  getPolymarketTradeUrl(tokenId: string): string {
    return `https://polymarket.com/event/${tokenId}`;
  }
}

export const polymarketClient = new PolymarketTradingClient();
