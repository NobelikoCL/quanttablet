import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Calendar, Clock, AlertTriangle, RefreshCcw } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../api';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY'];
const IMPACTS = ['-1', '0', '1']; // TradingView: -1=low, 0=medium, 1=high

const IMPACT_LABELS = { '-1': 'Bajo', '0': 'Medio', '1': 'Alto' };
const IMPACT_COLORS = {
    '-1': 'bg-slate-600/40 text-slate-300 border-slate-600',
    '0': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    '1': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

// Componente countdown al próximo evento macro de alto impacto
const NextEventCountdown = () => {
    const [nextEvent, setNextEvent] = useState(null);
    const [countdown, setCountdown] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchNextEvent = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/macro-news/`);
            const news = res.data.data || [];
            // Buscar el próximo evento con impacto High que tenga tiempo definido
            const highImpact = news.filter(n => n.impact === 'High' && n.date);
            if (highImpact.length > 0) {
                setNextEvent(highImpact[0]);
            } else if (news.length > 0) {
                setNextEvent(news[0]);
            }
        } catch {
            // silencioso
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNextEvent();
        const interval = setInterval(fetchNextEvent, 60000);
        return () => clearInterval(interval);
    }, [fetchNextEvent]);

    useEffect(() => {
        if (!nextEvent?.date) return;
        const tick = () => {
            try {
                const eventTime = new Date(nextEvent.date);
                const now = new Date();
                const diffMs = eventTime - now;
                if (diffMs <= 0) {
                    setCountdown('En curso / Pasado');
                    return;
                }
                const h = Math.floor(diffMs / 3600000);
                const m = Math.floor((diffMs % 3600000) / 60000);
                const s = Math.floor((diffMs % 60000) / 1000);
                setCountdown(`${h > 0 ? `${h}h ` : ''}${m}m ${s}s`);
            } catch {
                setCountdown('');
            }
        };
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [nextEvent]);

    if (loading) return null;
    if (!nextEvent) return null;

    const sentimentColor = nextEvent.impact === 'High'
        ? 'border-rose-500/40 bg-rose-500/5'
        : 'border-amber-500/30 bg-amber-500/5';

    return (
        <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${sentimentColor} text-sm`}>
            <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div className="min-w-0">
                <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Próximo evento relevante · </span>
                <span className="text-white font-bold truncate">{nextEvent.country} — {nextEvent.title}</span>
            </div>
            {countdown && (
                <span className="ml-auto font-mono font-black text-amber-400 text-sm flex-shrink-0 tabular-nums">
                    {countdown}
                </span>
            )}
        </div>
    );
};

const EconomicCalendarTab = () => {
    const containerRef = useRef(null);
    const [selectedCurrencies, setSelectedCurrencies] = useState(new Set(CURRENCIES));
    const [selectedImpacts, setSelectedImpacts] = useState(new Set(IMPACTS));
    const widgetKeyRef = useRef(0);

    const toggleCurrency = (c) => {
        setSelectedCurrencies(prev => {
            const next = new Set(prev);
            if (next.has(c)) {
                if (next.size > 1) next.delete(c); // Mínimo 1 divisa
            } else {
                next.add(c);
            }
            return next;
        });
    };

    const toggleImpact = (i) => {
        setSelectedImpacts(prev => {
            const next = new Set(prev);
            if (next.has(i)) {
                if (next.size > 1) next.delete(i); // Mínimo 1 impacto
            } else {
                next.add(i);
            }
            return next;
        });
    };

    const selectAllCurrencies = () => setSelectedCurrencies(new Set(CURRENCIES));
    const selectAllImpacts = () => setSelectedImpacts(new Set(IMPACTS));

    useEffect(() => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = '';
        widgetKeyRef.current += 1;

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
            colorTheme: 'dark',
            isTransparent: true,
            width: '100%',
            height: '100%',
            locale: 'es',
            importanceFilter: Array.from(selectedImpacts).join(','),
            currencyFilter: Array.from(selectedCurrencies).join(','),
        });

        containerRef.current.appendChild(script);
    }, [selectedCurrencies, selectedImpacts]);

    return (
        <div className="space-y-3 h-[calc(100vh-140px)] flex flex-col">
            {/* Header */}
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4 shadow-xl flex-shrink-0 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-amber-500/10 rounded-xl">
                        <Calendar className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white">Calendario Macro Económico</h2>
                        <p className="text-xs text-slate-500">Eventos globales en tiempo real · Filtros activos</p>
                    </div>
                </div>

                {/* Countdown próximo evento */}
                <NextEventCountdown />

                {/* Filtros de impacto */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider flex-shrink-0">Impacto:</span>
                    {IMPACTS.map(imp => (
                        <button
                            key={imp}
                            onClick={() => toggleImpact(imp)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${selectedImpacts.has(imp)
                                ? IMPACT_COLORS[imp]
                                : 'bg-transparent text-slate-600 border-slate-700 opacity-50'
                            }`}
                        >
                            {IMPACT_LABELS[imp]}
                        </button>
                    ))}
                    {selectedImpacts.size < IMPACTS.length && (
                        <button onClick={selectAllImpacts} className="text-xs text-brand-accent hover:underline font-bold">
                            Todos
                        </button>
                    )}
                </div>

                {/* Filtros de divisas */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-wider flex-shrink-0">Divisas:</span>
                    {CURRENCIES.map(c => (
                        <button
                            key={c}
                            onClick={() => toggleCurrency(c)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${selectedCurrencies.has(c)
                                ? 'bg-brand-accent/20 text-brand-accent border-brand-accent/40'
                                : 'bg-transparent text-slate-600 border-slate-700 opacity-40'
                            }`}
                        >
                            {c}
                        </button>
                    ))}
                    {selectedCurrencies.size < CURRENCIES.length && (
                        <button onClick={selectAllCurrencies} className="text-xs text-brand-accent hover:underline font-bold">
                            Todas
                        </button>
                    )}
                </div>
            </div>

            {/* Widget TradingView */}
            <div className="bg-[#1e293b] border border-[#334155] rounded-xl overflow-hidden flex-1 relative">
                <div className="absolute inset-0 p-2" ref={containerRef}>
                    {/* Widget inyectado dinámicamente */}
                </div>
            </div>
        </div>
    );
};

export default EconomicCalendarTab;
