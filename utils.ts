import { FeeSettings, Transaction, TransactionType, StockSummary, ValidationResult, EnrichedTransaction, CycleStats, TTradeDetail } from './types';

export type { Transaction, FeeSettings, TransactionType, StockSummary, ValidationResult, EnrichedTransaction, CycleStats };

export const DEFAULT_SETTINGS: FeeSettings = {
  commissionRate: 0.00025,
  minFiveYuan: true,
  stampDutyRate: 0.0005,
  transferFeeRate: 0.00001,
};

export const generateId = () => Math.random().toString(36).substr(2, 9);
const safeFloat = (num: number) => Math.round(num * 10000) / 10000;

export const calculateFees = (
  type: TransactionType,
  price: number,
  quantity: number,
  settings: FeeSettings
): number => {
  const amount = price * quantity;
  let commission = amount * settings.commissionRate;
  if (settings.minFiveYuan && commission < 5) commission = 5;
  const stampDuty = type === 'sell' ? amount * settings.stampDutyRate : 0;
  const transferFee = amount * settings.transferFeeRate;
  return Number((commission + stampDuty + transferFee).toFixed(2));
};

// ... (calculateMaxSellable, validateTransaction, formatTimeDiff, processTransactionHistory 保持不变) ...
export const calculateMaxSellable = (
  dateStr: string,
  transactions: Transaction[],
  excludeId?: string
): number => {
  const targetDate = new Date(dateStr);
  if (isNaN(targetDate.getTime())) return 0;
  const startOfTargetDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
  const targetTimestamp = new Date(dateStr).getTime();

  const sorted = [...transactions]
    .filter(t => t.id !== excludeId)
    .sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return a.id.localeCompare(b.id);
    });

  let sellable = 0;
  for (const t of sorted) {
    if (t.type === 'buy') {
      if (t.timestamp < startOfTargetDay) sellable += t.quantity; // T+1
    } else {
      if (t.timestamp <= targetTimestamp) sellable -= t.quantity;
    }
  }
  return Math.max(0, sellable);
}

export const validateTransaction = (
  newTx: Transaction,
  existingTxns: Transaction[]
): ValidationResult => {
  if (newTx.quantity < 100) return { valid: false, message: '最小交易数量为100' };
  if (newTx.quantity % 100 !== 0) return { valid: false, message: '交易数量必须是100的整数倍' };
  if (newTx.type === 'buy') return { valid: true };

  const maxSellable = calculateMaxSellable(newTx.date, existingTxns, newTx.id);
  if (newTx.quantity > maxSellable) {
    return { valid: false, message: `可用股数不足 (T+1规则)。当前可卖: ${maxSellable}` };
  }
  return { valid: true };
};

