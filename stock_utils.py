import math
from datetime import datetime
# 注意这里：删除了 Any
from typing import List, Dict, Tuple, Optional
from stock_types import (
    Transaction, FeeSettings, TransactionType, StockSummary, 
    EnrichedTransaction, CycleStats
)

DEFAULT_SETTINGS = FeeSettings(
    commission_rate=0.00025,
    min_five_yuan=True,
    stamp_duty_rate=0.0005,
    transfer_fee_rate=0.00001
)

def safe_float(num: float) -> float:
    return round(num * 10000) / 10000

def calculate_fees(
    type_: TransactionType, 
    price: float, 
    quantity: int, 
    settings: FeeSettings
) -> float:
    amount = price * quantity
    
    # 佣金
    commission = amount * settings.commission_rate
    if settings.min_five_yuan and commission < 5:
        commission = 5.0
        
    # 印花税 (仅卖出)
    stamp_duty = amount * settings.stamp_duty_rate if type_ == 'sell' else 0.0
    
    # 过户费
    transfer_fee = amount * settings.transfer_fee_rate
    
    return round(commission + stamp_duty + transfer_fee, 2)

def calculate_max_sellable(
    date_str: str, 
    transactions: List[Transaction], 
    exclude_id: Optional[str] = None
) -> int:
    try:
        target_date = datetime.fromisoformat(date_str)
    except ValueError:
        return 0

    # 目标日期的零点 (用于比较T+1)
    start_of_target_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000
    target_timestamp = target_date.timestamp() * 1000

    # 按时间排序
    sorted_tx = sorted(
        [t for t in transactions if t.id != exclude_id], 
        key=lambda x: (x.timestamp, x.id)
    )

    sellable = 0
    for t in sorted_tx:
        # 注意：Python的时间戳通常是秒，这里假设输入数据已转换为毫秒以匹配JS习惯
        t_ts = t.timestamp 
        
        if t.type == 'buy':
            # 买入必须在目标日期之前 (T+1 规则)
            # 即：买入时间 < 目标日当天的00:00:00
            if t_ts < start_of_target_day:
                sellable += t.quantity
        else:
            # 卖出占用了额度，只要它发生在目标时刻之前或同时
            if t_ts <= target_timestamp:
                sellable -= t.quantity
                
    return max(0, sellable)

