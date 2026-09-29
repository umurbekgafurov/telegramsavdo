import React, { useState } from 'react';
import {
  ShoppingBag,
  Search,
  Filter,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  ChevronRight,
  Eye,
  Plus
} from 'lucide-react';
import { Order, OrderStatus, PaymentStatus, Product, Customer } from '../types';

interface OrdersViewProps {
  orders: Order[];
  products: Product[];
  customers: Customer[];
  onUpdateStatus: (orderId: string, status: OrderStatus, paymentStatus?: PaymentStatus) => Promise<void>;
  onCreateOrder?: (order: Order) => Promise<void>;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  products,
  customers,
  onUpdateStatus,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  const statuses: (OrderStatus | 'All')[] = [
    'All',
    'Yangi',
    'Tasdiqlandi',
    'Tayyorlanmoqda',
    'Yetkazilmoqda',
    'Yetkazildi',
    'Bekor qilindi'
  ];

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerName && o.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (o.customerPhone && o.customerPhone.includes(searchQuery));
    const matchesStatus = selectedStatus === 'All' || o.orderStatus === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Buyurtmalar Ro'yxati</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Telegram bot orqali rasmiylashtirilgan to'liq xaridlar va yetkazib berish holati
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buyurtma ID yoki mijoz..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
          {statuses.map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStatus(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                selectedStatus === st
                  ? 'bg-sky-50 text-sky-700 border border-sky-200'
                  : 'text-slate-600 hover:bg-slate-50 border border-transparent'
              }`}
            >
              {st === 'All' ? 'Barchasi' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-400 uppercase font-semibold">
                <th className="py-3.5 pl-4">ID</th>
                <th className="py-3.5">Mijoz</th>
                <th className="py-3.5">Mahsulotlar</th>
                <th className="py-3.5">Manzil</th>
                <th className="py-3.5">Jami Summa</th>
                <th className="py-3.5">To'lov</th>
                <th className="py-3.5">Buyurtma Holati</th>
                <th className="py-3.5 pr-4 text-right">Amal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((ord) => (
                <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 pl-4 font-mono font-bold text-slate-800">#{ord.id}</td>
                  <td className="py-3.5">
                    <div className="font-bold text-slate-900">{ord.customerName}</div>
                    <div className="text-slate-400 text-[11px]">{ord.customerPhone}</div>
                  </td>
                  <td className="py-3.5 max-w-[200px] truncate font-medium text-slate-700">
                    {ord.items.map((i) => `${i.productName} (${i.quantity}x)`).join(', ')}
                  </td>
                  <td className="py-3.5 max-w-[180px] truncate text-slate-500 font-medium">
                    {ord.deliveryAddress || 'Do\'kondan olib ketish'}
                  </td>
                  <td className="py-3.5 font-bold text-slate-900">
                    {ord.total.toLocaleString()} so'm
                  </td>
                  <td className="py-3.5">
                    <span
                      className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                        ord.paymentStatus === "To'landi"
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {ord.paymentStatus}
                    </span>
                  </td>
                  <td className="py-3.5">
                    <span
                      className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                        ord.orderStatus === 'Yetkazildi'
                          ? 'bg-emerald-50 text-emerald-700'
                          : ord.orderStatus === 'Yetkazilmoqda'
                          ? 'bg-sky-50 text-sky-700'
                          : ord.orderStatus === 'Bekor qilindi'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-indigo-50 text-indigo-700'
                      }`}
                    >
                      {ord.orderStatus}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4 text-right">
                    <button
                      onClick={() => setActiveOrder(ord)}
                      className="px-2.5 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-all"
                    >
                      Batafsil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Modal */}
      {activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Buyurtma #{activeOrder.id}</h3>
                <span className="text-xs text-slate-400">
                  {new Date(activeOrder.createdAt).toLocaleString('uz-UZ')}
                </span>
              </div>
              <button onClick={() => setActiveOrder(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="my-4 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <div><strong>Mijoz:</strong> {activeOrder.customerName}</div>
                <div><strong>Telefon:</strong> {activeOrder.customerPhone}</div>
                <div><strong>Manzil:</strong> {activeOrder.deliveryAddress}</div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-2">Tarkibi:</h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {activeOrder.items.map((i, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between bg-white">
                      <div>
                        <div className="font-semibold text-slate-800">{i.productName}</div>
                        <div className="text-[11px] text-slate-400">
                          {i.quantity} x {i.unitPrice.toLocaleString()} so'm
                        </div>
                      </div>
                      <div className="font-bold text-slate-900">
                        {i.totalPrice.toLocaleString()} so'm
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Mahsulotlar:</span>
                  <span>{activeOrder.subtotal.toLocaleString()} so'm</span>
                </div>
                <div className="flex justify-between">
                  <span>Yetkazib berish:</span>
                  <span>{(activeOrder.deliveryFee || activeOrder.deliveryPrice || 0).toLocaleString()} so'm</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 text-sm pt-1 border-t border-slate-200">
                  <span>Jami:</span>
                  <span>{activeOrder.total.toLocaleString()} so'm</span>
                </div>
              </div>

              {/* Status change actions */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-slate-700">Holatni o'zgartirish:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      onUpdateStatus(activeOrder.id, 'Yetkazilmoqda');
                      setActiveOrder({ ...activeOrder, orderStatus: 'Yetkazilmoqda' });
                    }}
                    className="p-2 text-xs font-semibold rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200"
                  >
                    Yetkazilmoqda
                  </button>
                  <button
                    onClick={() => {
                      onUpdateStatus(activeOrder.id, 'Yetkazildi', "To'landi");
                      setActiveOrder({ ...activeOrder, orderStatus: 'Yetkazildi', paymentStatus: "To'landi" });
                    }}
                    className="p-2 text-xs font-semibold rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                  >
                    Yetkazildi va To'landi
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setActiveOrder(null)}
                className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl text-xs"
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
