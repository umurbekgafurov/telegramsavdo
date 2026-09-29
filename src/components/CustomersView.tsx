import React, { useState } from 'react';
import {
  Users,
  Search,
  Filter,
  Flame,
  Phone,
  MessageSquare,
  Sparkles,
  ShoppingBag,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Send
} from 'lucide-react';
import { Customer, CustomerStatus, Order } from '../types';
import { generateAdminDraft } from '../services/aiService';

interface CustomersViewProps {
  customers: Customer[];
  orders: Order[];
  onSaveCustomer: (customer: Customer) => Promise<void>;
  onOpenCustomerProfile?: (customer: Customer) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  orders,
  onSaveCustomer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Draft follow up
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [draftSent, setDraftSent] = useState(false);

  const statuses: (CustomerStatus | 'All')[] = [
    'All',
    'Yangi',
    'Faol',
    'Qiziqmoqda',
    'Buyurtma berdi',
    'Sotib oldi',
    'Yo\'qotilgan'
  ];

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.lastName && c.lastName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.telegramUsername && c.telegramUsername.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.phone && c.phone.includes(searchQuery));
    const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenProfile = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDraftSent(false);
  };

  const handleGenerateAIDraft = async () => {
    if (!selectedCustomer) return;
    setIsDrafting(true);
    try {
      const draft = await generateAdminDraft(
        selectedCustomer.firstName,
        selectedCustomer.notes || 'Smartfonlar haqida qiziqqan',
        'Telefon Market & Gadgets'
      );
      setDraftMessage(draft);
    } finally {
      setIsDrafting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Mijozlar Bazasi (CRM)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Telegram orqali murojaat qilgan barcha mijozlar, AI lead ballari va xaridlar tarixi
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Ism, Telegram username yoki telefon..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
          {statuses.map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                statusFilter === st
                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                  : 'text-slate-600 hover:bg-slate-50 border border-transparent'
              }`}
            >
              {st === 'All' ? 'Barchasi' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Customers List & Selected Profile Side-by-side or Modal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List (2 cols on large screen) */}
        <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden ${selectedCustomer ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400 uppercase font-semibold">
                  <th className="py-3.5 pl-4">Mijoz</th>
                  <th className="py-3.5">Telefon</th>
                  <th className="py-3.5">AI Lead Ball</th>
                  <th className="py-3.5">Holat</th>
                  <th className="py-3.5">Teglar</th>
                  <th className="py-3.5">Xaridlar</th>
                  <th className="py-3.5 pr-4 text-right">Profil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => {
                  const isHot = (cust.leadScore || 0) >= 80;
                  return (
                    <tr
                      key={cust.id}
                      onClick={() => handleOpenProfile(cust)}
                      className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                        selectedCustomer?.id === cust.id ? 'bg-sky-50/50' : ''
                      }`}
                    >
                      <td className="py-3.5 pl-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                            {cust.firstName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{cust.firstName} {cust.lastName || ''}</div>
                            <div className="text-[11px] text-sky-600 font-medium">
                              @{cust.telegramUsername || 'telegram_user'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 text-slate-600 font-medium">{cust.phone || '-'}</td>
                      <td className="py-3.5">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`font-bold flex items-center gap-1 ${
                              isHot ? 'text-amber-600' : 'text-slate-700'
                            }`}
                          >
                            {isHot && <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                            {cust.leadScore}/100
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5">
                        <span
                          className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                            cust.status === 'Sotib oldi'
                              ? 'bg-emerald-50 text-emerald-700'
                              : cust.status === 'Buyurtma berdi'
                              ? 'bg-sky-50 text-sky-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {cust.status}
                        </span>
                      </td>
                      <td className="py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {(cust.tags || []).map((t) => (
                            <span
                              key={t}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                t === 'Issiq lead'
                                  ? 'bg-rose-50 text-rose-700'
                                  : t === 'VIP'
                                  ? 'bg-purple-50 text-purple-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 font-bold text-slate-900">
                        {cust.totalSpent > 0 ? `${cust.totalSpent.toLocaleString()} so'm` : '-'}
                      </td>
                      <td className="py-3.5 pr-4 text-right">
                        <span className="text-sky-600 font-semibold flex items-center justify-end gap-1">
                          Ko'rish <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* CUSTOMER PROFILE CARD (Section 15 of Brief) */}
        {selectedCustomer && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Mijoz Profili</h3>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold"
              >
                Yopish ✕
              </button>
            </div>

            {/* Top Identity */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white font-bold text-base flex items-center justify-center">
                {selectedCustomer.firstName.charAt(0)}
              </div>
              <div>
                <div className="font-bold text-slate-900 text-base">
                  {selectedCustomer.firstName} {selectedCustomer.lastName || ''}
                </div>
                <div className="text-xs text-sky-600">@{selectedCustomer.telegramUsername || 'username'}</div>
                <div className="text-xs text-slate-500 mt-0.5">{selectedCustomer.phone || 'Telefon kiritilmagan'}</div>
              </div>
            </div>

            {/* Score & Status */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                <div className="text-[10px] text-amber-700 uppercase font-semibold">AI Lead Ball</div>
                <div className="text-lg font-bold text-amber-900 flex items-center justify-center gap-1 mt-0.5">
                  <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
                  {selectedCustomer.leadScore || 50}/100
                </div>
                <span className="text-[10px] font-semibold text-amber-700">Issiq lead</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Jami Buyurtmalar</div>
                <div className="text-lg font-bold text-slate-900 mt-0.5">
                  {selectedCustomer.totalOrders} ta
                </div>
                <span className="text-[10px] font-semibold text-emerald-600">
                  {selectedCustomer.totalSpent.toLocaleString()} so'm
                </span>
              </div>
            </div>

            {/* AI Summary Section (Brief Section 15 Requirement) */}
            <div className="p-3.5 bg-indigo-50/70 rounded-xl border border-indigo-100/80 text-xs">
              <div className="font-bold text-indigo-950 flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                AI Xulosa (Conversation Summary)
              </div>
              <p className="text-indigo-900/90 leading-relaxed">
                {selectedCustomer.aiSummary ||
                  'Mijoz flagman smartfonlar narxi bilan qiziqdi. Hozirda administrator taklifi kutilmoqda.'}
              </p>
            </div>

            {/* Interested Products */}
            <div className="text-xs space-y-1">
              <span className="font-semibold text-slate-700 block">Qiziqqan mahsulotlari:</span>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/70 text-slate-800 font-medium">
                📱 {selectedCustomer.notes || 'Samsung Galaxy S25 Ultra, iPhone 15 Pro'}
              </div>
            </div>

            {/* AI Follow-up action */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <button
                onClick={handleGenerateAIDraft}
                className="w-full py-2.5 px-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI Javob yoki Taklif Yozsin
              </button>

              {draftMessage && (
                <div className="space-y-2 text-xs">
                  <textarea
                    rows={4}
                    value={draftMessage}
                    onChange={(e) => setDraftMessage(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                  />
                  <button
                    onClick={() => {
                      setDraftSent(true);
                      setTimeout(() => setDraftSent(false), 2000);
                    }}
                    className="w-full py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Telegram orqali yuborish
                  </button>
                  {draftSent && (
                    <div className="text-center text-emerald-600 font-semibold text-xs flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Yuborildi!
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
