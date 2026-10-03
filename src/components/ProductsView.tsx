import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Plus,
  Sparkles,
  Search,
  UploadCloud,
  FileSpreadsheet,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Package,
  Layers,
  Camera,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Settings
} from 'lucide-react';
import { Product, Warehouse, StockMovement } from '../types';
import { parseProductFromText } from '../services/aiService';
import { FirestoreService } from '../services/firebaseService';

interface ProductsViewProps {
  products: Product[];
  warehouses: Warehouse[];
  onSaveProduct: (product: Product) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  businessId?: string;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  warehouses,
  onSaveProduct,
  onDeleteProduct,
  businessId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // M10.4 Stock Ledger and Low Stock Alert states
  const [activeView, setActiveView] = useState<'catalog' | 'ledger'>('catalog');
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<'All' | 'STOCK_IN' | 'STOCK_OUT'>('All');
  const [ledgerSearch, setLedgerSearch] = useState('');

  // Manual Stock Adjustment popup form state
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustType, setAdjustType] = useState<'STOCK_IN' | 'STOCK_OUT'>('STOCK_IN');
  const [adjustQuantity, setAdjustQuantity] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  const loadLedger = async () => {
    setLoadingMovements(true);
    try {
      const bizId = businessId || 'biz-default';
      const list = await FirestoreService.getStockMovements(bizId);
      setMovements(list);
    } catch (err) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLoadingMovements(false);
    }
  };

  const handleConfirmAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustProductId) {
      setAdjustError('Mahsulotni tanlang');
      return;
    }
    if (adjustQuantity <= 0) {
      setAdjustError('Miqdor 1 dan kam bo\'lmasligi lozim');
      return;
    }

    const selectedProd = products.find(p => p.id === adjustProductId);
    if (!selectedProd) {
      setAdjustError('Mahsulot topilmadi');
      return;
    }

    if (adjustType === 'STOCK_OUT' && adjustQuantity > selectedProd.stock) {
      setAdjustError(`Omborda yetarli qoldiq mavjud emas! Maksimal chiqim miqdori: ${selectedProd.stock} dona.`);
      return;
    }

    setAdjustSubmitting(true);
    setAdjustError(null);

    try {
      const delta = adjustType === 'STOCK_IN' ? adjustQuantity : -adjustQuantity;
      const bizId = businessId || 'biz-default';
      await FirestoreService.addStockMovement(bizId, {
        warehouseId: selectedProd.warehouseId || warehouses[0]?.id || 'wh-main',
        productId: adjustProductId,
        productName: selectedProd.name,
        type: adjustType,
        quantity: delta,
        reason: adjustReason.trim() || (adjustType === 'STOCK_IN' ? 'Qo\'shimcha kirim' : 'Chiqim / Kamayish'),
        createdBy: 'Admin',
      });

      setIsAdjustmentModalOpen(false);
      setAdjustProductId('');
      setAdjustQuantity(1);
      setAdjustReason('');

      await loadLedger();
      await onSaveProduct({
        ...selectedProd,
        stock: selectedProd.stock + delta,
        updatedAt: Date.now()
      });
    } catch (err: any) {
      console.error('[Adjustment Submit Error]', err);
      setAdjustError(err.message || 'Kirim-chiqimni yozishda xatolik yuz berdi.');
    } finally {
      setAdjustSubmitting(false);
    }
  };
  
  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAIAddModalOpen, setIsAIAddModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  // AI Text input state
  const [aiInputText, setAiInputText] = useState('Redmi Note 14 Pro 8/256, 3 200 000 so\'m, 5 dona');
  const [aiParsing, setAiParsing] = useState(false);
  const [aiExtractedProduct, setAiExtractedProduct] = useState<any | null>(null);

  // Manual Form State
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    sku: '',
    category: 'Telefonlar',
    brand: '',
    model: '',
    price: 0,
    costPrice: 0,
    stock: 1,
    lowStockThreshold: 2,
    warehouseId: warehouses[0]?.id || 'wh-main',
    description: '',
    active: true,
  });

  const categories = ['All', 'Telefonlar', 'Noutbuklar', 'Aksessuarlar', 'Smart soatlar'];

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brand.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const handleAIParse = async () => {
    if (!aiInputText.trim()) return;
    setAiParsing(true);
    try {
      const extracted = await parseProductFromText(aiInputText);
      setAiExtractedProduct(extracted);
    } finally {
      setAiParsing(false);
    }
  };

  const handleConfirmAIProduct = async () => {
    if (!aiExtractedProduct) return;
    const newProd: Product = {
      id: `prod-${Date.now()}`,
      businessId: 'biz-default',
      warehouseId: warehouses[0]?.id || 'wh-main',
      name: aiExtractedProduct.name,
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      category: aiExtractedProduct.category || 'Telefonlar',
      brand: aiExtractedProduct.brand || 'Boshqa',
      model: aiExtractedProduct.model || aiExtractedProduct.name,
      price: aiExtractedProduct.price,
      costPrice: aiExtractedProduct.costPrice || Math.round(aiExtractedProduct.price * 0.85),
      stock: aiExtractedProduct.quantity,
      lowStockThreshold: 2,
      photos: ['https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=600&q=80'],
      variants: aiExtractedProduct.variant
        ? [{ id: 'v-1', name: aiExtractedProduct.variant, price: aiExtractedProduct.price, stock: aiExtractedProduct.quantity }]
        : [],
      attributes: {},
      description: 'AI orqali matndan qo\'shilgan mahsulot.',
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await onSaveProduct(newProd);
    setIsAIAddModalOpen(false);
    setAiExtractedProduct(null);
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.price) return;
    const prod: Product = {
      id: formData.id || `prod-${Date.now()}`,
      businessId: 'biz-default',
      warehouseId: formData.warehouseId || warehouses[0]?.id || 'wh-main',
      name: formData.name,
      sku: formData.sku || `SKU-${Date.now().toString().slice(-6)}`,
      category: formData.category || 'Telefonlar',
      brand: formData.brand || 'Brend',
      model: formData.model || formData.name,
      price: Number(formData.price),
      costPrice: Number(formData.costPrice || 0),
      stock: Number(formData.stock || 0),
      lowStockThreshold: Number(formData.lowStockThreshold || 2),
      photos: formData.photos || ['https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80'],
      variants: formData.variants || [],
      attributes: formData.attributes || {},
      description: formData.description || '',
      active: true,
      createdAt: formData.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    await onSaveProduct(prod);
    setIsAddModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* M10.4 View Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-5 rounded-2xl border border-slate-200/80 shadow-xs py-2 items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveView('catalog')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === 'catalog'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                : 'text-slate-500 hover:bg-slate-50 border border-transparent'
            }`}
          >
            <Boxes className="w-4 h-4" />
            Mahsulotlar Katalogi
          </button>
          <button
            onClick={() => {
              setActiveView('ledger');
              loadLedger();
            }}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              activeView === 'ledger'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                : 'text-slate-500 hover:bg-slate-50 border border-transparent'
            }`}
          >
            <History className="w-4 h-4" />
            Ombor Jurnali (Stock Ledger)
          </button>
        </div>

        {activeView === 'ledger' && (
          <button
            onClick={() => {
              setAdjustError(null);
              setIsAdjustmentModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Kirim / Chiqim qilish
          </button>
        )}
      </div>

      {activeView === 'catalog' ? (
        <>
          {/* Header with Title and Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Mahsulotlar Katalogi</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Do'koningiz tovarlari, narxlari va Telegram AI savdo agenti foydalanadigan ma'lumotlar bazasi
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick AI Add Button */}
          <button
            onClick={() => {
              setAiExtractedProduct(null);
              setIsAIAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 rounded-xl shadow-xs transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI orqali qo'shish
          </button>

          {/* Image Recognition Button */}
          <button
            onClick={() => setIsImageModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all"
          >
            <Camera className="w-3.5 h-3.5 text-indigo-500" />
            Rasm orqali
          </button>

          {/* Excel Import Button */}
          <button
            onClick={() => setIsExcelModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            Excel import
          </button>

          {/* Regular Add Button */}
          <button
            onClick={() => {
              setFormData({
                name: '',
                sku: `SKU-${Date.now().toString().slice(-6)}`,
                category: 'Telefonlar',
                price: 0,
                costPrice: 0,
                stock: 1,
                lowStockThreshold: 2,
                warehouseId: warehouses[0]?.id || 'wh-main',
              });
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            Yangi mahsulot
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Nomi, SKU yoki brend bo'yicha qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                  : 'text-slate-600 hover:bg-slate-50 border border-transparent'
              }`}
            >
              {cat === 'All' ? 'Barchasi' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400 uppercase font-semibold">
                <th className="py-3.5 pl-4">Mahsulot</th>
                <th className="py-3.5">SKU / Kategoriya</th>
                <th className="py-3.5">Ombor</th>
                <th className="py-3.5">Sotish Narxi</th>
                <th className="py-3.5">Tannarx</th>
                <th className="py-3.5">Qoldiq</th>
                <th className="py-3.5">Holati</th>
                <th className="py-3.5 pr-4 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((p) => {
                const wh = warehouses.find((w) => w.id === p.warehouseId);
                const isLow = p.stock <= p.lowStockThreshold;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 pl-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.imageUrl || (p.photos && p.photos[0]) || 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=100&q=80'}
                          alt={p.name}
                          className="w-10 h-10 object-cover rounded-xl border border-slate-200"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{p.name}</div>
                          {p.variants && p.variants.length > 0 && (
                            <div className="text-[11px] text-indigo-600 font-medium flex items-center gap-1 mt-0.5">
                              <Layers className="w-3 h-3" />
                              {p.variants.map((v) => v.name).join(' • ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5">
                      <div className="font-mono text-slate-700 font-semibold">{p.sku}</div>
                      <div className="text-slate-400 text-[11px]">{p.category}</div>
                    </td>
                    <td className="py-3.5 text-slate-600 font-medium">
                      {wh ? wh.name.split('(')[0] : 'Asosiy'}
                    </td>
                    <td className="py-3.5 font-bold text-slate-900">
                      {p.price.toLocaleString()} so'm
                    </td>
                    <td className="py-3.5 text-slate-500 font-medium">
                      {p.costPrice ? `${p.costPrice.toLocaleString()} so'm` : '-'}
                    </td>
                    <td className="py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 font-bold text-xs ${
                          isLow ? 'text-amber-600' : 'text-emerald-700'
                        }`}
                      >
                        <Package className="w-3.5 h-3.5" />
                        {p.stock} dona
                        {isLow && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-sm">
                            Kam
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3.5">
                      <span className="inline-flex px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-full">
                        Sotuvda
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setFormData(p);
                            setIsAddModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteProduct(p.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </>
      ) : (
        <div className="space-y-4">
          {/* Ledger Header & Stats Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                <History className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Jami harakatlar</div>
                <div className="text-xl font-bold text-slate-900">{movements.length} ta</div>
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Kirimlar (Inbound)</div>
                <div className="text-xl font-bold text-slate-900">
                  {movements.filter(m => m.type === 'STOCK_IN').length} ta
                </div>
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <ArrowDownLeft className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Chiqimlar (Outbound)</div>
                <div className="text-xl font-bold text-slate-900">
                  {movements.filter(m => m.type === 'STOCK_OUT').length} ta
                </div>
              </div>
            </div>
          </div>

          {/* Ledger Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Mahsulot nomi yoki sababi bo'yicha..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
              <button
                onClick={() => setLedgerFilter('All')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                  ledgerFilter === 'All'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                }`}
              >
                Barchasi
              </button>
              <button
                onClick={() => setLedgerFilter('STOCK_IN')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                  ledgerFilter === 'STOCK_IN'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                }`}
              >
                Faqat Kirim
              </button>
              <button
                onClick={() => setLedgerFilter('STOCK_OUT')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                  ledgerFilter === 'STOCK_OUT'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                }`}
              >
                Faqat Chiqim
              </button>
            </div>
          </div>

          {/* Movements Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {loadingMovements ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <span>Yuklanmoqda...</span>
              </div>
            ) : movements.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs font-medium space-y-2">
                <History className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
                <div>Harakatlar jurnali bo'sh. Birinchi kirim/chiqim amalini bajaring.</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400 uppercase font-semibold">
                      <th className="py-3.5 pl-4">Harakat Turi</th>
                      <th className="py-3.5">Mahsulot</th>
                      <th className="py-3.5">Miqdor (Dona)</th>
                      <th className="py-3.5">Sabab / Izoh</th>
                      <th className="py-3.5">Mas'ul</th>
                      <th className="py-3.5 pr-4 text-right">Sana</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements
                      .filter(m => {
                        const matchesSearch = (m.productName || '').toLowerCase().includes(ledgerSearch.toLowerCase()) || (m.reason || '').toLowerCase().includes(ledgerSearch.toLowerCase());
                        const matchesType = ledgerFilter === 'All' || m.type === ledgerFilter;
                        return matchesSearch && matchesType;
                      })
                      .map((m) => {
                        const isKirim = m.type === 'STOCK_IN';
                        return (
                          <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 pl-4">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                isKirim
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100 animate-pulse'
                                  : 'bg-amber-50 text-amber-700 border-amber-100'
                              }`}>
                                {isKirim ? (
                                  <>
                                    <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                                    Kirim (Inbound)
                                  </>
                                ) : (
                                  <>
                                    <ArrowDownLeft className="w-3 h-3 text-amber-600" />
                                    Chiqim (Outbound)
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="py-3.5 font-bold text-slate-900">{m.productName || 'Noma\'lum'}</td>
                            <td className="py-3.5 font-bold text-slate-700">{Math.abs(m.quantity)} dona</td>
                            <td className="py-3.5 text-slate-500 font-medium">{m.reason || '-'}</td>
                            <td className="py-3.5 text-slate-500 font-semibold">{m.createdBy || 'Tizim'}</td>
                            <td className="py-3.5 pr-4 text-right text-slate-400 font-medium">
                              {new Date(m.createdAt).toLocaleString('uz-UZ')}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI ADD PRODUCT MODAL (Section 8 of Brief) */}
      {isAIAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">AI Orqali Mahsulot Qo'shish</h3>
                  <p className="text-xs text-slate-500">Oddiy matn yozing, sun'iy intellekt ma'lumotlarni ajratadi</p>
                </div>
              </div>
              <button onClick={() => setIsAIAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="my-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mahsulot haqida ma'lumot (matn):
                </label>
                <textarea
                  rows={3}
                  value={aiInputText}
                  onChange={(e) => setAiInputText(e.target.value)}
                  placeholder="Masalan: Redmi Note 14 Pro 8/256, 3 200 000 so'm, 5 dona"
                  className="w-full p-3 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Misol: "Samsung Galaxy S25 Ultra 12/256, 14 900 000 so'm, 4 ta qoldiq"
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  disabled={aiParsing || !aiInputText.trim()}
                  onClick={handleAIParse}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {aiParsing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Tahlil qilinmoqda...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      AI ma'lumotlarni ajratsin
                    </>
                  )}
                </button>
              </div>

              {/* Confirmation screen: "AI aniqlagan ma'lumotlar" (Section 8 of Brief) */}
              {aiExtractedProduct && (
                <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                    AI aniqlagan ma'lumotlar:
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-white rounded-lg border border-indigo-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Mahsulot</span>
                      <span className="font-bold text-slate-800">{aiExtractedProduct.name}</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-indigo-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Variant</span>
                      <span className="font-bold text-slate-800">{aiExtractedProduct.variant || 'Standart'}</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-indigo-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Narxi</span>
                      <span className="font-bold text-slate-800">{Number(aiExtractedProduct.price).toLocaleString()} so'm</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-indigo-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Soni</span>
                      <span className="font-bold text-slate-800">{aiExtractedProduct.quantity} dona</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    ℹ️ AI noto'g'ri taxmin qilmasligi uchun ma'lumotlarni tasdiqlaganingizdan so'ng bazaga saqlanadi.
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={() => setAiExtractedProduct(null)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      Tahrirlash
                    </button>
                    <button
                      onClick={handleConfirmAIProduct}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                    >
                      Saqlash
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IMAGE INPUT MODAL (Section 9 of Brief) */}
      {isImageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Rasm Orqali Mahsulot Aniqlash</h3>
                  <p className="text-xs text-slate-500">Gemini Vision orqali qadoq yoki tovar fotosuratini tahlil qilish</p>
                </div>
              </div>
              <button onClick={() => setIsImageModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="my-4 space-y-4">
              <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-6 text-center transition-all bg-slate-50/50">
                <UploadCloud className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
                <div className="text-xs font-semibold text-slate-800">
                  Mahsulot rasmini yuklang yoki bu yerga tortib keling
                </div>
                <div className="text-[11px] text-slate-400 mt-1">PNG, JPG 5MB gacha qo'llab-quvvatlanadi</div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  AI mahsulotni quyidagicha aniqladi:
                </div>
                <div className="space-y-1 text-slate-700">
                  <div><strong>Mahsulot:</strong> Apple iPhone 15 Pro Max</div>
                  <div><strong>Brend:</strong> Apple</div>
                  <div><strong>Ko'rinadigan variant:</strong> 256GB Natural Titanium</div>
                  <div><strong>Kategoriya:</strong> Telefonlar</div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setIsImageModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={() => {
                    onSaveProduct({
                      id: `prod-${Date.now()}`,
                      businessId: 'biz-default',
                      warehouseId: warehouses[0]?.id || 'wh-main',
                      name: 'Apple iPhone 15 Pro Max',
                      sku: `IPH15PM-${Date.now().toString().slice(-4)}`,
                      category: 'Telefonlar',
                      brand: 'Apple',
                      model: 'iPhone 15 Pro Max',
                      price: 15800000,
                      costPrice: 14200000,
                      stock: 3,
                      lowStockThreshold: 2,
                      photos: ['https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=600&q=80'],
                      variants: [{ id: 'v1', name: '256GB / Natural Titanium', price: 15800000, stock: 3 }],
                      attributes: {},
                      description: 'Rasm orqali aniqlangan Apple flagman smartfoni',
                      active: true,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    });
                    setIsImageModalOpen(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
                >
                  Saqlash
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL IMPORT MODAL (Section 10 of Brief) */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Excel / CSV orqali import</h3>
                  <p className="text-xs text-slate-500">Mahsulotlarni ommaviy yuklash va yangilash</p>
                </div>
              </div>
              <button onClick={() => setIsExcelModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="my-4 space-y-4">
              <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs">
                <div className="font-bold text-emerald-950 text-sm mb-1">127 ta mahsulot aniqlandi</div>
                <div className="text-emerald-800 space-y-0.5">
                  <div>• 119 ta yangi mahsulot bazaga qo'shiladi</div>
                  <div>• 8 ta mavjud mahsulot qoldig'i yangilanadi</div>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <strong>Kerakli ustunlar:</strong> SKU, Product Name, Category, Variant, Price, Cost Price, Stock
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setIsExcelModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={() => {
                    setIsExcelModalOpen(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs"
                >
                  Import qilish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL ADD / EDIT MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">
                {formData.id ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot qo\'shish'}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <form onSubmit={handleManualSave} className="my-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mahsulot nomi *</label>
                <input
                  type="text"
                  required
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Masalan: Samsung Galaxy S25 Ultra"
                  className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">SKU Kodi</label>
                  <input
                    type="text"
                    value={formData.sku || ''}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kategoriya</label>
                  <select
                    value={formData.category || 'Telefonlar'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="Telefonlar">Telefonlar</option>
                    <option value="Noutbuklar">Noutbuklar</option>
                    <option value="Aksessuarlar">Aksessuarlar</option>
                    <option value="Smart soatlar">Smart soatlar</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sotish narxi (so'm) *</label>
                  <input
                    type="number"
                    required
                    value={formData.price || ''}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tannarxi (so'm)</label>
                  <input
                    type="number"
                    value={formData.costPrice || ''}
                    onChange={(e) => setFormData({ ...formData, costPrice: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Qoldiq soni *</label>
                  <input
                    type="number"
                    required
                    value={formData.stock !== undefined ? formData.stock : 1}
                    onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ombor</label>
                  <select
                    value={formData.warehouseId || warehouses[0]?.id}
                    onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs"
                >
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Stock Adjustment Modal (M10.4) */}
      {isAdjustmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <form onSubmit={handleConfirmAdjustment} className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl border border-slate-200/80 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm tracking-tight">Kirim / Chiqim Amali</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                ✕
              </button>
            </div>

            {adjustError && (
              <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-900 text-xs font-semibold rounded-xl">
                ⚠️ {adjustError}
              </div>
            )}

            {/* Product Selection */}
            <div className="space-y-1 text-xs">
              <label className="block font-semibold text-slate-700">Mahsulotni tanlang:</label>
              <select
                value={adjustProductId}
                onChange={(e) => {
                  setAdjustProductId(e.target.value);
                  setAdjustError(null);
                }}
                className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
                required
              >
                <option value="">-- Tanlang --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Qoldiq: {p.stock} dona)
                  </option>
                ))}
              </select>
            </div>

            {/* Movement Type */}
            <div className="space-y-1 text-xs">
              <label className="block font-semibold text-slate-700">Amal turi:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustType('STOCK_IN')}
                  className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                    adjustType === 'STOCK_IN'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  📥 Kirim (STOCK_IN)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('STOCK_OUT')}
                  className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                    adjustType === 'STOCK_OUT'
                      ? 'bg-amber-50 text-amber-700 border-amber-200 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  📤 Chiqim (STOCK_OUT)
                </button>
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-1 text-xs">
              <label className="block font-semibold text-slate-700">Miqdor (Dona):</label>
              <input
                type="number"
                min="1"
                value={adjustQuantity}
                onChange={(e) => {
                  setAdjustQuantity(Math.max(1, Number(e.target.value)));
                  setAdjustError(null);
                }}
                className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                required
              />
            </div>

            {/* Reason/Note */}
            <div className="space-y-1 text-xs">
              <label className="block font-semibold text-slate-700">Sabab / Izoh:</label>
              <textarea
                rows={3}
                placeholder="Masalan: Yangi partiya kirimi, Yaroqsiz tovar..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed font-sans"
              />
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button
                type="button"
                disabled={adjustSubmitting}
                onClick={() => setIsAdjustmentModalOpen(false)}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50 border border-slate-100 rounded-xl"
              >
                Bekor qilish
              </button>

              <button
                type="submit"
                disabled={adjustSubmitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                {adjustSubmitting ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span>Tasdiqlash</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