def process_transaction_history(
    transactions: List[Transaction], 
    settings: FeeSettings
) -> Tuple[StockSummary, List[EnrichedTransaction]]:
    
    # 1. 排序
    sorted_tx = sorted(transactions, key=lambda x: (x.timestamp, x.id))
    
    # 2. 预计算日内买入 (用于 T+0/做T 判断)
    # 明确标注字典类型：Key是日期字符串，Value是包含数值的字典
    day_stats: Dict[str, Dict[str, float]] = {}
    
    for tx in sorted_tx:
        if tx.type == 'buy':
            day = tx.date.split('T')[0]
            if day not in day_stats:
                day_stats[day] = {'buy_qty': 0.0, 'avg_buy_price': 0.0, 'remaining_buy_qty': 0.0}
            
            stats = day_stats[day]
            cost = (tx.price * tx.quantity) + tx.fees
            current_total_cost = (stats['avg_buy_price'] * stats['buy_qty']) + cost
            
            stats['buy_qty'] += float(tx.quantity)
            stats['remaining_buy_qty'] += float(tx.quantity)
            # 避免除以零
            if stats['buy_qty'] > 0:
                stats['avg_buy_price'] = current_total_cost / stats['buy_qty']

    current_holdings: float = 0.0
    total_cost_amount: float = 0.0
    total_realized_pnl: float = 0.0
    
    # 周期统计变量
    cycle_start_date: Optional[int] = None
    cycle_total_buy_cost: float = 0.0
    cycle_total_buy_qty: int = 0
    cycle_total_realized_pnl: float = 0.0
    last_complete_cycle_stats: Optional[CycleStats] = None
    
    enriched_history: List[EnrichedTransaction] = []
    
    for tx in sorted_tx:
        # 周期初始化
        if current_holdings == 0 and tx.type == 'buy':
            cycle_start_date = tx.timestamp
            cycle_total_buy_cost = 0.0
            cycle_total_buy_qty = 0
            cycle_total_realized_pnl = 0.0
            
        day = tx.date.split('T')[0]
        # 使用 .get() 并处理可能为 None 的情况
        stats: Optional[Dict[str, float]] = day_stats.get(day)
        
        # T+0 判断
        is_t_trade: bool = False
        if tx.type == 'sell' and stats is not None and stats['buy_qty'] > 0:
            is_t_trade = True
        
        trade_pnl: Optional[float] = None
        position_tag: Optional[str] = None
        
        if current_holdings == 0 and tx.type == 'buy':
            position_tag = "建仓"
            
        if tx.type == 'buy':
            cost = (tx.price * tx.quantity) + tx.fees
            cycle_total_buy_cost += cost
            cycle_total_buy_qty += tx.quantity
            
            current_holdings += tx.quantity
            total_cost_amount += cost
        else:
            # 卖出逻辑
            net_revenue = (tx.price * tx.quantity) - tx.fees
            
            cost_of_sold_shares: float = 0.0
            matched_qty: float = 0.0
            
            # T+0 优先匹配今日买入
            if is_t_trade and stats and stats['remaining_buy_qty'] > 0:
                matched_qty = min(float(tx.quantity), stats['remaining_buy_qty'])
                cost_matched: float = matched_qty * stats['avg_buy_price']
                stats['remaining_buy_qty'] -= matched_qty
                cost_of_sold_shares += cost_matched
                
            excess_qty = float(tx.quantity) - matched_qty
            if excess_qty > 0:
                avg_cost_excess: float = 0.0
                if current_holdings > 0:
                    avg_cost_excess = total_cost_amount / current_holdings
                cost_of_sold_shares += excess_qty * avg_cost_excess
                
            total_cost_amount -= cost_of_sold_shares
            current_holdings -= tx.quantity
            
            trade_pnl = net_revenue - cost_of_sold_shares
            total_realized_pnl += trade_pnl
            cycle_total_realized_pnl += trade_pnl
            
            if current_holdings <= 0.0001:
                position_tag = "清仓"
        
        # 修正浮点误差
        current_holdings = safe_float(current_holdings)
        if abs(current_holdings) < 0.0001:
            current_holdings = 0.0
            total_cost_amount = 0.0
            
        # 周期结算
        cycle_stats: Optional[CycleStats] = None
        if position_tag == "清仓" and cycle_start_date:
            diff_time = abs(tx.timestamp - cycle_start_date)
            diff_days = max(1, math.ceil(diff_time / (1000 * 60 * 60 * 24)))
            
            pnl_percent = (cycle_total_realized_pnl / cycle_total_buy_cost * 100) if cycle_total_buy_cost > 0 else 0.0
            avg_buy_price = cycle_total_buy_cost / cycle_total_buy_qty if cycle_total_buy_qty > 0 else 0.0
            
            cycle_stats = CycleStats(
                holding_days=diff_days,
                total_cost=cycle_total_buy_cost,
                avg_buy_price=avg_buy_price,
                total_pnl=cycle_total_realized_pnl,
                pnl_percent=pnl_percent
            )
            last_complete_cycle_stats = cycle_stats
        elif cycle_start_date:
            diff_time = abs(tx.timestamp - cycle_start_date)
            cycle_stats = CycleStats(
                holding_days=max(1, math.ceil(diff_time / (1000 * 60 * 60 * 24)))
            )
            
        enriched_history.append(EnrichedTransaction(
            **tx.__dict__,
            running_holdings=current_holdings,
            running_avg_cost=total_cost_amount / current_holdings if current_holdings > 0 else 0.0,
            trade_pnl=trade_pnl,
            position_tag=position_tag,
            is_t_trade=is_t_trade,
            cycle_stats=cycle_stats
        ))
        
    summary = StockSummary(
        total_holdings=current_holdings,
        avg_cost=total_cost_amount / current_holdings if current_holdings > 0 else 0.0,
        total_realized_pnl=total_realized_pnl,
        total_cost=total_cost_amount,
        last_cycle_stats=last_complete_cycle_stats
    )
    
    return summary, enriched_history