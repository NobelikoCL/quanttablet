import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, RefreshCw, ArrowRightLeft, Zap, FolderOpen, Link2, AlertTriangle, Check, X, Server, Search, RotateCcw, Wallet, BadgeCheck, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import API_BASE from '../api';

const API_KEY = import.meta.env.VITE_API_SECRET_KEY || 'quant-admin-supersecret-token-777';

const AccountsTab = () => {
    const [terminals, setTerminals] = useState([]);
    const [positions, setPositions] = useState({ terminals: [], mappings: [] });
    const [loading, setLoading] = useState(true);
    const [comparing, setComparing] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPath, setNewPath] = useState('');
    const [showMappingForm, setShowMappingForm] = useState(false);
    const [mappingData, setMappingData] = useState({ terminal_a: '', terminal_b: '', symbol_a: '', symbol_b: '' });
    const [scanning, setScanning] = useState(false);
    const [scannedTerminals, setScannedTerminals] = useState(null);
    const [syncingId, setSyncingId] = useState(null);

    // Fetch terminales registradas
    const fetchTerminals = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/terminals/`, {
                headers: { 'X-API-KEY': API_KEY }
            });
            if (res.ok) setTerminals(await res.json());
        } catch (e) { console.error('Error fetching terminals:', e); }
    }, []);

    // Comparar posiciones de todas las terminales
    const comparePositions = useCallback(async () => {
        setComparing(true);
        try {
            const res = await fetch(`${API_BASE}/api/terminals/positions/`, {
                headers: { 'X-API-KEY': API_KEY }
            });
            if (res.ok) setPositions(await res.json());
        } catch (e) { console.error('Error comparing positions:', e); }
        setComparing(false);
    }, []);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await fetchTerminals();
            setLoading(false);
        };
        init();
    }, [fetchTerminals]);

    // Escanear MT5 instalados en el PC
    const handleScan = useCallback(async () => {
        setScanning(true);
        setScannedTerminals(null);
        try {
            const res = await fetch(`${API_BASE}/api/terminals/scan/`, {
                headers: { 'X-API-KEY': API_KEY }
            });
            if (res.ok) {
                const data = await res.json();
                setScannedTerminals(data.terminals || []);
                if (data.terminals?.length === 0) toast('No se encontraron terminales MT5 en este PC', { icon: '🔍' });
            } else {
                toast.error('Error al escanear');
            }
        } catch { toast.error('Error de conexión'); }
        setScanning(false);
    }, []);

    // Agregar terminal detectada con un clic
    const handleAddScanned = async (broker, path) => {
        try {
            const res = await fetch(`${API_BASE}/api/terminals/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-API-KEY': API_KEY },
                body: JSON.stringify({ name: broker, terminal_path: path })
            });
            if (res.ok) {
                toast.success(`Terminal "${broker}" agregada`);
                setScannedTerminals(prev => prev.filter(t => t.path !== path));
                fetchTerminals();
            } else {
                const err = await res.json();
                toast.error(err?.terminal_path?.[0] || 'Error al agregar');
            }
        } catch { toast.error('Error de conexión'); }
    };

    // Agregar terminal
    const handleAdd = async () => {
        if (!newName.trim() || !newPath.trim()) return toast.error('Nombre y ruta son requeridos');
        try {
            const res = await fetch(`${API_BASE}/api/terminals/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': API_KEY
                },
                body: JSON.stringify({ name: newName, terminal_path: newPath })
            });
            if (res.ok) {
                toast.success('Terminal agregada');
                setNewName(''); setNewPath(''); setShowAddForm(false);
                fetchTerminals();
            } else {
                toast.error('Error al agregar terminal');
            }
        } catch { toast.error('Error de conexión'); }
    };

    // Eliminar terminal
    const handleDelete = async (id, name) => {
        if (!confirm(`¿Eliminar terminal "${name}"?`)) return;
        try {
            const res = await fetch(`${API_BASE}/api/terminals/${id}/`, {
                method: 'DELETE',
                headers: { 'X-API-KEY': API_KEY }
            });
            if (res.ok) { toast.success('Terminal eliminada'); fetchTerminals(); }
        } catch { toast.error('Error eliminando'); }
    };

    // Sincronizar datos de cuenta de una terminal
    const handleSync = async (id, name) => {
        setSyncingId(id);
        try {
            const res = await fetch(`${API_BASE}/api/terminals/${id}/sync/`, {
                method: 'POST',
                headers: { 'X-API-KEY': API_KEY }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(`${name}: #${data.account?.login} | ${data.account?.server}`);
                fetchTerminals();
            } else {
                toast.error(data.error || 'No se pudo sincronizar. ¿Está la terminal MT5 abierta?');
            }
        } catch { toast.error('Error de conexión'); }
        setSyncingId(null);
    };

    // Activar terminal
    const handleActivate = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/api/terminals/${id}/`, {
                method: 'POST',
                headers: { 'X-API-KEY': API_KEY }
            });
            if (res.ok) {
                toast.success('Terminal activada');
                fetchTerminals();
            } else {
                toast.error('Error al activar');
            }
        } catch { toast.error('Error de conexión'); }
    };

    // Copiar trade a otra terminal
    const handleCopyTrade = async (targetTerminalId, symbol, volume, tradeType, action = 'open') => {
        // Buscar si hay mapeo de símbolo
        const mapping = positions.mappings?.find(m =>
            (m.terminal_a === targetTerminalId && m.symbol_b === symbol) ||
            (m.terminal_b === targetTerminalId && m.symbol_a === symbol)
        );
        const targetSymbol = mapping
            ? (mapping.terminal_a === targetTerminalId ? mapping.symbol_a : mapping.symbol_b)
            : symbol;

        try {
            const res = await fetch(`${API_BASE}/api/terminals/copy-trade/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': API_KEY
                },
                body: JSON.stringify({ terminal_id: targetTerminalId, symbol: targetSymbol, volume, trade_type: tradeType, action })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                comparePositions();
            } else {
                toast.error(data.message || 'Error');
            }
        } catch { toast.error('Error de conexión'); }
    };

    // Agregar mapeo de símbolo
    const handleAddMapping = async () => {
        if (!mappingData.terminal_a || !mappingData.terminal_b || !mappingData.symbol_a || !mappingData.symbol_b) {
            return toast.error('Todos los campos son requeridos');
        }
        try {
            const res = await fetch(`${API_BASE}/api/terminals/symbol-mappings/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': API_KEY
                },
                body: JSON.stringify(mappingData)
            });
            if (res.ok) {
                toast.success('Mapeo creado');
                setShowMappingForm(false);
                setMappingData({ terminal_a: '', terminal_b: '', symbol_a: '', symbol_b: '' });
                comparePositions();
            } else {
                toast.error('Error al crear mapeo');
            }
        } catch { toast.error('Error de conexión'); }
    };

    // Eliminar mapeo
    const handleDeleteMapping = async (id) => {
        try {
            await fetch(`${API_BASE}/api/terminals/symbol-mappings/`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': API_KEY
                },
                body: JSON.stringify({ id })
            });
            toast.success('Mapeo eliminado');
            comparePositions();
        } catch { toast.error('Error'); }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <RefreshCw className="w-6 h-6 animate-spin text-brand-accent" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ═══ AVISO DE LIMITACIÓN ═══ */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-bold text-amber-300">Limitación Técnica</p>
                    <p className="text-xs text-slate-400 mt-1">
                        La librería MT5 solo permite <span className="text-white font-bold">una conexión activa a la vez</span>.
                        Al comparar posiciones entre cuentas, el sistema hace un <span className="text-amber-300">switch temporal</span> entre terminales
                        (puede tomar 1-2 segundos por terminal). Durante el switch, la cuenta principal queda brevemente desconectada.
                    </p>
                </div>
            </div>
            {/* ═══ HEADER: Terminales Registradas ═══ */}
            <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-violet-500/10 p-2 rounded-xl">
                            <Server className="w-5 h-5 text-violet-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white">Terminales MT5</h2>
                            <p className="text-xs text-slate-500">{terminals.length} terminal(es) registrada(s)</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleScan} disabled={scanning}
                            className="flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50">
                            <Search className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                            {scanning ? 'Escaneando...' : 'Detectar MT5'}
                        </button>
                        <button onClick={() => setShowAddForm(!showAddForm)}
                            className="flex items-center gap-1.5 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 px-3 py-2 rounded-lg text-xs font-bold transition-all">
                            <Plus className="w-3.5 h-3.5" /> Agregar
                        </button>
                    </div>
                </div>

                {/* Formulario nueva terminal */}
                {showAddForm && (
                    <div className="bg-black/20 border border-slate-700 rounded-xl p-4 mb-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-slate-500 font-bold mb-1 block">Nombre</label>
                                <input value={newName} onChange={e => setNewName(e.target.value)}
                                    placeholder="Ej: Cuenta Principal"
                                    className="w-full bg-dark-bg border border-dark-border rounded-lg p-2.5 text-white text-sm focus:border-violet-500 focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 font-bold mb-1 block">Ruta terminal64.exe</label>
                                <input value={newPath} onChange={e => setNewPath(e.target.value)}
                                    placeholder="C:\Program Files\MT5\terminal64.exe"
                                    className="w-full bg-dark-bg border border-dark-border rounded-lg p-2.5 text-white text-sm focus:border-violet-500 focus:outline-none" />
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancelar</button>
                            <button onClick={handleAdd}
                                className="flex items-center gap-1.5 bg-violet-500 hover:bg-violet-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all">
                                <Check className="w-3 h-3" /> Guardar
                            </button>
                        </div>
                    </div>
                )}

                {/* Resultados del escaneo automático */}
                {scannedTerminals !== null && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mb-4">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold text-emerald-400">
                                <Search className="w-3.5 h-3.5 inline mr-1.5" />
                                {scannedTerminals.length > 0
                                    ? `${scannedTerminals.length} terminal(es) MT5 detectada(s) en este PC`
                                    : 'No se encontraron terminales MT5 en este PC'}
                            </p>
                            <button onClick={() => setScannedTerminals(null)} className="text-slate-500 hover:text-white">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                        {scannedTerminals.length > 0 && (
                            <div className="space-y-2">
                                {scannedTerminals.map(t => {
                                    const alreadyAdded = terminals.some(rt => rt.terminal_path === t.path);
                                    return (
                                        <div key={t.path} className="flex items-center justify-between bg-black/20 border border-slate-700 rounded-lg px-3 py-2">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-bold text-white truncate">{t.broker}</p>
                                                <p className="text-[10px] text-slate-500 font-mono truncate">{t.path}</p>
                                            </div>
                                            {alreadyAdded ? (
                                                <span className="text-[9px] bg-slate-700 text-slate-400 px-2 py-1 rounded-lg font-bold flex-shrink-0 ml-2">
                                                    <Check className="w-3 h-3 inline mr-0.5" /> Ya agregada
                                                </span>
                                            ) : (
                                                <button onClick={() => handleAddScanned(t.broker, t.path)}
                                                    className="flex items-center gap-1 text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-2.5 py-1.5 rounded-lg font-bold transition-all flex-shrink-0 ml-2">
                                                    <Plus className="w-3 h-3" /> Agregar
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Lista de terminales */}
                {terminals.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No hay terminales registradas</p>
                        <p className="text-xs mt-1">Usa "Detectar MT5" o agrega la ruta manualmente</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {terminals.map(t => (
                            <div key={t.id} className={`rounded-xl border transition-all ${t.is_active
                                ? 'bg-violet-500/10 border-violet-500/30'
                                : 'bg-black/20 border-slate-700 hover:border-slate-600'
                            }`}>
                                {/* Fila principal */}
                                <div className="flex items-center justify-between p-3">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-bold text-white truncate">{t.name}</p>
                                                {t.is_default && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">DEFAULT</span>}
                                                {t.is_active && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">ACTIVA</span>}
                                                {t.account_type && (
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                        t.account_type === 'demo' ? 'bg-sky-500/20 text-sky-400'
                                                        : t.account_type === 'real' ? 'bg-emerald-500/20 text-emerald-400'
                                                        : 'bg-slate-500/20 text-slate-400'
                                                    }`}>{t.account_type}</span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-500 truncate font-mono mt-0.5">{t.terminal_path}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                            onClick={() => handleSync(t.id, t.name)}
                                            disabled={syncingId === t.id}
                                            title="Sincronizar datos de cuenta"
                                            className="p-1.5 text-slate-500 hover:text-brand-accent transition-colors disabled:opacity-40"
                                        >
                                            <RotateCcw className={`w-3.5 h-3.5 ${syncingId === t.id ? 'animate-spin' : ''}`} />
                                        </button>
                                        {!t.is_active && (
                                            <button onClick={() => handleActivate(t.id)}
                                                className="px-2.5 py-1.5 text-[10px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg font-bold transition-all">
                                                Activar
                                            </button>
                                        )}
                                        <button onClick={() => handleDelete(t.id, t.name)}
                                            className="p-1.5 text-slate-500 hover:text-red-400 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Datos de cuenta (si están sincronizados) */}
                                {t.account_login ? (
                                    <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        <div className="bg-black/30 rounded-lg px-2.5 py-2">
                                            <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Cuenta</p>
                                            <p className="text-xs font-mono font-bold text-white">#{t.account_login}</p>
                                        </div>
                                        <div className="bg-black/30 rounded-lg px-2.5 py-2">
                                            <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Servidor</p>
                                            <p className="text-xs font-mono text-slate-300 truncate" title={t.account_server}>{t.account_server || '—'}</p>
                                        </div>
                                        <div className="bg-black/30 rounded-lg px-2.5 py-2">
                                            <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Balance</p>
                                            <p className="text-xs font-mono font-bold text-emerald-400">
                                                {t.account_balance != null ? `${parseFloat(t.account_balance).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t.account_currency}` : '—'}
                                            </p>
                                        </div>
                                        <div className="bg-black/30 rounded-lg px-2.5 py-2">
                                            <p className="text-[9px] text-slate-500 uppercase font-bold mb-0.5">Titular</p>
                                            <p className="text-xs text-slate-300 truncate" title={t.account_name}>{t.account_name || '—'}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="px-3 pb-3">
                                        <button
                                            onClick={() => handleSync(t.id, t.name)}
                                            disabled={syncingId === t.id}
                                            className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-brand-accent transition-colors disabled:opacity-40"
                                        >
                                            <RotateCcw className={`w-3 h-3 ${syncingId === t.id ? 'animate-spin' : ''}`} />
                                            {syncingId === t.id ? 'Sincronizando...' : 'Sincronizar datos de cuenta'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ═══ COMPARACIÓN DE POSICIONES ═══ */}
            {terminals.length >= 2 && (
                <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-cyan-500/10 p-2 rounded-xl">
                                <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-white">Comparar Posiciones</h2>
                                <p className="text-xs text-slate-500">Compara y copia operaciones entre cuentas</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowMappingForm(!showMappingForm)}
                                className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-3 py-2 rounded-lg text-xs font-bold transition-all">
                                <Link2 className="w-3.5 h-3.5" /> Mapear Símbolos
                            </button>
                            <button onClick={comparePositions} disabled={comparing}
                                className="flex items-center gap-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 px-3 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50">
                                <RefreshCw className={`w-3.5 h-3.5 ${comparing ? 'animate-spin' : ''}`} />
                                {comparing ? 'Comparando...' : 'Comparar'}
                            </button>
                        </div>
                    </div>

                    {/* Mapeo de símbolos form */}
                    {showMappingForm && (
                        <div className="bg-black/20 border border-amber-500/20 rounded-xl p-4 mb-4 space-y-3">
                            <p className="text-xs text-amber-400 font-bold">
                                <AlertTriangle className="w-3 h-3 inline mr-1" />
                                Si los brokers usan nombres diferentes (ej: EURUSD vs EURUSDm), crea un mapeo:
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <select value={mappingData.terminal_a} onChange={e => setMappingData(p => ({ ...p, terminal_a: e.target.value }))}
                                    className="bg-dark-bg border border-dark-border rounded-lg p-2 text-white text-xs">
                                    <option value="">Terminal A</option>
                                    {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <input placeholder="Símbolo en A (ej: EURUSD)" value={mappingData.symbol_a}
                                    onChange={e => setMappingData(p => ({ ...p, symbol_a: e.target.value.toUpperCase() }))}
                                    className="bg-dark-bg border border-dark-border rounded-lg p-2 text-white text-xs" />
                                <select value={mappingData.terminal_b} onChange={e => setMappingData(p => ({ ...p, terminal_b: e.target.value }))}
                                    className="bg-dark-bg border border-dark-border rounded-lg p-2 text-white text-xs">
                                    <option value="">Terminal B</option>
                                    {terminals.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <input placeholder="Símbolo en B (ej: EURUSDm)" value={mappingData.symbol_b}
                                    onChange={e => setMappingData(p => ({ ...p, symbol_b: e.target.value.toUpperCase() }))}
                                    className="bg-dark-bg border border-dark-border rounded-lg p-2 text-white text-xs" />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button onClick={() => setShowMappingForm(false)} className="text-xs text-slate-400 hover:text-white px-3 py-1.5">Cancelar</button>
                                <button onClick={handleAddMapping}
                                    className="bg-amber-500 hover:bg-amber-600 text-black px-4 py-1.5 rounded-lg text-xs font-bold transition-all">
                                    Guardar Mapeo
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Mapeos existentes */}
                    {positions.mappings?.length > 0 && (
                        <div className="mb-4 space-y-1">
                            <p className="text-[10px] text-amber-400 uppercase font-bold mb-2">Mapeos de Símbolos Activos</p>
                            {positions.mappings.map(m => (
                                <div key={m.id} className="flex items-center justify-between bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
                                    <span className="text-xs text-white">
                                        <span className="text-amber-400">{m.terminal_a_name}</span>: <span className="font-mono font-bold">{m.symbol_a}</span>
                                        <span className="text-slate-500 mx-2">↔</span>
                                        <span className="text-amber-400">{m.terminal_b_name}</span>: <span className="font-mono font-bold">{m.symbol_b}</span>
                                    </span>
                                    <button onClick={() => handleDeleteMapping(m.id)} className="text-slate-600 hover:text-red-400">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Tabla comparativa */}
                    {positions.terminals?.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {positions.terminals.map(term => (
                                <div key={term.terminal_id} className="bg-black/20 border border-slate-700 rounded-xl overflow-hidden">
                                    <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-700">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm font-black text-white">{term.terminal_name}</p>
                                                <p className="text-[10px] text-slate-500">
                                                    Cuenta #{term.account} | {term.server}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-slate-500">Balance / Equity</p>
                                                <p className="text-xs font-mono font-bold text-white">
                                                    ${term.balance?.toFixed(2)} / <span className={term.equity >= term.balance ? 'text-emerald-400' : 'text-red-400'}>
                                                        ${term.equity?.toFixed(2)}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {term.error ? (
                                        <div className="p-4 text-center text-red-400 text-xs">
                                            <AlertTriangle className="w-5 h-5 mx-auto mb-1" />
                                            {term.error}
                                        </div>
                                    ) : term.positions?.length === 0 ? (
                                        <div className="p-4 text-center text-slate-500 text-xs">
                                            Sin posiciones abiertas
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-800 max-h-80 overflow-y-auto">
                                            {term.positions.map(pos => {
                                                // Buscar si esta posición existe en otra terminal
                                                const otherTerminals = positions.terminals.filter(t => t.terminal_id !== term.terminal_id);
                                                const existsInOther = otherTerminals.some(ot => {
                                                    // Verificar mapeos
                                                    const mapping = positions.mappings?.find(m =>
                                                        (m.terminal_a === term.terminal_id && m.symbol_a === pos.symbol && m.terminal_b === ot.terminal_id) ||
                                                        (m.terminal_b === term.terminal_id && m.symbol_b === pos.symbol && m.terminal_a === ot.terminal_id)
                                                    );
                                                    const mappedSymbol = mapping
                                                        ? (mapping.terminal_a === ot.terminal_id ? mapping.symbol_a : mapping.symbol_b)
                                                        : pos.symbol;
                                                    return ot.positions?.some(op => op.symbol === mappedSymbol && op.type === pos.type);
                                                });

                                                return (
                                                    <div key={pos.ticket} className="flex items-center justify-between px-4 py-2.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${pos.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                                {pos.type}
                                                            </span>
                                                            <span className="text-xs font-bold text-white">{pos.symbol}</span>
                                                            <span className="text-[10px] text-slate-500">{pos.volume}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-xs font-mono font-bold ${pos.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                {pos.profit >= 0 ? '+' : ''}{pos.profit?.toFixed(2)}
                                                            </span>
                                                            {existsInOther ? (
                                                                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                                                                    <Check className="w-3 h-3 inline" /> Sync
                                                                </span>
                                                            ) : (
                                                                <div className="flex gap-1">
                                                                    {otherTerminals.map(ot => (
                                                                        <button key={ot.terminal_id}
                                                                            onClick={() => handleCopyTrade(ot.terminal_id, pos.symbol, pos.volume, pos.type, 'open')}
                                                                            className="text-[9px] bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 px-1.5 py-0.5 rounded font-bold transition-all"
                                                                            title={`Copiar a ${ot.terminal_name}`}>
                                                                            <Zap className="w-3 h-3 inline" /> → {ot.terminal_name?.slice(0, 8)}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500">
                            <ArrowRightLeft className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Presiona "Comparar" para ver las posiciones lado a lado</p>
                        </div>
                    )}
                </div>
            )}

            {/* Mensaje si solo hay 1 terminal */}
            {terminals.length === 1 && (
                <div className="bg-dark-card border border-amber-500/20 rounded-xl p-5 text-center">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
                    <p className="text-sm text-white font-bold">Agrega una segunda terminal para comparar posiciones</p>
                    <p className="text-xs text-slate-500 mt-1">La función Trade Copier necesita mínimo 2 terminales registradas</p>
                </div>
            )}
        </div>
    );
};

export default AccountsTab;
