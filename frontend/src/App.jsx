import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// Configurar Axios de forma global para interceptar todas las peticiones y añadir el API KEY
axios.interceptors.request.use(config => {
  config.headers['X-API-KEY'] = import.meta.env.VITE_API_SECRET_KEY || 'quant-admin-supersecret-token-777';
  return config;
});
import { Toaster, toast } from 'react-hot-toast';
import {
  Activity,
  LayoutDashboard,
  LineChart,
  History,
  Settings,
  Bell,
  Check,
  CheckCheck,
  X,
  Zap,
  ChevronRight,
  Clock,
  ArrowUpCircle,
  ArrowDownCircle,
  Users,
  Calendar,
  Newspaper,
  TrendingUp,
  TrendingDown,
  Trash2,
} from 'lucide-react';
import RiskSettingsForm from './components/RiskSettingsForm';
const DashboardTab = React.lazy(() => import('./components/DashboardTab'));
const MarketWatchTab = React.lazy(() => import('./components/MarketWatchTab'));
const HistoryTab = React.lazy(() => import('./components/HistoryTab'));
const AccountsTab = React.lazy(() => import('./components/AccountsTab'));
const EconomicCalendarTab = React.lazy(() => import('./components/EconomicCalendarTab'));
import MarketSessionTimer from './components/MarketSessionTimer';
// const RiskSettingsForm = React.lazy(() => import('./components/RiskSettingsForm')); // Mantener cargado por ser ligero
import API_BASE from './api';

// ─── Ítem individual de notificación ─────────────────────────────────────────
const NotificationItem = ({ notif, onRead, onDismiss, onSignalClick }) => {
  const isFractal = notif.type === 'fractal';
  const isBuy = notif.setup_type === 'BUY';

  const handleClick = () => {
    onRead(notif.id);
    if (isFractal) onSignalClick(notif);
  };

  return (
    <div
      className={`relative flex items-start gap-3 px-4 py-3 border-b border-slate-700/40 transition-colors group cursor-pointer
        ${notif.is_read ? 'opacity-60' : 'bg-slate-800/20 hover:bg-slate-700/25'}
      `}
      onClick={handleClick}
    >
      {/* Dot indicador de no leído */}
      {!notif.is_read && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-brand-accent" />
      )}

      {/* Icono de tipo */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5
        ${isFractal
          ? (isBuy ? 'bg-emerald-500/15 border border-emerald-500/25' : 'bg-rose-500/15 border border-rose-500/25')
          : 'bg-amber-500/15 border border-amber-500/25'
        }`}
      >
        {isFractal
          ? (isBuy ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />)
          : <Newspaper className="w-4 h-4 text-amber-400" />
        }
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        {isFractal ? (
          <>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded
                ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {notif.setup_type}
              </span>
              <span className="text-sm font-black text-white">{notif.symbol}</span>
              {notif.matched_tfs?.length > 0 && (
                <span className="text-[9px] text-brand-accent font-bold">{notif.matched_tfs.length} TF</span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Precio: <span className="text-white font-bold">{parseFloat(notif.entry_price || 0).toFixed(5)}</span>
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded
                ${notif.sentiment === 'BULL' ? 'bg-emerald-500/20 text-emerald-400'
                  : notif.sentiment === 'BEAR' ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-amber-500/20 text-amber-400'}`}>
                {notif.impact}
              </span>
              <span className="text-[11px] font-bold text-slate-300 truncate">{notif.country}</span>
            </div>
            <p className="text-[11px] text-white font-medium leading-tight truncate">{notif.title}</p>
            {(notif.actual || notif.forecast) && (
              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                {notif.actual && <span>Real: <span className="text-white">{notif.actual}</span></span>}
                {notif.forecast && <span className="ml-2">Est: {notif.forecast}</span>}
              </p>
            )}
          </>
        )}
      </div>

      {/* Timestamp + dismiss */}
      <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
        <span className="text-[9px] text-slate-600 font-mono">
          {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(notif.id, notif.type); }}
          className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-300 transition-all"
          title="Descartar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// ─── Centro de notificaciones unificado ──────────────────────────────────────
