export type TransactionType = 'buy' | 'sell';

export interface FeeSettings {
  commissionRate: number; // e.g. 0.00025 for万2.5
  minFiveYuan: boolean; // 5元起收
  stampDutyRate: number; // e.g. 0.0005 for 0.05%
  transferFeeRate: number; // e.g. 0.00001 for 0.001%
}

export interface Stock {
  id: string;
  name: string;
  code: string;
  currentPrice?: number; // 新增：保存现价
}

export interface Transaction {
  id: string;
  stockId: string; // Link to Stock
  stockCode: string; // Legacy/Redundant but kept for display convenience
  stockName: string;
  type: TransactionType;
  price: number;
  quantity: number;
  date: string; // ISO string
  timestamp: number;

  // Basic calculated fields
  fees: number;
  totalAmount: number; // Cash flow: Negative for Buy, Positive for Sell (usually)
}

export interface TTradeDetail {
  index: number;      // 第几次做T
  pairId: string;     // 对手单ID
  type: 'standard' | 'reverse'; // standard(买卖) 或 reverse(卖买)
  timeInterval: string; // 时间间隔（时分）
  profit: number;     // 做T收益
  profitRate: number; // 收益率
}

export interface CycleStats {
  holdingDays: number;
  totalCost?: number;
  avgBuyPrice?: number;
  totalPnL?: number;
  pnlPercent?: number;
  // 新增做T统计
  totalTTrades?: number; // 周期内做T次数
  totalTProfit?: number; // 周期内做T总收益
}

// Used for UI display, calculated on the fly
export interface EnrichedTransaction extends Transaction {
  runningHoldings: number;
  runningAvgCost: number;
  tradePnL?: number; // Only for Sells
  positionTag?: string; // "建仓", "清仓", etc.
  isTTrade?: boolean; // Indicates if this transaction is part of a "T" (Intraday) trade
  tTradeDetail?: TTradeDetail; // T交易详细信息 (如果有)
  cycleStats?: CycleStats; // New field for tooltip info
}

export interface StockSummary {
  totalHoldings: number;
  avgCost: number;
  totalRealizedPnL: number;
  totalCost: number; // Remaining value at cost
  lastCycleStats?: CycleStats; // Snapshot of the last cleared cycle stats
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

// 添加窗口接口声明
export interface PyWebViewAPI {
  minimize_window: () => void;
  maximize_window: () => void;
  close_window: () => void;
  destroy_app: () => void;
  log: (message: string) => void;
  get_version: () => string;
  save_file: (content: string, filename: string) => void;
  // 新增：读写用户数据
  load_user_data: () => Promise<string>;
  save_user_data: (content: string) => Promise<boolean>;
}

export interface PyWebViewWindow {
  pywebview?: {
    api: PyWebViewAPI;
  };
}