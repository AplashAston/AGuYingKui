from dataclasses import dataclass
from typing import Literal, Optional

# 定义交易类型
TransactionType = Literal['buy', 'sell']

@dataclass
class FeeSettings:
    commission_rate: float      # e.g. 0.00025
    min_five_yuan: bool         # 5元起收
    stamp_duty_rate: float      # e.g. 0.0005 (卖出收)
    transfer_fee_rate: float    # e.g. 0.00001

@dataclass
class Transaction:
    id: str
    stock_id: str
    stock_code: str
    stock_name: str
    type: TransactionType
    price: float
    quantity: int
    date: str           # ISO string "YYYY-MM-DDTHH:mm:ss"
    timestamp: int      # milliseconds
    fees: float
    total_amount: float # Cash flow

@dataclass
class CycleStats:
    holding_days: int
    total_cost: Optional[float] = 0.0
    avg_buy_price: Optional[float] = 0.0
    total_pnl: Optional[float] = 0.0
    pnl_percent: Optional[float] = 0.0

@dataclass
class EnrichedTransaction(Transaction):
    running_holdings: float = 0.0
    running_avg_cost: float = 0.0
    trade_pnl: Optional[float] = None
    position_tag: Optional[str] = None # "建仓", "清仓"
    is_t_trade: bool = False
    cycle_stats: Optional[CycleStats] = None

@dataclass
class StockSummary:
    total_holdings: float
    avg_cost: float
    total_realized_pnl: float
    total_cost: float
    last_cycle_stats: Optional[CycleStats] = None