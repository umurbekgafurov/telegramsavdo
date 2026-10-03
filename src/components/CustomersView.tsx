import React, { useState, useMemo } from 'react';
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
  Send,
  Volume2
} from 'lucide-react';
import { Customer, CustomerStatus, Order } from '../types';
import { generateAdminDraft, generateCampaignDraft } from '../services/aiService';
import { CustomerSegmentType, CUSTOMER_SEGMENT_LABELS, ALL_CUSTOMER_SEGMENT_TYPES } from '../types/customerSegmentation';
import { CustomerSegmentationService } from '../services/customerSegmentationService';

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
  const [selectedSegment, setSelectedSegment] = useState<string>('All');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Draft follow up
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [draftSent, setDraftSent] = useState(false);

  // M9.4 Campaign States
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [campaignTheme, setCampaignTheme] = useState('');
  const [campaignDraft, setCampaignDraft] = useState('');
  const [isGeneratingCampaign, setIsGeneratingCampaign] = useState(false);
  const [isSendingCampaign, setIsSendingCampaign] = useState(false);
  const [campaignSendResult, setCampaignSendResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const statuses: (CustomerStatus | 'All')[] = [
    'All',
    'Yangi',
    'Faol',
    'Qiziqmoqda',
    'Buyurtma berdi',
    'Sotib oldi',
    'Yo\'qotilgan'
  ];

  // Dynamically map each customer to their calculated segment and evaluate counts (M9.4)
  const segmentedCustomers = useMemo(() => {
    return customers.map((cust) => {
      const customerOrders = orders.filter((o) => o.customerId === cust.id);
      const completedOrders = customerOrders.filter((o) => o.orderStatus === 'Yetkazildi' || o.status === 'completed').length;
      const cancelledOrders = customerOrders.filter((o) => o.orderStatus === 'Bekor qilindi' || o.status === 'cancelled').length;
      const totalSpent = cust.totalSpent || customerOrders.reduce((sum, o) => sum + (o.total || 0), 0);

      const segmentResult = CustomerSegmentationService.segmentCustomer({
        customerId: cust.id,
        businessId: cust.businessId,
        signals: {
          customerId: cust.id,
          businessId: cust.businessId,
          completedOrders,
          cancelledOrders,
          totalSpent,
          totalOrders: customerOrders.length,
          hasActiveOrder: customerOrders.some((o) => o.orderStatus !== 'Yetkazildi' && o.orderStatus !== 'Bekor qilindi'),
        },
        insight: {
          customerId: cust.id,
          businessId: cust.businessId,
          intentScore: cust.leadScore || 50,
          completedOrders,
          cancelledOrders,
          totalSpent,
          totalOrders: customerOrders.length,
        },
      });

      return {
        ...cust,
        segment: segmentResult.segment,
        segmentLabel: CUSTOMER_SEGMENT_LABELS[segmentResult.segment],
      };
    });
  }, [customers, orders]);

  // Calculate cohort counts
  const cohortCounts = useMemo(() => {
    const counts: Record<string, number> = { All: segmentedCustomers.length };
    ALL_CUSTOMER_SEGMENT_TYPES.forEach((seg) => {
      counts[seg] = segmentedCustomers.filter((c) => c.segment === seg).length;
    });
    return counts;
  }, [segmentedCustomers]);

  const filteredCustomers = segmentedCustomers.filter((c) => {
    const matchesSearch =
      c.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.lastName && c.lastName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.telegramUsername && c.telegramUsername.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.phone && c.phone.includes(searchQuery));
    const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
    const matchesSegment = selectedSegment === 'All' || c.segment === selectedSegment;
    return matchesSearch && matchesStatus && matchesSegment;
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

  const handleGenerateCampaignDraft = async () => {
    setIsGeneratingCampaign(true);
    setCampaignSendResult(null);
    try {
      const segmentLabel = CUSTOMER_SEGMENT_LABELS[selectedSegment as CustomerSegmentType] || selectedSegment;
      const draft = await generateCampaignDraft(
        segmentLabel,
        'Smartfonlar & Gadgetlar Do\'koni',
        campaignTheme
      );
      setCampaignDraft(draft);
    } catch (err: any) {
      console.error('[Campaign Draft Gen Error]', err);
    } finally {
      setIsGeneratingCampaign(false);
    }
  };

  const handleSendCampaign = async () => {
    if (!campaignDraft.trim() || isSendingCampaign) return;
    setIsSendingCampaign(true);
    setCampaignSendResult(null);

    // Get all matching customers in this segment with a Telegram chat ID
    const targetAudience = filteredCustomers.filter((c) => c.telegramChatId);

    if (targetAudience.length === 0) {
      setCampaignSendResult({
        success: false,
        message: 'Aksiya yuborish uchun faol Telegram Chat ID ga ega mijozlar topilmadi.',
      });
      setIsSendingCampaign(false);
      return;
    }

    let successCount = 0;
    let failedCount = 0;

    for (const cust of targetAudience) {
      if (!cust.telegramChatId) continue;
      try {
        const res = await fetch('/api/telegram/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId: cust.telegramChatId,
            text: campaignDraft.trim(),
          }),
        });
        const data = await res.json();
        if (data.ok) {
          successCount++;
        } else {
          failedCount++;
        }
      } catch (err) {
        console.error('[Campaign Dispatch Single Fail]', err);
        failedCount++;
      }
    }

    setCampaignSendResult({
      success: successCount > 0,
      message: `Aksiya yakunlandi. Muvaffaqiyatli: ${successCount} ta, Xatolik: ${failedCount} ta. ✅`,
    });
    setIsSendingCampaign(false);
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

        {selectedSegment !== 'All' && cohortCounts[selectedSegment] > 0 && (
          <button
            onClick={() => {
              setCampaignDraft('');
              setCampaignSendResult(null);
              setIsCampaignModalOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Volume2 className="w-4 h-4 animate-bounce" />
            <span>Mijozlar guruhiga aksiya yuborish</span>
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        {/* Search & Status Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Ism, Telegram username yoki telefon..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-2">Holat:</span>
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

        {/* Cohort Segments Filters (M9.4) */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mijozlar Segmenti (AI Cohorts):</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedSegment('All')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                selectedSegment === 'All'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-50 border border-slate-100 bg-slate-50/50'
              }`}
            >
              Barcha segmentlar ({cohortCounts.All})
            </button>
            {ALL_CUSTOMER_SEGMENT_TYPES.map((seg) => {
              const label = CUSTOMER_SEGMENT_LABELS[seg];
              const count = cohortCounts[seg] ?? 0;
              return (
                <button
                  key={seg}
                  onClick={() => setSelectedSegment(seg)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                    selectedSegment === seg
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 border border-slate-100 bg-slate-50/50'
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Customers List & Selected Profile Side-by-side or Modal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List (2 cols on large screen) */}
        <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden ${selectedCustomer ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {filteredCustomers.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs font-medium space-y-2">
              <Users className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
              <div>Tanlangan filtr bo'yicha mijozlar topilmadi.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400 uppercase font-semibold">
                    <th className="py-3.5 pl-4">Mijoz</th>
                    <th className="py-3.5">Telefon</th>
                    <th className="py-3.5">AI Lead Ball</th>
                    <th className="py-3.5">Segment</th>
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
                          className={`inline-flex px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${
                            cust.segment === 'repeat_customer'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : cust.segment === 'high_intent'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                              : cust.segment === 'inactive_customer'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : cust.segment === 'cancelled_customer'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {cust.segmentLabel}
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
          )}
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

      {/* Campaign Compose Modal (M9.4) */}
      {isCampaignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl border border-slate-200/80 space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm tracking-tight">Kompaniya qoralamasi (Aksiya)</h3>
              </div>
              <button
                onClick={() => setIsCampaignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold p-1 hover:bg-slate-50 rounded-xl"
              >
                Yopish ✕
              </button>
            </div>

            {/* Target Cohort & Audience Details */}
            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-xs text-slate-700">
              <div>
                <strong>Maqsadli guruh (Segment):</strong>{' '}
                <span className="font-bold text-indigo-700">
                  {CUSTOMER_SEGMENT_LABELS[selectedSegment as CustomerSegmentType] || selectedSegment}
                </span>
              </div>
              <div>
                <strong>Qabul qiluvchilar soni:</strong>{' '}
                <span className="font-bold text-slate-900">
                  {filteredCustomers.filter((c) => c.telegramChatId).length} ta faol Telegram foydalanuvchisi
                </span>
              </div>
            </div>

            {/* Campaign Custom Theme Input */}
            <div className="space-y-1 text-xs">
              <label className="block font-semibold text-slate-700">Maxsus mavzu yoki kalit so'zlar (Ixtiyoriy):</label>
              <input
                type="text"
                placeholder="Masalan: Yangi yil chegirmalari, Bepul yetkazish"
                value={campaignTheme}
                onChange={(e) => setCampaignTheme(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              />
            </div>

            {/* AI Generator Trigger */}
            <div className="space-y-2">
              <button
                type="button"
                disabled={isGeneratingCampaign}
                onClick={handleGenerateCampaignDraft}
                className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-100 transition-all flex items-center justify-center gap-1.5"
              >
                {isGeneratingCampaign ? (
                  <div className="w-3.5 h-3.5 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                )}
                <span>AI orqali qoralama yozish</span>
              </button>
            </div>

            {/* Draft Copy Textarea */}
            <div className="space-y-1 text-xs">
              <label className="block font-semibold text-slate-700">Yuboriladigan xabar matni:</label>
              <textarea
                rows={6}
                value={campaignDraft}
                onChange={(e) => setCampaignDraft(e.target.value)}
                placeholder="Bu yerga aksiya matnini yozing yoki AI orqali qoralama yarating..."
                className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed font-sans"
              />
            </div>

            {/* Action Feedback Alerts */}
            {campaignSendResult && (
              <div className={`p-4 rounded-xl border text-xs font-semibold flex items-start gap-2.5 ${
                campaignSendResult.success
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                  : 'bg-rose-50 border-rose-100 text-rose-900'
              }`}>
                <div>
                  {campaignSendResult.success ? '✓' : '!'}
                </div>
                <div>{campaignSendResult.message}</div>
              </div>
            )}

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button
                type="button"
                disabled={isSendingCampaign}
                onClick={() => setIsCampaignModalOpen(false)}
                className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-50 border border-slate-100 rounded-xl"
              >
                Bekor qilish
              </button>

              <button
                type="button"
                disabled={isSendingCampaign || !campaignDraft.trim()}
                onClick={handleSendCampaign}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
              >
                {isSendingCampaign ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>Tasdiqlash va guruhga yuborish</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
