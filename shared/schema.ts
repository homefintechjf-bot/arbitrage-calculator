export interface Watchlist {
  id: string;
  marketName: string;
  siteAName: string;
  siteBName: string;
  siteAYesPrice: number;
  siteBYesPrice: number;
  investment: number;
  alertThreshold: number;
  isActive: boolean;
  lastChecked?: string | null;
  lastMakerRoi?: number | null;
  lastTakerRoi?: number | null;
  createdAt?: string;
}

export interface InsertWatchlist {
  marketName: string;
  siteAName: string;
  siteBName: string;
  siteAYesPrice: number;
  siteBYesPrice: number;
  investment?: number;
  alertThreshold?: number;
  isActive?: boolean;
}

export interface Alert {
  id: string;
  watchlistId?: string | null;
  marketName: string;
  makerRoi: number;
  takerRoi: number;
  siteAYesPrice?: number | null;
  siteBYesPrice?: number | null;
  isRead: boolean;
  createdAt?: string;
}

export interface ComboLeg {
  platform: string;
  marketId: string;
  title: string;
  side: "YES" | "NO";
  price: number;
  fee: number;
  volume: number;
  marketUrl?: string | null;
  allocation: number;
}

export interface ArbitrageHistory {
  id: string;
  marketName: string;
  siteAName: string;
  siteBName: string;
  siteAYesPrice: number;
  siteBYesPrice: number;
  investment: number;
  orderMode: string;
  grossRoi?: number | null;
  netRoi?: number | null;
  netProfit?: number | null;
  shares?: number | null;
  isProfitable?: boolean;
  scenario?: string | null;
  createdAt?: string;
}

export interface InsertArbitrageHistory {
  marketName: string;
  siteAName: string;
  siteBName: string;
  siteAYesPrice: number;
  siteBYesPrice: number;
  investment: number;
  orderMode?: string;
  grossRoi?: number | null;
  netRoi?: number | null;
  netProfit?: number | null;
  shares?: number | null;
  isProfitable?: boolean;
  scenario?: string | null;
}

export interface User {
  id: string;
  username: string;
  password: string;
}

export interface InsertUser {
  username: string;
  password: string;
}