const formatTimeDiff = (ms: number): string => {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}时${m}分`;
  return `${m}分`;
};

export const processTransactionHistory = (
  transactions: Transaction[],
  settings: FeeSettings
): { summary: StockSummary; enrichedHistory: EnrichedTransaction[] } => {

  const sorted = [...transactions].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.id.localeCompare(b.id);
  });

  const dayGroups = new Map<string, Transaction[]>();
  sorted.forEach(tx => {
    const day = tx.date.split('T')[0];
    if (!dayGroups.has(day)) dayGroups.set(day, []);
    dayGroups.get(day)!.push(tx);
  });

  const tTradeMap = new Map<string, TTradeDetail>();
  const tPairIds = new Set<string>();

  dayGroups.forEach((txs) => {
    const daySorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);
    const unmatchedBuys: { tx: Transaction, remaining: number }[] = [];
    const unmatchedSells: { tx: Transaction, remaining: number }[] = [];
    let dayTIndex = 0;

    daySorted.forEach(tx => {
      let currentRemaining = tx.quantity;
      if (tx.type === 'sell') {
        while (currentRemaining > 0 && unmatchedBuys.length > 0) {
          const matchObj = unmatchedBuys[unmatchedBuys.length - 1];
          const matchTx = matchObj.tx;
          const matchQty = Math.min(currentRemaining, matchObj.remaining);
          if (currentRemaining === tx.quantity) dayTIndex++;
          tPairIds.add(tx.id); tPairIds.add(matchTx.id);

          const revenue = tx.price * matchQty - tx.fees * (matchQty / tx.quantity);
          const cost = matchTx.price * matchQty + matchTx.fees * (matchQty / matchTx.quantity);
          const profit = revenue - cost;

          const existingDetail = tTradeMap.get(tx.id);
          if (existingDetail) {
            existingDetail.profit += profit;
            existingDetail.timeInterval = formatTimeDiff(Math.abs(tx.timestamp - matchTx.timestamp));
          } else {
            tTradeMap.set(tx.id, {
              index: dayTIndex, pairId: matchTx.id, type: 'standard',
              timeInterval: formatTimeDiff(Math.abs(tx.timestamp - matchTx.timestamp)),
              profit: profit, profitRate: 0
            });
          }
          currentRemaining -= matchQty;
          matchObj.remaining -= matchQty;
          if (matchObj.remaining <= 0) unmatchedBuys.pop();
        }
        if (currentRemaining > 0) unmatchedSells.push({ tx, remaining: currentRemaining });
      } else {
        while (currentRemaining > 0 && unmatchedSells.length > 0) {
          const matchObj = unmatchedSells[unmatchedSells.length - 1];
          const matchTx = matchObj.tx;
          const matchQty = Math.min(currentRemaining, matchObj.remaining);
          if (currentRemaining === tx.quantity) dayTIndex++;
          tPairIds.add(tx.id); tPairIds.add(matchTx.id);

          const revenue = matchTx.price * matchQty - matchTx.fees * (matchQty / matchTx.quantity);
          const cost = tx.price * matchQty + tx.fees * (matchQty / tx.quantity);
          const profit = revenue - cost;

          const existingDetail = tTradeMap.get(tx.id);
          if (existingDetail) {
            existingDetail.profit += profit;
            existingDetail.timeInterval = formatTimeDiff(Math.abs(tx.timestamp - matchTx.timestamp));
          } else {
            tTradeMap.set(tx.id, {
              index: dayTIndex, pairId: matchTx.id, type: 'reverse',
              timeInterval: formatTimeDiff(Math.abs(tx.timestamp - matchTx.timestamp)),
              profit: profit, profitRate: 0
            });
          }
          currentRemaining -= matchQty;
          matchObj.remaining -= matchQty;
          if (matchObj.remaining <= 0) unmatchedSells.pop();
        }
        if (currentRemaining > 0) unmatchedBuys.push({ tx, remaining: currentRemaining });
      }
    });
  });

  let currentHoldings = 0;
  let totalCostAmount = 0;
  let totalRealizedPnL = 0;
  let cycleStartDate: number | null = null;
  let cycleTotalBuyCost = 0;
  let cycleTotalBuyQty = 0;
  let cycleTotalRealizedPnL = 0;
  let cycleTCount = 0;
  let cycleTProfit = 0;

  let lastCompleteCycleStats: CycleStats | undefined = undefined;
  const enrichedHistory: EnrichedTransaction[] = [];

  for (const tx of sorted) {
    const tDetail = tTradeMap.get(tx.id);
    const isTPair = tPairIds.has(tx.id);

    if (currentHoldings === 0 && tx.type === 'buy') {
      if (!tDetail || tDetail.type !== 'reverse') {
        cycleStartDate = tx.timestamp;
        cycleTotalBuyCost = 0;
        cycleTotalBuyQty = 0;
        cycleTotalRealizedPnL = 0;
        cycleTCount = 0;
        cycleTProfit = 0;
      }
    }

    if (tDetail) {
      cycleTCount++;
      tDetail.index = cycleTCount;
      cycleTProfit += tDetail.profit;
    }

    let positionTag: string | undefined = undefined;
    let tradePnL: number | undefined = undefined;

    if (currentHoldings === 0 && tx.type === 'buy') {
      if (!tDetail || tDetail.type !== 'reverse') positionTag = "建仓";
    }

    if (tx.type === 'buy') {
      const cost = (tx.price * tx.quantity) + tx.fees;
      currentHoldings += tx.quantity;
      totalCostAmount += cost;

      cycleTotalBuyCost += cost;
      cycleTotalBuyQty += tx.quantity;
    } else {
      const revenue = (tx.price * tx.quantity) - tx.fees;
      let costOfSoldShares = 0;
      if (currentHoldings > 0) {
        costOfSoldShares = tx.quantity * (totalCostAmount / currentHoldings);
      }
      tradePnL = revenue - costOfSoldShares;
      totalRealizedPnL += tradePnL;
      cycleTotalRealizedPnL += tradePnL;

      currentHoldings -= tx.quantity;
      totalCostAmount -= costOfSoldShares;

      if (currentHoldings <= 0.0001) {
        currentHoldings = 0;
        totalCostAmount = 0;
        const isReverseStart = isTPair && !tDetail;
        if (!isReverseStart) positionTag = "清仓";
      }
    }

    let cycleStats: CycleStats | undefined = undefined;
    if (positionTag === "清仓" && cycleStartDate) {
      const diffTime = Math.abs(tx.timestamp - cycleStartDate);
      const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
      const avgBuyPrice = cycleTotalBuyQty > 0 ? cycleTotalBuyCost / cycleTotalBuyQty : 0;
      cycleStats = {
        holdingDays: diffDays,
        totalCost: cycleTotalBuyCost,
        avgBuyPrice: avgBuyPrice,
        totalPnL: cycleTotalRealizedPnL,
        pnlPercent: cycleTotalBuyCost > 0 ? (cycleTotalRealizedPnL / cycleTotalBuyCost) * 100 : 0,
        totalTTrades: cycleTCount,
        totalTProfit: cycleTProfit
      };
      lastCompleteCycleStats = cycleStats;
    }

    enrichedHistory.push({
      ...tx,
      runningHoldings: safeFloat(currentHoldings),
      runningAvgCost: currentHoldings > 0 ? totalCostAmount / currentHoldings : 0,
      tradePnL,
      positionTag,
      isTTrade: isTPair,
      tTradeDetail: tDetail,
      cycleStats
    });
  }

  const summary: StockSummary = {
    totalHoldings: safeFloat(currentHoldings),
    avgCost: currentHoldings > 0 ? totalCostAmount / currentHoldings : 0,
    totalRealizedPnL,
    totalCost: totalCostAmount,
    lastCycleStats: lastCompleteCycleStats
  };

  return { summary, enrichedHistory };
}

// 计算保本价
export const calculateBreakEven = (summary: StockSummary, settings: FeeSettings): number => {
  if (summary.totalHoldings <= 0) return 0;
  const q = summary.totalHoldings;
  // 卖出费率总和 (不包含最低佣金判断，用于初步估算)
  const rateSum = settings.commissionRate + settings.stampDutyRate + settings.transferFeeRate;

  // 公式推导：
  // 卖出金额 = P * Q
  // 卖出费用 = (P * Q * rateSum) OR (5 + P * Q * (stamp + transfer))
  // 保本条件：卖出金额 - 卖出费用 = 持仓总成本 (summary.totalCost)
  // 简化版 (忽略最低5元): P * Q * (1 - rateSum) = totalCost  => P = totalCost / (Q * (1-rateSum))

  let p = summary.totalCost / (q * (1 - rateSum));

  // 检查是否触发最低5元
  const estimatedCommission = p * q * settings.commissionRate;
  if (settings.minFiveYuan && estimatedCommission < 5) {
    // 如果触发5元，公式变为：
    // P * Q - (5 + P*Q*(stamp + transfer)) = totalCost
    // P * Q * (1 - stamp - transfer) = totalCost + 5
    const otherRates = settings.stampDutyRate + settings.transferFeeRate;
    p = (summary.totalCost + 5) / (q * (1 - otherRates));
  }

  return p;
}

// 新增：计算浮动盈亏
export const calculateFloatingPnL = (
  currentPrice: number,
  holdings: number,
  totalCost: number,
  settings: FeeSettings
): number => {
  if (holdings <= 0) return 0;

  // 模拟卖出
  const marketValue = currentPrice * holdings;

  // 计算卖出费用
  let commission = marketValue * settings.commissionRate;
  if (settings.minFiveYuan && commission < 5) commission = 5;
  const stampDuty = marketValue * settings.stampDutyRate;
  const transferFee = marketValue * settings.transferFeeRate;

  const sellFees = commission + stampDuty + transferFee;

  // 净回款 - 成本
  return (marketValue - sellFees) - totalCost;
}

export const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2 }).format(val);
}

export const formatDate = (isoString: string) => {
  const d = new Date(isoString);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}