const FILTER_LABELS = { all: 'Todas', unread: 'Sin leer', fractal: 'Fractales', macro: 'Macro' };

const NotificationCenter = ({ notifications, onMarkAllRead, onMarkRead, onDismiss, onClearAll, onSignalClick }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const dropdownRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read;
    if (filter === 'fractal') return n.type === 'fractal';
    if (filter === 'macro') return n.type === 'macro';
    return true;
  });

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cerrar al cambiar de tab via teclado/fuera
  const fractalCount = notifications.filter(n => n.type === 'fractal').length;
  const macroCount = notifications.filter(n => n.type === 'macro').length;

  const filterCounts = { all: notifications.length, unread: unreadCount, fractal: fractalCount, macro: macroCount };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botón campana */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className={`p-2 rounded-lg transition-all relative ${
          isOpen ? 'bg-slate-800 text-brand-accent' : 'bg-dark-card border border-dark-border text-slate-400 hover:text-white'
        }`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse border-2 border-dark-card">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-96 bg-[#1a2235] border border-slate-700 rounded-2xl shadow-2xl z-[60] overflow-hidden flex flex-col max-h-[80vh]">

          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/60 flex-shrink-0">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                <Bell className="w-4 h-4 text-brand-accent" />
                Notificaciones
                {notifications.length > 0 && (
                  <span className="bg-slate-700 text-slate-300 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                    {notifications.length}
                  </span>
                )}
              </h3>

              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onMarkAllRead(); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-all"
                    title="Marcar todos como leídos"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Todo leído
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onClearAll(); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all"
                    title="Limpiar todas"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Tabs de filtro */}
            <div className="flex gap-1">
              {Object.entries(FILTER_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`flex-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    filter === key
                      ? 'bg-brand-accent text-white shadow'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
                  }`}
                >
                  {label}
                  {filterCounts[key] > 0 && (
                    <span className={`ml-1 ${filter === key ? 'opacity-80' : 'opacity-60'}`}>
                      ({filterCounts[key]})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Lista */}
          <div className="overflow-y-auto custom-scrollbar flex-1">
            {filtered.length === 0 ? (
              <div className="p-12 text-center">
                <Bell className="w-10 h-10 text-slate-700 mx-auto mb-3 opacity-40" />
                <p className="text-slate-500 text-xs font-medium">
                  {filter === 'unread' ? 'Todo al día — sin notificaciones sin leer' : 'Sin notificaciones'}
                </p>
              </div>
            ) : (
              filtered.map(notif => (
                <NotificationItem
                  key={notif.id}
                  notif={notif}
                  onRead={(id) => { onMarkRead(id); if (notif.type === 'fractal') { onSignalClick(notif); setIsOpen(false); } }}
                  onDismiss={onDismiss}
                  onSignalClick={onSignalClick}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-700/60 bg-slate-800/40 flex-shrink-0 text-center">
              <span className="text-[10px] text-slate-600 font-medium">
                {unreadCount > 0
                  ? `${unreadCount} sin leer · ${notifications.length} total`
                  : `${notifications.length} notificaciones · todo leído`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Modal de detalle de señal
const SignalDetailModal = ({ signal, onClose }) => {
  if (!signal) return null;
  const isBuy = signal.setup_type === 'BUY';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`p-5 border-b border-slate-700 ${isBuy ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`}>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {isBuy ? (
                  <ArrowUpCircle className="w-6 h-6 text-emerald-400" />
                ) : (
                  <ArrowDownCircle className="w-6 h-6 text-rose-400" />
                )}
                <span className={`text-xs font-black uppercase tracking-widest px-2 py-1 rounded-lg ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {isBuy ? 'SEÑAL DE COMPRA' : 'SEÑAL DE VENTA'}
                </span>
              </div>
              <h2 className="text-2xl font-black text-white">{signal.symbol}</h2>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Detalles */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/20 border border-slate-700 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Precio del Vértice</p>
              <p className="text-lg font-black text-white font-mono">{parseFloat(signal.entry_price).toFixed(5)}</p>
            </div>
            <div className="bg-black/20 border border-slate-700 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Tipo de Fractal</p>
              <p className={`text-lg font-black ${isBuy ? 'text-emerald-400' : 'text-rose-400'}`}>
                {signal.fractal_type === 'SWING_HIGH' ? 'Swing High' : 'Swing Low'}
              </p>
            </div>
          </div>

          {/* Timestamp */}
          <div className="bg-black/20 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
            <Clock className="w-5 h-5 text-brand-accent" />
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold">Hora Servidor MT5</p>
              <p className="text-sm text-white font-mono">
                {(() => {
                  const mt5tz = localStorage.getItem('qt_mt5_timezone') || 'Etc/UTC';
                  const raw = signal.fractal_time || signal.timestamp;
                  if (!raw) return '—';
                  // MT5 copy_rates retorna timestamps en UTC+0.
                  // Forzamos interpretación UTC agregando 'Z' si es string sin zona horaria.
                  let dateStr = typeof raw === 'number' ? raw * 1000 : raw;
                  if (typeof dateStr === 'string' && !dateStr.includes('Z') && !dateStr.includes('+')) {
                    dateStr = dateStr.replace(' ', 'T') + 'Z';
                  }
                  const d = new Date(dateStr);
                  try {
                    return d.toLocaleString('es-ES', { timeZone: mt5tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
                  } catch {
                    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                  }
                })()}
              </p>
            </div>
          </div>

          {/* Timeframes */}
          {signal.matched_tfs && signal.matched_tfs.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> Temporalidades Confirmadas ({signal.matched_tfs.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {signal.matched_tfs.map(tf => (
                  <span key={tf} className="px-3 py-1.5 bg-brand-accent text-white text-xs font-bold rounded-lg shadow">
                    {tf}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Análisis */}
          <div className={`rounded-xl p-3 border ${isBuy ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
            <p className="text-xs text-slate-300">
              <span className="font-bold">{isBuy ? '📈 Contexto:' : '📉 Contexto:'}</span>
              {' '}Fractal tipo <span className="font-bold text-white">{signal.fractal_type === 'SWING_HIGH' ? 'Swing High' : 'Swing Low'}</span>
              {' '}detectado en <span className="font-bold text-white">{signal.matched_tfs ? signal.matched_tfs.length : 0}</span> temporalidad(es).
              {signal.matched_tfs && signal.matched_tfs.length >= 3 && (
                <span className="text-amber-400 font-bold"> ⚡ Alta confluencia — Revisión inmediata recomendada.</span>
              )}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 bg-slate-800/30">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-brand-accent text-white font-bold text-sm active:scale-95 transition-all"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};

// Defaults para configuración local (deben coincidir con RiskSettingsForm)
const DEFAULT_LOCAL_SETTINGS = {
  notif_sound_enabled: true,
  notif_popup_duration: 3000,
  notif_fractal_alerts: true,
  notif_macro_alerts: true,
  notif_session_popup: true,
  notif_session_bell: true,
  notif_pre_alert_minutes: 5,
};

const getLocalSettings = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('qt_local_settings') || '{}');
    return { ...DEFAULT_LOCAL_SETTINGS, ...saved };
  } catch {
    return DEFAULT_LOCAL_SETTINGS;
  }
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  // ── Notificaciones unificadas: fractal + macro ──────────────────────────────
  // Forma: { id, type: 'fractal'|'macro', is_read, timestamp, ...campos }
  const [allNotifications, setAllNotifications] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [lastOnlineAt, setLastOnlineAt] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [localSettings, setLocalSettings] = useState(getLocalSettings);
  // IDs de fractales descartados (X) para no re-añadirlos del API
  const dismissedFractalIdsRef = useRef(new Set());
  // IDs de macro news ya procesados (evita duplicados entre polls)
  const seenMacroIdsRef = useRef(new Set());
  const isFirstMacroFetchRef = useRef(true);
  // Para detectar *nuevos* fractales vs los que ya estaban
  const prevFractalIdsRef = useRef(new Set());
  // Backoff exponencial para reconexión cuando está offline
  const backoffIntervalRef = useRef(null);
  const backoffDelayRef = useRef(5000);

  // Sincronizar settings locales cada vez que se vuelve a ver la pestaña o cada cierto tiempo
  useEffect(() => {
    const handleStorageChange = () => setLocalSettings(getLocalSettings());
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Refrescar settings locales al cambiar de pestaña para asegurar que tomamos los cambios de Config
  useEffect(() => {
    setLocalSettings(getLocalSettings());
  }, [activeTab]);

  // Sonido de notificación generado con Web Audio API (singleton para evitar memory leak)
  const audioCtxRef = useRef(null);
  const playNotificationSound = () => {
    if (!localSettings.notif_sound_enabled) return;
    try {
      // Reusar o crear AudioContext
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      const now = ctx.currentTime;
      playTone(880, now, 0.12);
      playTone(1320, now + 0.12, 0.15);
    } catch (e) {
      console.error('Error playing notification sound:', e);
    }
  };

  const fetchActiveSignals = async (quiet = false) => {
    try {
      const response = await axios.get(`${API_BASE}/api/market-watch/signals/`);
      const fractals = response.data.fractals || [];

      const activeFractalIds = new Set(fractals.map(f => f.symbol));
      const newFractalIds = [];

      setAllNotifications(prev => {
        // Mapa de notificaciones existentes por id
        const prevMap = new Map(prev.map(n => [n.id, n]));

        // Procesar fractales activos del API
        const fractalNotifs = fractals
          .filter(f => !dismissedFractalIdsRef.current.has(f.symbol))
          .map(f => {
            const existing = prevMap.get(f.symbol);
            if (!existing) newFractalIds.push(f.symbol);
            return {
              id: f.symbol,
              type: 'fractal',
              is_read: existing ? existing.is_read : false,
              timestamp: f.last_update || new Date().toISOString(),
              symbol: f.symbol,
              setup_type: f.fractal_type === 'SWING_HIGH' ? 'SELL' : 'BUY',
              fractal_type: f.fractal_type,
              entry_price: f.fractal_price,
              fractal_time: f.fractal_time,
              matched_tfs: f.matched_tfs || [],
            };
          });

        // Conservar macro news y fractales descartados del estado anterior
        const preserved = prev.filter(n => n.type === 'macro' || n.is_dismissed);

        // Unir y ordenar por timestamp descendente (más nuevas primero)
        return [...fractalNotifs, ...preserved]
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 100); // Límite máximo de 100
      });

      // Disparar sonido + toast si hay fractales genuinamente nuevos (no en primer fetch)
      if (!quiet && newFractalIds.length > 0 && prevFractalIdsRef.current.size > 0) {
        playNotificationSound();
        toast.custom((t) => (
          <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-slate-800 shadow-2xl rounded-2xl pointer-events-auto flex items-center gap-3 ring-1 ring-brand-accent/30 p-3.5 border border-brand-accent/20`}>
            <div className="bg-brand-accent/10 p-2 rounded-xl flex-shrink-0">
              <Activity className="w-4 h-4 text-brand-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Fractal detectado</p>
              <p className="text-xs text-slate-400 truncate">
                {newFractalIds.length === 1
                  ? newFractalIds[0]
                  : `${newFractalIds.length} señales nuevas`}
              </p>
            </div>
            <button onClick={() => toast.dismiss(t.id)} className="text-slate-500 hover:text-white flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        ), { duration: localSettings.notif_popup_duration });
      }

      prevFractalIdsRef.current = activeFractalIds;
      setIsOnline(true);
      setLastOnlineAt(new Date());
      backoffDelayRef.current = 5000;
      if (backoffIntervalRef.current) {
        clearInterval(backoffIntervalRef.current);
        backoffIntervalRef.current = null;
      }
    } catch (error) {
      console.error("Error fetching active signals:", error);
      if (isOnline) {
        setIsOnline(false);
        startBackoffReconnect();
      }
    }
  };

  const startBackoffReconnect = () => {
    if (backoffIntervalRef.current) return; // Ya hay un retry en curso
    const retry = () => {
      fetchActiveSignals(true);
      // Aumentar el delay exponencialmente (5s→10s→20s→40s→60s max)
      backoffDelayRef.current = Math.min(backoffDelayRef.current * 2, 60000);
      clearInterval(backoffIntervalRef.current);
      backoffIntervalRef.current = setInterval(retry, backoffDelayRef.current);
    };
    backoffIntervalRef.current = setInterval(retry, backoffDelayRef.current);
  };

  const fetchMacroNews = async () => {
    if (!localSettings.notif_macro_alerts) return;
    try {
      const response = await axios.get(`${API_BASE}/api/macro-news/`);
      const newsList = response.data.data || [];
      const toAdd = [];

      newsList.forEach(news => {
        if (!seenMacroIdsRef.current.has(news.id)) {
          seenMacroIdsRef.current.add(news.id);
          if (!isFirstMacroFetchRef.current) {
            toAdd.push({
              id: `macro_${news.id}`,
              type: 'macro',
              is_read: false,
              timestamp: news.date || new Date().toISOString(),
              title: news.title,
              country: news.country,
              impact: news.impact,
              actual: news.actual,
              forecast: news.forecast,
              sentiment: news.sentiment,
            });
          }
        }
      });

      isFirstMacroFetchRef.current = false;

      if (toAdd.length > 0) {
        // Agregar al centro unificado
        setAllNotifications(prev =>
          [...toAdd, ...prev].slice(0, 100)
        );

        // Toast compacto (ya tienen el detalle en el centro)
        playNotificationSound();
        toAdd.forEach(news => {
          const borderColor = news.sentiment === 'BULL'
            ? 'border-l-emerald-500'
            : news.sentiment === 'BEAR'
            ? 'border-l-rose-500'
            : 'border-l-amber-500';
          const icon = news.sentiment === 'BULL' ? '🚀' : news.sentiment === 'BEAR' ? '📉' : '📊';
          const sentimentText = news.sentiment === 'BULL'
            ? `Alcista ${news.country}`
            : news.sentiment === 'BEAR'
            ? `Bajista ${news.country}`
            : `Neutral ${news.country}`;
          const sentimentStyle = news.sentiment === 'BULL'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : news.sentiment === 'BEAR'
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-400';

          toast.custom((t) => (
            <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-slate-900 shadow-2xl rounded-xl pointer-events-auto flex flex-col ring-1 ring-slate-700/50 p-4 border-l-4 ${borderColor} z-[100]`}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{icon}</span>
                  <span className="font-black text-white text-sm uppercase">{news.country} · {news.impact}</span>
                </div>
                <button onClick={() => toast.dismiss(t.id)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-white font-bold leading-tight mb-3 text-sm">{news.title}</p>
              <div className="flex gap-3 text-xs mb-3">
                {news.actual && (
                  <div className="flex-1 bg-slate-800 p-2 rounded">
                    <span className="text-slate-500 block text-[9px] uppercase font-bold mb-0.5">Actual</span>
                    <span className="text-white font-mono font-black">{news.actual}</span>
                  </div>
                )}
                {news.forecast && (
                  <div className="flex-1 bg-slate-800 p-2 rounded">
                    <span className="text-slate-500 block text-[9px] uppercase font-bold mb-0.5">Estimado</span>
                    <span className="text-slate-300 font-mono">{news.forecast}</span>
                  </div>
                )}
              </div>
              <div className={`text-[10px] font-black text-center py-1.5 rounded border uppercase tracking-widest ${sentimentStyle}`}>
                {sentimentText}
              </div>
            </div>
          ), { duration: localSettings.notif_popup_duration > 3000 ? localSettings.notif_popup_duration * 2 : 15000 });
        });
      }
    } catch (error) {
      console.error("Error fetching macro news:", error);
    }
  };

  useEffect(() => {
    fetchActiveSignals(true);
    fetchMacroNews(); // Primer fetch silenciado

    const interval = setInterval(() => fetchActiveSignals(false), 20000);
    const macroInterval = setInterval(() => fetchMacroNews(), 45000);

    return () => {
      clearInterval(interval);
      clearInterval(macroInterval);
      if (backoffIntervalRef.current) clearInterval(backoffIntervalRef.current);
    };
  }, []); // CRITICAL: no dependencies — evita loop infinito de re-renders

  // Marcar todas como leídas (no las elimina de la lista)
  const handleMarkAllRead = () => {
    setAllNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  // Marcar una específica como leída
  const handleMarkRead = (id) => {
    setAllNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  // Descartar una notificación (la elimina y evita que se vuelva a agregar si es fractal)
  const handleDismiss = (id, type) => {
    if (type === 'fractal') dismissedFractalIdsRef.current.add(id);
    setAllNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Limpiar todo
  const handleClearAll = () => {
    allNotifications
      .filter(n => n.type === 'fractal')
      .forEach(n => dismissedFractalIdsRef.current.add(n.id));
    setAllNotifications([]);
    prevFractalIdsRef.current = new Set();
    toast('Notificaciones limpiadas', { icon: '✅', duration: 1500 });
  };

  const handleSignalClick = (signal) => {
    setSelectedSignal(signal);
  };

  const multiAccountEnabled = localStorage.getItem('ui_multi_account') !== 'false';

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'market', label: 'Market Watch', icon: LineChart },
    { id: 'calendar', label: 'Calendario', icon: Calendar },
    ...(multiAccountEnabled ? [{ id: 'accounts', label: 'Cuentas', icon: Users }] : []),
    { id: 'history', label: 'Historial', icon: History },
    { id: 'config', label: 'Configuraciones', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-dark-bg text-slate-200">
      <Toaster position="top-right" />

      {/* TopBar optimizada — siempre en una fila */}
      <header className="glass sticky top-2 mx-2 lg:mx-4 mt-2 lg:mt-4 rounded-2xl z-50 shadow-2xl">
        <div className="max-w-7xl mx-auto px-3 lg:px-4 h-14 lg:h-16 flex items-center justify-between">

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="bg-brand-accent p-1.5 lg:p-2 rounded-lg">
              <Activity className="w-4 lg:w-5 h-4 lg:h-5 text-white" />
            </div>
            <h1 className="text-lg lg:text-xl font-bold tracking-tight text-white hidden md:block">
              Quant<span className="text-brand-accent">Tablet</span>
            </h1>
          </div>

          {/* Nav: solo iconos en mobile/tablet, iconos+label en desktop */}
          <nav className="flex items-center gap-0.5 lg:gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 px-2.5 lg:px-4 py-2 lg:py-2.5 rounded-xl font-bold transition-all duration-300 relative group ${isActive
                    ? 'text-brand-accent bg-brand-accent/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <Icon className={`w-4 lg:w-5 h-4 lg:h-5 flex-shrink-0 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                  <span className="text-xs hidden lg:inline">{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-brand-accent rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0">
            <NotificationCenter
              notifications={allNotifications}
              onMarkAllRead={handleMarkAllRead}
              onMarkRead={handleMarkRead}
              onDismiss={handleDismiss}
              onClearAll={handleClearAll}
              onSignalClick={handleSignalClick}
            />
            {isOnline ? (
              <div className="flex items-center px-2.5 py-1 bg-brand-success/10 text-brand-success rounded-full text-[9px] font-black border border-brand-success/20 animate-pulse uppercase tracking-widest">
                Online
              </div>
            ) : (
              <div
                className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 text-rose-400 rounded-full text-[9px] font-black border border-rose-500/20 animate-bounce uppercase tracking-widest cursor-help"
                title={lastOnlineAt ? `Última conexión: ${lastOnlineAt.toLocaleTimeString()}` : 'Sin conexión con el backend'}
              >
                Offline
                {lastOnlineAt && (
                  <span className="normal-case tracking-normal font-normal opacity-70">
                    · {Math.round((Date.now() - lastOnlineAt.getTime()) / 1000)}s
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Contador de Sesiones de Mercado */}
      <MarketSessionTimer />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 animate-fade-in">
        <React.Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-500 animate-pulse">Iniciando interfaz premium...</div>}>
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'market' && <MarketWatchTab />}
          {activeTab === 'calendar' && <EconomicCalendarTab />}
          {activeTab === 'accounts' && <AccountsTab />}
          {activeTab === 'history' && <HistoryTab />}
          {activeTab === 'config' && <RiskSettingsForm />}
        </React.Suspense>
      </main>

      {/* Modal de Detalle de Señal */}
      {selectedSignal && (
        <SignalDetailModal
          signal={selectedSignal}
          onClose={() => setSelectedSignal(null)}
        />
      )}
    </div>
  );
}

export default App;
