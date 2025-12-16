import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
   Settings, Plus, Trash2, Edit3, AlertCircle, X, Save, Info,
   DollarSign, PieChart, ArrowRightLeft, ChevronDown, ChevronLeft,
   FolderPlus, Calculator, Download, Upload, Minus, Square,
   LayoutDashboard, TrendingUp, TrendingDown, Wallet, ArrowUpRight,
   Target
} from 'lucide-react';
import { Transaction, FeeSettings, TransactionType, EnrichedTransaction, Stock } from './types';
import {
   DEFAULT_SETTINGS, generateId, calculateFees, validateTransaction,
   processTransactionHistory, calculateBreakEven, formatCurrency,
   formatDate, calculateMaxSellable, calculateFloatingPnL
} from './utils';

const STORAGE_KEY_TXNS = 'stock_transactions_v2';
const STORAGE_KEY_SETTINGS = 'stock_settings_v1';
const STORAGE_KEY_STOCKS = 'stock_list_v1';

const customStyles = `
  /* 1. 底层：默认允许拖动 */
  body {
    -webkit-app-region: drag;
    user-select: none;
    -webkit-user-select: none;
    overflow: hidden;
    height: 100vh;
    width: 100vw;
    background-color: transparent;
  }

  /* 2. 中间层：屏蔽拖动 */
  #root {
    -webkit-app-region: no-drag;
    height: 100%;
    width: 100%;
  }

  /* 3. 顶层：标题栏显式开启拖动 */
  .draggable-area {
    -webkit-app-region: drag !important;
  }
  
  /* 4. 交互层：禁止拖动 */
  .non-draggable, button, input, .transaction-item, .clickable, .scrollable, .modal-content {
    -webkit-app-region: no-drag !important;
  }
  
  input {
    user-select: text !important;
    -webkit-user-select: text !important;
    cursor: text;
  }
  
  input[type=number]::-webkit-inner-spin-button, 
  input[type=number]::-webkit-outer-spin-button { 
    -webkit-appearance: none; margin: 0; 
  }
  input[type=number] { -moz-appearance: textfield; }
  
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.1); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.2); }
  
  .transaction-item { cursor: pointer; }
`;

const formatNumber = (num: number, isCurrency: boolean = false) => {
   const rawStr = num.toFixed(2);
   const isLong = rawStr.length > 8;
   const fontSize = isLong ? 'text-lg' : 'text-2xl';
   const text = isCurrency ? formatCurrency(num) : num.toLocaleString('zh-CN');
   return { text, fontSize };
};

const CustomTitleBar = ({ onClose }: { onClose: () => void; }) => {
   const isDesktop = typeof window !== 'undefined' && (window as any).pywebview;
   const handleMinimize = () => isDesktop?.api?.minimize_window();
   const handleMaximize = () => isDesktop?.api?.maximize_window();

   return (
      <div className="fixed top-0 left-0 right-0 h-10 bg-white/90 backdrop-blur-md flex items-center px-4 draggable-area z-[9999] border-b border-gray-200/50 shadow-sm">
         <div className="flex items-center gap-2 non-draggable">
            <button onClick={onClose} className="w-3 h-3 rounded-full bg-[#FF5F57] border border-[#E0443E] hover:brightness-90 flex items-center justify-center group"><X size={6} className="text-black/50 opacity-0 group-hover:opacity-100" /></button>
            <button onClick={handleMinimize} className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#D9A322] hover:brightness-90 flex items-center justify-center group"><Minus size={6} className="text-black/50 opacity-0 group-hover:opacity-100" /></button>
            <button onClick={handleMaximize} className="w-3 h-3 rounded-full bg-[#28CA42] border border-[#1BAC2C] hover:brightness-90 flex items-center justify-center group"><Square size={6} className="text-black/50 opacity-0 group-hover:opacity-100" /></button>
         </div>
         <div className="flex-1 text-center text-xs font-semibold text-gray-500 pointer-events-none">A股盈亏复盘</div>
      </div>
   );
};

export default function App() {
   // --- Global State ---
   const [stocks, setStocks] = useState<Stock[]>([]);
   const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
   const [transactions, setTransactions] = useState<Transaction[]>([]);
   const [settings, setSettings] = useState<FeeSettings>(DEFAULT_SETTINGS);

   const [currentView, setCurrentView] = useState<'dashboard' | 'detail'>('dashboard');
   const [isDataLoaded, setIsDataLoaded] = useState(false);

   // 新增：脏状态标记 (true 表示有未保存的修改)
   const [isDirty, setIsDirty] = useState(false);

   // --- UI State ---
   const [showSettings, setShowSettings] = useState(false);
   const [showAddStock, setShowAddStock] = useState(false);
   const [isStockSelectorOpen, setIsStockSelectorOpen] = useState(false);
   const [showCloseConfirm, setShowCloseConfirm] = useState(false);
   const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

   const [editingId, setEditingId] = useState<string | null>(null);
   const [deleteStockId, setDeleteStockId] = useState<string | null>(null);

   const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
   const [isDraggingSelection, setIsDraggingSelection] = useState(false);

   const [formType, setFormType] = useState<TransactionType>('buy');
   const [formPrice, setFormPrice] = useState<string>('');
   const [formQty, setFormQty] = useState<string>('');
   const [txDate, setTxDate] = useState<string>('');
   const [txTime, setTxTime] = useState<string>('');
   const [formError, setFormError] = useState<string | null>(null);

   const [newStockName, setNewStockName] = useState('');
   const [newStockCode, setNewStockCode] = useState('');

   const fileInputRef = useRef<HTMLInputElement>(null);
   const scrollContainerRef = useRef<HTMLDivElement>(null);

   // --- Initialization ---
   useEffect(() => {
      const loadData = async () => {
         let loaded = false;

         if ((window as any).pywebview) {
            try {
               const raw = await (window as any).pywebview.api.load_user_data();
               if (raw) {
                  const data = JSON.parse(raw);
                  if (data.stocks) setStocks(data.stocks);
                  if (data.transactions) setTransactions(data.transactions);
                  if (data.settings) setSettings(data.settings);
                  loaded = true;
               }
            } catch (e) {
               console.error("加载文件失败", e);
            }
         }

         if (!loaded) {
            try {
               const savedTxns = JSON.parse(localStorage.getItem(STORAGE_KEY_TXNS) || '[]');
               const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS) || 'null');
               const savedStocks = JSON.parse(localStorage.getItem(STORAGE_KEY_STOCKS) || '[]');

               if (savedSettings) setSettings(savedSettings);

               let loadedStocks = savedStocks;
               if (savedTxns.length > 0 && loadedStocks.length === 0) {
                  loadedStocks = [{ id: 'default', name: '我的股票', code: '000000' }];
                  savedTxns.forEach((t: Transaction) => { if (!t.stockId) (t as any).stockId = 'default'; });
               }
               setStocks(loadedStocks);
               setTransactions(savedTxns);
            } catch (e) { console.error("LocalStorage 加载失败", e); }
         }

         setIsDataLoaded(true);
         // 初始加载后，设为 clean
         setIsDirty(false);
      };

      loadData();

      const now = new Date();
      setTxDate(now.toISOString().split('T')[0]);
      setTxTime(now.toTimeString().slice(0, 8));
   }, []);

   // 恢复选中状态
   useEffect(() => {
      if (isDataLoaded && stocks.length > 0) {
         const lastActive = localStorage.getItem('last_active_stock');
         if (lastActive && stocks.find(s => s.id === lastActive)) {
            setSelectedStockId(lastActive);
            setCurrentView('detail');
         }
      }
   }, [isDataLoaded]); // 只在加载完成时运行一次

   // --- 核心逻辑：监听数据变化设置脏状态 ---
   useEffect(() => {
      if (!isDataLoaded) return;
      // 只要数据变化，就标记为 dirty (未保存)
      // 注意：这里去掉了自动保存逻辑
      setIsDirty(true);
   }, [transactions, settings, stocks]);

   // --- 手动保存功能 ---
   const performSave = async () => {
      // 1. 保存到 LocalStorage (缓存)
      localStorage.setItem(STORAGE_KEY_TXNS, JSON.stringify(transactions));
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
      localStorage.setItem(STORAGE_KEY_STOCKS, JSON.stringify(stocks));
      if (selectedStockId) localStorage.setItem('last_active_stock', selectedStockId);

      // 2. 保存到文件
      if ((window as any).pywebview) {
         const data = JSON.stringify({ version: 2, stocks, transactions, settings });
         try {
            await (window as any).pywebview.api.save_user_data(data);
            // 保存成功，重置脏状态
            setIsDirty(false);
            return true;
         } catch (e) {
            console.error("保存失败", e);
            return false;
         }
      }
      setIsDirty(false);
      return true;
   };

   // --- 关闭流程 ---
   const handleCloseFlow = () => {
      if (isDirty) {
         // 有未保存修改 -> 弹窗确认
         setShowCloseConfirm(true);
      } else {
         // 无修改 -> 直接退出
         const api = (window as any).pywebview?.api;
         api?.destroy_app();
      }
   };

   // --- 快捷键监听 (Cmd+S / Cmd+W) ---
   useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
         // Command+S / Ctrl+S 保存
         if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            performSave();
         }
         // Command+W / Ctrl+W 关闭 (防止卡死)
         if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
            e.preventDefault();
            handleCloseFlow();
         }
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
   }, [isDirty, transactions, settings, stocks]); // 依赖项要全，确保 save 时拿到最新数据

   // 监听后端关闭请求
   useEffect(() => {
      const handleBackendClose = () => handleCloseFlow();
      window.addEventListener('app-close-request', handleBackendClose);
      return () => window.removeEventListener('app-close-request', handleBackendClose);
   }, [isDirty, transactions, settings, stocks]);

   useEffect(() => {
      const styleElement = document.createElement('style');
      styleElement.innerHTML = customStyles;
      document.head.appendChild(styleElement);
      return () => { document.head.removeChild(styleElement); };
   }, []);

   // --- Action Wrappers ---
   const confirmSaveAndClose = async () => {
      await performSave();
      const api = (window as any).pywebview?.api;
      api?.destroy_app();
   };

   const confirmDontSaveAndClose = () => {
      const api = (window as any).pywebview?.api;
      api?.destroy_app();
   };

   // ... (Computations & Action Handlers same as before) ...
   const currentStock = useMemo(() => stocks.find(s => s.id === selectedStockId), [stocks, selectedStockId]);
   const currentStockTransactions = useMemo(() => transactions.filter(t => t.stockId === selectedStockId), [transactions, selectedStockId]);
   const { summary, enrichedHistory } = useMemo(() => processTransactionHistory(currentStockTransactions, settings), [currentStockTransactions, settings]);
   const currentPrice = currentStock?.currentPrice || 0;
   const floatingPnL = useMemo(() => calculateFloatingPnL(currentPrice, summary.totalHoldings, summary.totalCost, settings), [currentPrice, summary, settings]);
   const marketValue = currentPrice * summary.totalHoldings;
   const breakEvenPrice = useMemo(() => calculateBreakEven(summary, settings), [summary, settings]);
   const maxSellQty = useMemo(() => {
      if (formType === 'buy' || !currentStock) return Infinity;
      const fullDate = `${txDate}T${txTime}`;
      return calculateMaxSellable(fullDate, currentStockTransactions, editingId || undefined);
   }, [formType, txDate, txTime, currentStockTransactions, editingId, currentStock]);
   const displayedTransactions = useMemo(() => [...enrichedHistory].reverse(), [enrichedHistory]);
   const dashboardData = useMemo(() => {
      let totalRealized = 0; let totalCost = 0; let totalFloating = 0;
      const stockSummaries = stocks.map(stock => {
         const txs = transactions.filter(t => t.stockId === stock.id);
         const { summary } = processTransactionHistory(txs, settings);
         const floating = calculateFloatingPnL(stock.currentPrice || 0, summary.totalHoldings, summary.totalCost, settings);
         totalRealized += summary.totalRealizedPnL; totalCost += summary.totalCost; totalFloating += floating;
         return { ...stock, summary, floatingPnL: floating };
      });
      return { totalRealized, totalCost, totalFloating, stockSummaries };
   }, [stocks, transactions, settings]);
   const totalAccountPnL = dashboardData.totalRealized + dashboardData.totalFloating;

   const handleSaveTransaction = () => {
      if (!selectedStockId || !currentStock) return;
      const price = parseFloat(formPrice); const qty = parseInt(formQty);
      if (isNaN(price) || price < 0) return setFormError("价格无效");
      if (isNaN(qty) || qty <= 0 || qty % 100 !== 0) return setFormError("数量须为100倍数");
      const fullDate = `${txDate}T${txTime}`;
      const fees = calculateFees(formType, price, qty, settings);
      const newTx: Transaction = { id: editingId || generateId(), stockId: selectedStockId, stockCode: currentStock.code, stockName: currentStock.name, type: formType, price, quantity: qty, date: fullDate, timestamp: new Date(fullDate).getTime(), fees, totalAmount: (price * qty) + (formType === 'buy' ? fees : -fees) };
      const validation = validateTransaction(newTx, currentStockTransactions);
      if (!validation.valid) return setFormError(validation.message || "无效");
      setTransactions(prev => editingId ? prev.map(t => t.id === editingId ? newTx : t) : [...prev, newTx]);
      setEditingId(null); setFormPrice(''); setFormQty(''); setFormError(null);
   };
   const updateStockPrice = (price: number) => { const safePrice = isNaN(price) ? 0 : price; setStocks(prev => prev.map(s => s.id === selectedStockId ? { ...s, currentPrice: safePrice } : s)); };
   const handleDeleteStock = (stockId: string) => { setStocks(prev => prev.filter(s => s.id !== stockId)); setTransactions(prev => prev.filter(t => t.stockId !== stockId)); setShowDeleteConfirm(null); if (selectedStockId === stockId) { setSelectedStockId(null); setCurrentView('dashboard'); } };
   const handleEdit = (tx: EnrichedTransaction) => { setEditingId(tx.id); setFormType(tx.type); setFormPrice(tx.price.toString()); setFormQty(tx.quantity.toString()); const [d, t] = tx.date.split('T'); setTxDate(d); setTxTime(t.substring(0, 8)); document.querySelector('.sidebar-content')?.scrollTo({ top: 0, behavior: 'smooth' }); };
   const handleExport = () => { const data = JSON.stringify({ version: 2, stocks, transactions, settings }, null, 2); const filename = `A股复盘_${new Date().toISOString().slice(0, 10)}.json`; const pyApi = (window as any).pywebview?.api; if (pyApi?.save_file) { pyApi.save_file(data, filename); } else { const blob = new Blob([data], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); document.body.removeChild(link); } setShowSettings(false); };
   const adjustPrice = (delta: number) => setFormPrice(Math.max(0, (parseFloat(formPrice) || 0) + delta).toFixed(2));
   const adjustQty = (delta: number) => { let next = (parseInt(formQty) || 0) + delta; if (next < 0) next = 0; if (formType === 'sell' && next > maxSellQty) next = maxSellQty; setFormQty(next.toString()); };
   const adjustCommission = (d: number) => setSettings(s => ({ ...s, commissionRate: parseFloat(Math.max(0, s.commissionRate + d).toFixed(5)) }));
   const adjustStampDuty = (d: number) => setSettings(s => ({ ...s, stampDutyRate: parseFloat(Math.max(0, s.stampDutyRate + d).toFixed(5)) }));
   const adjustTransferFee = (d: number) => setSettings(s => ({ ...s, transferFeeRate: parseFloat(Math.max(0, s.transferFeeRate + d).toFixed(5)) }));
   const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSaveTransaction(); };
   const handleMouseDown = (id: string) => { setIsDraggingSelection(true); setSelectedTxIds(new Set(selectedTxIds.has(id) ? [...selectedTxIds].filter(x => x !== id) : [...selectedTxIds, id])); };
   const handleMouseEnter = (id: string) => { if (isDraggingSelection) setSelectedTxIds(new Set([...selectedTxIds, id])); };
   useEffect(() => { const up = () => setIsDraggingSelection(false); window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up); }, []);

   return (
      <div className="flex h-screen w-screen bg-[#F2F2F7] overflow-hidden text-[#1C1C1E] font-sans">
         {/* ... (UI Structure - Sidebar & Content) ... */}
         {/* ... (Keep existing Sidebar & Content code) ... */}
         {/* 为了节省空间，我将把修改后的 CloseConfirm 弹窗放在这里，其他 UI 结构请保持原样 */}

         <div className="w-full md:w-[280px] lg:w-[320px] flex-shrink-0 bg-white/80 backdrop-blur-2xl border-r border-gray-200 flex flex-col z-30 shadow-lg relative draggable-area">
            <CustomTitleBar onClose={handleCloseFlow} />
            {/* ... Sidebar content (Same as before) ... */}
            <div className="flex-1 flex flex-col overflow-hidden sidebar-content pt-12 non-draggable">
               <div className="px-6 pb-2">
                  <div className="flex items-center justify-between mb-6">
                     <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
                        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-md"><LayoutDashboard size={16} className="text-white" /></div>
                        <span className="font-bold text-gray-800">资产总览</span>
                     </div>
                     <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-gray-100 rounded-full transition"><Settings size={18} /></button>
                  </div>
                  <button onClick={() => setIsStockSelectorOpen(!isStockSelectorOpen)} className="w-full bg-white border border-gray-200 p-4 rounded-2xl flex items-center justify-between hover:shadow-md transition-all mb-4 text-left">
                     <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-400 font-bold mb-1">当前股票</div>
                        {currentStock ? (
                           <div><div className="font-bold text-lg truncate">{currentStock.name}</div><div className="text-xs font-mono text-gray-400">{currentStock.code}</div></div>
                        ) : <div className="text-gray-400 font-bold">选择或添加股票</div>}
                     </div>
                     <ChevronDown size={16} className="text-gray-400 ml-2" />
                  </button>
                  {isStockSelectorOpen && (
                     <div className="absolute top-[180px] left-6 right-6 bg-white/95 backdrop-blur shadow-2xl rounded-2xl border border-gray-100 p-2 z-50 max-h-[300px] overflow-y-auto scrollable">
                        <div onClick={() => { setCurrentView('dashboard'); setIsStockSelectorOpen(false); }} className="p-3 hover:bg-blue-50 rounded-xl cursor-pointer flex gap-3 items-center group mb-1 border-b border-dashed border-gray-200">
                           <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><LayoutDashboard size={14} className="text-gray-500" /></div>
                           <span className="font-bold text-sm">查看资产总览</span>
                        </div>
                        {stocks.map(s => (
                           <div key={s.id} onClick={() => { setSelectedStockId(s.id); setCurrentView('detail'); setIsStockSelectorOpen(false); }} className="p-3 hover:bg-blue-50 rounded-xl cursor-pointer flex justify-between group">
                              <div><div className="font-bold text-sm">{s.name}</div><div className="text-xs text-gray-400">{s.code}</div></div>
                           </div>
                        ))}
                        <button onClick={() => { setShowAddStock(true); setIsStockSelectorOpen(false); }} className="w-full py-2 text-center text-blue-600 text-sm font-bold mt-1">+ 添加股票</button>
                     </div>
                  )}
               </div>
               {currentView === 'detail' && currentStock ? (
                  <div className="flex-1 px-6 pb-6 overflow-y-auto no-scrollbar space-y-4">
                     <div className="bg-gray-100 p-1 rounded-xl flex">
                        <button onClick={() => setFormType('buy')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formType === 'buy' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}>买入</button>
                        <button onClick={() => setFormType('sell')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${formType === 'sell' ? 'bg-white text-green-500 shadow-sm' : 'text-gray-400'}`}>卖出</button>
                     </div>
                     <div className="space-y-3">
                        <div className="bg-white p-3 rounded-2xl border border-gray-100">
                           <div className="text-xs text-gray-400 font-bold mb-1">日期时间</div>
                           <div className="flex gap-2">
                              <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="flex-1 font-mono font-bold bg-transparent text-sm" />
                              <input type="time" value={txTime} onChange={e => setTxTime(e.target.value)} step="1" className="w-24 font-mono font-bold bg-transparent text-sm" />
                           </div>
                        </div>
                        <div className="bg-white p-3 rounded-2xl border border-gray-100 flex items-stretch">
                           <div className="flex-1">
                              <div className="text-xs text-gray-400 font-bold mb-1">价格</div>
                              <input type="number" placeholder="0.00" value={formPrice} onChange={e => setFormPrice(e.target.value)} onFocus={e => e.target.select()} onKeyDown={handleKeyDown} className="w-full text-2xl font-bold bg-transparent outline-none" />
                           </div>
                           <div className="flex flex-col justify-center gap-1 pl-2 border-l border-gray-100">
                              <button onClick={() => adjustPrice(0.01)} className="w-8 h-6 bg-gray-100 hover:bg-blue-100 hover:text-blue-600 rounded flex items-center justify-center font-bold text-gray-500 transition-colors">▲</button>
                              <button onClick={() => adjustPrice(-0.01)} className="w-8 h-6 bg-gray-100 hover:bg-blue-100 hover:text-blue-600 rounded flex items-center justify-center font-bold text-gray-500 transition-colors">▼</button>
                           </div>
                        </div>
                        <div className="bg-white p-3 rounded-2xl border border-gray-100 flex items-stretch">
                           <div className="flex-1">
                              <div className="flex justify-between mb-1">
                                 <span className="text-xs text-gray-400 font-bold">数量</span>
                                 {formType === 'sell' && <span className="text-xs text-green-600 font-bold">可卖: {maxSellQty}</span>}
                              </div>
                              <input type="number" placeholder="100" value={formQty} onChange={e => setFormQty(e.target.value)} onFocus={e => e.target.select()} onKeyDown={handleKeyDown} className="w-full text-2xl font-bold bg-transparent outline-none" />
                           </div>
                           <div className="flex flex-col justify-center gap-1 pl-2 border-l border-gray-100">
                              <button onClick={() => adjustQty(100)} className="w-8 h-6 bg-gray-100 hover:bg-blue-100 hover:text-blue-600 rounded flex items-center justify-center font-bold text-gray-500 transition-colors">▲</button>
                              <button onClick={() => adjustQty(-100)} className="w-8 h-6 bg-gray-100 hover:bg-blue-100 hover:text-blue-600 rounded flex items-center justify-center font-bold text-gray-500 transition-colors">▼</button>
                           </div>
                        </div>
                     </div>
                     {formError && <div className="text-red-500 text-xs font-bold px-2">{formError}</div>}
                     <div className="flex gap-2">
                        {editingId && <button onClick={() => { setEditingId(null); setFormPrice(''); setFormQty(''); }} className="flex-1 py-4 bg-gray-200 text-gray-600 rounded-2xl font-bold">取消</button>}
                        <button onClick={handleSaveTransaction} className={`flex-1 py-4 rounded-2xl font-bold text-white shadow-lg active:scale-95 transition-all ${formType === 'buy' ? 'bg-red-500 shadow-red-200' : 'bg-green-500 shadow-green-200'}`}>{editingId ? '保存修改' : '记一笔'}</button>
                     </div>
                  </div>
               ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                     <p className="text-xs font-bold text-gray-300">总资产统计中...</p>
                  </div>
               )}
            </div>
         </div>

         <div className="flex-1 flex flex-col min-w-0 bg-[#F2F2F7] relative non-draggable">
            <div className="h-10 w-full shrink-0" />
            {currentView === 'dashboard' && (
               <div className="flex-1 overflow-y-auto p-6 scrollable">
                  <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Wallet /> 资产总览</h1>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                     <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                        <div className="text-gray-400 font-bold text-xs mb-2 uppercase flex items-center gap-2"><DollarSign size={14} /> 累计总盈亏</div>
                        <div className={`text-4xl font-bold ${totalAccountPnL >= 0 ? 'text-red-500' : 'text-green-500'}`}>{totalAccountPnL >= 0 ? '+' : ''}{formatCurrency(totalAccountPnL)}</div>
                        <div className="text-xs text-gray-400 mt-1">已实现: {formatCurrency(dashboardData.totalRealized)} | 浮动: {formatCurrency(dashboardData.totalFloating)}</div>
                     </div>
                     <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                        <div className="text-gray-400 font-bold text-xs mb-2 uppercase flex items-center gap-2"><PieChart size={14} /> 持仓占用资金</div>
                        <div className="text-4xl font-bold text-gray-900">{formatCurrency(dashboardData.totalCost)}</div>
                     </div>
                     <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
                        <div className="text-gray-400 font-bold text-xs mb-2 uppercase flex items-center gap-2"><TrendingUp size={14} /> 潜在浮动盈亏</div>
                        <div className={`text-4xl font-bold ${dashboardData.totalFloating >= 0 ? 'text-red-500' : 'text-green-500'}`}>{dashboardData.totalFloating > 0 ? '+' : ''}{formatCurrency(dashboardData.totalFloating)}</div>
                        <div className="text-xs text-gray-400 mt-1">基于各股票最新设定现价</div>
                     </div>
                  </div>
                  <div className="space-y-3">
                     <h2 className="text-lg font-bold text-gray-600 mb-2">持仓详情</h2>
                     {dashboardData.stockSummaries.map((stock) => (
                        <div key={stock.id} onClick={() => { setSelectedStockId(stock.id); setCurrentView('detail'); }} className="bg-white p-4 rounded-2xl flex items-center justify-between border border-transparent hover:border-blue-200 hover:shadow-md cursor-pointer transition-all group">
                           <div>
                              <div className="font-bold text-lg flex items-center gap-2">{stock.name}<span className="text-xs font-mono text-gray-400 font-normal bg-gray-100 px-1.5 py-0.5 rounded">{stock.code}</span></div>
                              <div className="text-xs text-gray-400 mt-1">持仓: {stock.summary.totalHoldings} | 成本: {formatCurrency(stock.summary.totalCost)}</div>
                           </div>
                           <div className="flex items-center gap-6">
                              <div className="text-right">
                                 {stock.summary.totalHoldings > 0 && (<div className={`text-xs font-bold ${stock.floatingPnL >= 0 ? 'text-red-500' : 'text-green-500'}`}>浮动: {stock.floatingPnL > 0 ? '+' : ''}{formatCurrency(stock.floatingPnL)}</div>)}
                                 <div className="text-xs text-gray-400">已实现: {formatCurrency(stock.summary.totalRealizedPnL)}</div>
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(stock.id); }} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-red-100 hover:text-red-500 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
                           </div>
                        </div>
                     ))}
                     {dashboardData.stockSummaries.length === 0 && (<div className="text-center text-gray-400 py-10">暂无股票数据</div>)}
                  </div>
               </div>
            )}
            {currentView === 'detail' && currentStock && (
               <>
                  <div className="flex items-center px-6 pt-2 pb-2">
                     <button onClick={() => setCurrentView('dashboard')} className="mr-4 w-8 h-8 rounded-full bg-white hover:bg-gray-100 flex items-center justify-center shadow-sm text-gray-500 transition-all"><ChevronLeft size={20} /></button>
                     <div className="flex items-center gap-2"><h1 className="text-xl font-bold">{currentStock.name}</h1><span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded font-mono">{currentStock.code}</span></div>
                  </div>
                  <div className="px-6 pt-2 pb-2 shrink-0 flex gap-4 overflow-x-auto scrollable no-scrollbar">
                     {(() => {
                        const hasHoldings = summary.totalHoldings > 0;
                        const cards = [
                           hasHoldings ? { title: '浮动盈亏', val: floatingPnL, isC: true, color: floatingPnL >= 0 ? 'text-red-500' : 'text-green-500', icon: TrendingUp } : { title: '累计已实现', val: summary.totalRealizedPnL, isC: true, color: summary.totalRealizedPnL >= 0 ? 'text-red-500' : 'text-green-500', icon: DollarSign },
                           hasHoldings ? { title: '持仓市值', val: marketValue, isC: true, color: 'text-blue-600', icon: PieChart } : { title: '当前持仓', val: summary.totalHoldings, isC: false, color: 'text-gray-900', icon: PieChart },
                           { title: '持仓均价', val: summary.avgCost, isC: true, color: 'text-gray-900', icon: ArrowRightLeft },
                           hasHoldings ? { title: '保本价格', val: breakEvenPrice, isC: true, color: 'text-purple-600', icon: Target } : { title: '持仓总成本', val: summary.totalCost, isC: true, color: 'text-gray-500', icon: Info },
                        ];
                        return cards.map((item, i) => {
                           const fmt = formatNumber(item.val, item.isC);
                           return (
                              <div key={i} className="flex-1 min-w-[160px] bg-white/60 backdrop-blur-md border border-white/60 p-4 rounded-[20px] shadow-sm flex flex-col justify-between h-[100px]">
                                 <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase"><item.icon size={14} /> {item.title}</div>
                                 <div className={`${fmt.fontSize} font-bold ${item.color} tracking-tight`}>{fmt.text}</div>
                                 {hasHoldings && i === 1 && <div className="text-[10px] text-gray-400 font-bold">数量: {summary.totalHoldings}</div>}
                              </div>
                           );
                        });
                     })()}
                  </div>
                  {summary.totalHoldings > 0 && (
                     <div className="px-6 py-2 shrink-0">
                        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-3 flex items-center gap-4">
                           <div className="bg-white p-2 rounded-xl shadow-sm border border-blue-100 flex items-center gap-2">
                              <div className="text-[10px] text-gray-400 font-bold whitespace-nowrap">输入现价</div>
                              <input type="number" className="w-20 font-bold bg-transparent outline-none text-lg text-gray-900" placeholder="0.00" value={currentStock.currentPrice || ''} onChange={e => updateStockPrice(parseFloat(e.target.value))} />
                           </div>
                           <div className="text-xs text-gray-500 flex-1">基于现价 <span className="font-bold">{currentStock.currentPrice || 0}</span>，您的浮动盈亏为 <span className={`font-bold ${floatingPnL >= 0 ? 'text-red-500' : 'text-green-500'}`}>{formatCurrency(floatingPnL)}</span></div>
                        </div>
                     </div>
                  )}
                  <div className="flex-1 overflow-hidden flex flex-col px-4 md:px-6 pb-6 pt-2">
                     {selectedTxIds.size > 0 && (
                        <div className="bg-blue-600 text-white px-6 py-3 rounded-2xl mb-4 flex justify-between items-center shadow-lg shadow-blue-200 animate-enter z-20 non-draggable">
                           <span className="font-bold">{selectedTxIds.size} 项已选择</span>
                           <div className="flex gap-4 text-sm font-bold">
                              <button onClick={() => { const id = Array.from(selectedTxIds)[0]; const tx = enrichedHistory.find(t => t.id === id); if (tx) handleEdit(tx); }} disabled={selectedTxIds.size !== 1} className="opacity-80 hover:opacity-100 disabled:opacity-30">编辑</button>
                              <button onClick={() => { setTransactions(prev => prev.filter(t => !selectedTxIds.has(t.id))); setSelectedTxIds(new Set()); }} className="opacity-80 hover:opacity-100">删除</button>
                              <button onClick={() => setSelectedTxIds(new Set())} className="opacity-80 hover:opacity-100">取消</button>
                           </div>
                        </div>
                     )}
                     <div ref={scrollContainerRef} className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-20 scrollable">
                        {displayedTransactions.map((tx) => {
                           const isSelected = selectedTxIds.has(tx.id);
                           const tDetail = tx.tTradeDetail;
                           return (
                              <div key={tx.id} onMouseDown={() => handleMouseDown(tx.id)} onMouseEnter={() => handleMouseEnter(tx.id)} className={`transaction-item bg-white rounded-2xl p-4 transition-all border ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:shadow-md'}`}>
                                 <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                       <div className={`w-2 h-10 rounded-full ${tx.type === 'buy' ? 'bg-red-500' : 'bg-green-500'}`} />
                                       <div>
                                          <div className="font-bold text-gray-900 flex items-center gap-2">{tx.type === 'buy' ? '买入' : '卖出'}<span className="text-gray-400 font-mono text-xs font-normal">{formatDate(tx.date)}</span>{tx.positionTag === '清仓' && <span className="bg-blue-100 text-blue-600 text-[10px] px-1.5 py-0.5 rounded font-bold">清仓</span>}{tx.positionTag === '建仓' && <span className="bg-orange-100 text-orange-600 text-[10px] px-1.5 py-0.5 rounded font-bold">建仓</span>}{tx.isTTrade && <span className="bg-purple-100 text-purple-600 text-[10px] px-1.5 py-0.5 rounded font-bold">T</span>}</div>
                                          <div className="text-xs text-gray-400">¥{tx.price.toFixed(2)} x {tx.quantity}</div>
                                       </div>
                                    </div>
                                    <div className="text-right">
                                       <div className={`font-bold ${tx.type === 'buy' ? 'text-gray-900' : (tx.tradePnL || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>{tx.type === 'buy' ? formatCurrency(Math.abs(tx.totalAmount)) : (tx.tradePnL ? (tx.tradePnL > 0 ? '+' : '') + tx.tradePnL.toFixed(2) : '--')}</div>
                                       <div className="text-xs text-gray-400">持仓: {tx.runningHoldings}</div>
                                    </div>
                                 </div>
                                 {tDetail && (<div className="mt-2 bg-purple-50 rounded-xl p-3 flex items-center justify-around text-xs animate-enter border border-purple-100"><div className="text-center"><div className="text-purple-400 font-bold mb-0.5">第{tDetail.index}次做T</div><div className="font-bold text-purple-900">{tDetail.type === 'reverse' ? '先卖后买' : '先买后卖'}</div></div><div className="w-px h-6 bg-purple-200" /><div className="text-center"><div className="text-purple-400 font-bold mb-0.5">间隔</div><div className="font-bold text-purple-900">{tDetail.timeInterval}</div></div><div className="w-px h-6 bg-purple-200" /><div className="text-center"><div className="text-purple-400 font-bold mb-0.5">做T收益</div><div className={`font-bold ${tDetail.profit >= 0 ? 'text-red-500' : 'text-green-500'}`}>{tDetail.profit > 0 ? '+' : ''}{tDetail.profit.toFixed(2)}</div></div></div>)}
                                 {tx.positionTag === '清仓' && tx.cycleStats && (<div className="mt-2 bg-gray-50 rounded-xl p-3 grid grid-cols-5 gap-2 text-center text-xs border border-gray-100 animate-enter"><div><div className="text-gray-400 font-bold mb-0.5">持仓</div><div className="font-bold">{tx.cycleStats.holdingDays}天</div></div><div><div className="text-gray-400 font-bold mb-0.5">建仓均价</div><div className="font-bold">{tx.cycleStats.avgBuyPrice?.toFixed(2)}</div></div><div><div className="text-gray-400 font-bold mb-0.5">总收益</div><div className={`font-bold ${tx.cycleStats.totalPnL! >= 0 ? 'text-red-500' : 'text-green-500'}`}>{tx.cycleStats.totalPnL?.toFixed(0)}</div></div><div><div className="text-gray-400 font-bold mb-0.5">做T次数</div><div className="font-bold">{tx.cycleStats.totalTTrades || 0}</div></div><div><div className="text-gray-400 font-bold mb-0.5">做T总利</div><div className={`font-bold ${(tx.cycleStats.totalTProfit || 0) >= 0 ? 'text-red-500' : 'text-green-500'}`}>{tx.cycleStats.totalTProfit?.toFixed(0) || 0}</div></div></div>)}
                              </div>
                           );
                        })}
                     </div>
                  </div>
               </>
            )}
         </div>

         {/* 🔴 重构：三选一 关闭确认弹窗 */}
         {showCloseConfirm && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
               <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center space-y-4 animate-scale non-draggable modal-content" onClick={e => e.stopPropagation()}>
                  <AlertCircle size={40} className="mx-auto text-red-500" />
                  <h3 className="text-lg font-bold">确认退出?</h3>
                  <p className="text-gray-500 text-sm">您有未保存的修改，是否保存？</p>

                  {/* 新的三个按钮布局 */}
                  <div className="flex flex-col gap-2">
                     <button onClick={confirmSaveAndClose} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-200 transition-colors">
                        保存并关闭
                     </button>
                     <div className="flex gap-2">
                        <button onClick={confirmDontSaveAndClose} className="flex-1 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-bold transition-colors">
                           不保存
                        </button>
                        <button onClick={() => setShowCloseConfirm(false)} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl font-bold transition-colors">
                           取消
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* ... (Other modals same as before) ... */}
         {showDeleteConfirm && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
               <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center space-y-4 animate-scale non-draggable modal-content" onClick={e => e.stopPropagation()}>
                  <AlertCircle size={40} className="mx-auto text-red-500" />
                  <h3 className="text-lg font-bold">删除股票?</h3>
                  <p className="text-gray-500 text-sm">此操作将删除该股票及其所有交易记录，且不可恢复。</p>
                  <div className="flex gap-3">
                     <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600">取消</button>
                     <button onClick={() => handleDeleteStock(showDeleteConfirm)} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-200">删除</button>
                  </div>
               </div>
            </div>
         )}

         {showSettings && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
               <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 animate-scale non-draggable modal-content" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-2"><h2 className="text-xl font-bold">交易设置</h2><button onClick={() => setShowSettings(false)} className="p-1 bg-gray-100 rounded-full"><X size={16} /></button></div>
                  <div className="bg-gray-50 p-4 rounded-2xl"><div className="text-xs font-bold text-gray-500 mb-2">佣金费率 (万2.5 = 0.00025)</div><div className="flex gap-2 mb-2 items-stretch"><div className="flex-1 bg-white rounded-lg flex items-center border border-gray-100"><input type="number" step="0.00001" value={settings.commissionRate} onChange={e => setSettings({ ...settings, commissionRate: parseFloat(e.target.value) })} className="flex-1 p-2 font-bold outline-none text-sm bg-transparent" /><div className="flex flex-col justify-center px-1 border-l border-gray-100"><button onClick={() => adjustCommission(0.00005)} className="text-[10px] h-4 leading-none text-gray-400 hover:text-blue-600">▲</button><button onClick={() => adjustCommission(-0.00005)} className="text-[10px] h-4 leading-none text-gray-400 hover:text-blue-600">▼</button></div></div><button onClick={() => setSettings({ ...settings, minFiveYuan: !settings.minFiveYuan })} className={`px-3 rounded-lg text-xs font-bold border transition-colors flex items-center ${settings.minFiveYuan ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-400 border-gray-200'}`}>5元起</button></div></div>
                  <div className="grid grid-cols-2 gap-3"><div className="bg-gray-50 p-3 rounded-2xl"><div className="text-xs font-bold text-gray-500 mb-1">印花税 (卖)</div><div className="bg-white rounded-lg flex items-center border border-gray-100"><input type="number" step="0.0001" value={settings.stampDutyRate} onChange={e => setSettings({ ...settings, stampDutyRate: parseFloat(e.target.value) })} className="w-full p-2 font-bold outline-none text-sm bg-transparent" /><div className="flex flex-col justify-center px-1 border-l border-gray-100"><button onClick={() => adjustStampDuty(0.0001)} className="text-[10px] h-4 leading-none text-gray-400 hover:text-blue-600">▲</button><button onClick={() => adjustStampDuty(-0.0001)} className="text-[10px] h-4 leading-none text-gray-400 hover:text-blue-600">▼</button></div></div></div><div className="bg-gray-50 p-3 rounded-2xl"><div className="text-xs font-bold text-gray-500 mb-1">过户费</div><div className="bg-white rounded-lg flex items-center border border-gray-100"><input type="number" step="0.00001" value={settings.transferFeeRate} onChange={e => setSettings({ ...settings, transferFeeRate: parseFloat(e.target.value) })} className="w-full p-2 font-bold outline-none text-sm bg-transparent" /><div className="flex flex-col justify-center px-1 border-l border-gray-100"><button onClick={() => adjustTransferFee(0.00001)} className="text-[10px] h-4 leading-none text-gray-400 hover:text-blue-600">▲</button><button onClick={() => adjustTransferFee(-0.00001)} className="text-[10px] h-4 leading-none text-gray-400 hover:text-blue-600">▼</button></div></div></div></div>
                  <div className="pt-2 flex gap-2"><button onClick={handleExport} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold flex items-center justify-center gap-2 text-sm"><Download size={14} /> 备份数据</button><button onClick={() => fileInputRef.current?.click()} className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold flex items-center justify-center gap-2 text-sm"><Upload size={14} /> 恢复数据</button><input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (ev) => { try { const d = JSON.parse(ev.target?.result as string); if (d.transactions) { setTransactions(d.transactions); setStocks(d.stocks); if (d.settings) setSettings(d.settings); alert('恢复成功'); setShowSettings(false); } } catch (err) { alert('文件格式错误'); } }; reader.readAsText(file); } }} /></div>
               </div>
            </div>
         )}
         {showAddStock && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
               <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4 animate-scale non-draggable modal-content">
                  <h3 className="text-lg font-bold">添加股票</h3>
                  <input className="w-full bg-gray-50 p-3 rounded-xl font-bold outline-none" placeholder="名称" value={newStockName} onChange={e => setNewStockName(e.target.value)} />
                  <input className="w-full bg-gray-50 p-3 rounded-xl font-bold outline-none font-mono" placeholder="代码" value={newStockCode} onChange={e => setNewStockCode(e.target.value)} />
                  <div className="flex gap-2">
                     <button onClick={() => setShowAddStock(false)} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-500">取消</button>
                     <button onClick={() => { if (newStockName && newStockCode) { const newStock = { id: generateId(), name: newStockName, code: newStockCode }; setStocks([...stocks, newStock]); setSelectedStockId(newStock.id); setShowAddStock(false); setNewStockName(''); setNewStockCode(''); } }} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold">确认</button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
}