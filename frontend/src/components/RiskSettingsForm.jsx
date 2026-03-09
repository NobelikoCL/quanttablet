import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Settings, Save, AlertTriangle, Clock, Bell, Monitor, Database, RefreshCw, Volume2, VolumeX, Trash2, Download, BarChart3, Eye, Zap, TrendingUp, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import API_BASE from '../api';

// Sesiones por defecto (UTC)
const DEFAULT_SESSION_TIMES = {
    asia: { hour: 0, minute: 0, label: '🌏 Asia (Tokyo)' },
    germany: { hour: 7, minute: 0, label: '🇩🇪 Alemania (Frankfurt)' },
    spain: { hour: 8, minute: 0, label: '🇪🇸 España (Madrid)' },
    us: { hour: 14, minute: 30, label: '🇺🇸 Estados Unidos (NYSE)' }
};

const DEFAULT_LOCAL_SETTINGS = {
    // Notificaciones
    notif_sound_enabled: true,
    notif_popup_duration: 3000,
    notif_fractal_alerts: true,
    notif_macro_alerts: true,
    notif_session_popup: true,
    notif_session_bell: true,
    notif_pre_alert_minutes: 5,
    // Dashboard
    dash_account_interval: 3,
    dash_equity_interval: 45,
    dash_signals_interval: 20,
    dash_max_chart_points: 500,
    dash_default_equity_tf: 'M1',
    // Interfaz
    ui_animations_enabled: true,
    ui_compact_mode: false,
    ui_show_spread: true,
    ui_show_session_bar: true,
};

const getLocalSettings = () => {
    try {
        const saved = JSON.parse(localStorage.getItem('qt_local_settings') || '{}');
        return { ...DEFAULT_LOCAL_SETTINGS, ...saved };
    } catch {
        return DEFAULT_LOCAL_SETTINGS;
    }
};

const RiskSettingsForm = () => {
    // Estado del servidor (backend)
    const [settings, setSettings] = useState({
        max_drawdown_percent: 5.0,
        default_lot_size: 0.01,
        equity_profit_target: 0.0,
        global_stop_loss_points: 100,
        is_trading_active: true,
        manual_initial_balance: 0.0,
        global_stop_loss_percent: 30.0,
        is_stop_loss_monitor_active: false,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Estado local (localStorage)
    const [localSettings, setLocalSettings] = useState(getLocalSettings);

    // Estado para horarios de sesiones
    const [sessionTimes, setSessionTimes] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('market_session_times') || '{}');
            return {
                asia: { hour: saved.asia?.hour ?? 0, minute: saved.asia?.minute ?? 0 },
                germany: { hour: saved.germany?.hour ?? 7, minute: saved.germany?.minute ?? 0 },
                spain: { hour: saved.spain?.hour ?? 8, minute: saved.spain?.minute ?? 0 },
                us: { hour: saved.us?.hour ?? 14, minute: saved.us?.minute ?? 30 }
            };
        } catch {
            return { asia: { hour: 0, minute: 0 }, germany: { hour: 7, minute: 0 }, spain: { hour: 8, minute: 0 }, us: { hour: 14, minute: 30 } };
        }
    });

    useEffect(() => { fetchSettings(); }, []);

    const fetchSettings = async () => {
        try {
            const res = await axios.get(`${API_BASE}/api/settings/`);
            setSettings(res.data);
        } catch (error) {
            toast.error("Error al cargar configuración del servidor.");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const TEXT_FIELDS = ['alpha_vantage_api_key', 'default_broker_symbol'];
        const isTextField = TEXT_FIELDS.includes(name) || type === 'text' || type === 'password';
        setSettings(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : isTextField ? value : Number(value) }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await axios.put(`${API_BASE}/api/settings/`, settings);
            toast.success("¡Configuración guardada! MT5 se adaptó al nuevo riesgo.");
        } catch (error) {
            toast.error("Error al aplicar cambios en el servidor backend.");
            console.error(error);
        } finally {
            setSaving(false);
        }
    };

    const handleEmergencyClose = async () => {
        if (!window.confirm("¿ESTÁS SEGURO? Esto cerrará todas las operaciones abiertas inmediatamente.")) return;
        try {
            toast.loading("Enviando orden de cierre masivo a MT5...", { id: "closeToast" });
            const res = await axios.post(`${API_BASE}/api/actions/close_all/`);
            toast.success(res.data.message || "Posiciones cerradas exitosamente.", { id: "closeToast" });
            if (settings.is_trading_active) {
                const newSettings = { ...settings, is_trading_active: false };
                setSettings(newSettings);
                await axios.put(`${API_BASE}/api/settings/`, newSettings);
                toast("Trading pausado por seguridad post-cierre.", { icon: '🛑' });
            }
        } catch (error) {
            toast.error("Error crítico ejecutando el cierre masivo.", { id: "closeToast" });
        }
    };

    // ═══ Local settings helpers ═══
    const updateLocal = (key, value) => {
        setLocalSettings(prev => {
            const updated = { ...prev, [key]: value };
            localStorage.setItem('qt_local_settings', JSON.stringify(updated));
            return updated;
        });
    };

    const handleSessionTimeChange = (sessionId, field, value) => {
        const num = Math.max(0, Math.min(field === 'hour' ? 23 : 59, parseInt(value) || 0));
        setSessionTimes(prev => ({ ...prev, [sessionId]: { ...prev[sessionId], [field]: num } }));
    };

    const saveSessionTimes = () => {
        localStorage.setItem('market_session_times', JSON.stringify(sessionTimes));
        toast.success('Horarios de sesiones actualizados.');
    };

    const resetSessionTimes = () => {
        const defaults = { asia: { hour: 0, minute: 0 }, germany: { hour: 7, minute: 0 }, spain: { hour: 8, minute: 0 }, us: { hour: 14, minute: 30 } };
        setSessionTimes(defaults);
        localStorage.setItem('market_session_times', JSON.stringify(defaults));
        toast('Horarios restablecidos.', { icon: '🔄' });
    };

    const exportSettings = () => {
        const data = {
            server: settings,
            local: localSettings,
            sessions: sessionTimes,
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quanttablet_config_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Configuración exportada.');
    };

    const clearAllLocalData = () => {
        if (!window.confirm("¿Borrar TODA la configuración local? (horarios, preferencias, sonido)")) return;
        localStorage.removeItem('qt_local_settings');
        localStorage.removeItem('market_session_times');
        localStorage.removeItem('market_bell_enabled');
        setLocalSettings(DEFAULT_LOCAL_SETTINGS);
        resetSessionTimes();
        toast.success('Datos locales eliminados.');
    };

    // ═══ Componentes de UI reutilizables ═══
    const SectionHeader = ({ icon: Icon, title, subtitle }) => (
        <div className="flex items-center gap-3 mb-5">
            <div className="bg-brand-accent/10 p-2.5 rounded-xl">
                <Icon className="w-5 h-5 text-brand-accent" />
            </div>
            <div>
                <h2 className="text-lg font-bold text-white">{title}</h2>
                {subtitle && <p className="text-[10px] text-slate-500 uppercase tracking-widest">{subtitle}</p>}
            </div>
        </div>
    );

    const ToggleSwitch = ({ label, description, checked, onChange }) => (
        <div className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0">
            <div>
                <p className="text-sm text-white font-medium">{label}</p>
                {description && <p className="text-[10px] text-slate-500 mt-0.5">{description}</p>}
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
                <div className="w-10 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-accent"></div>
            </label>
        </div>
    );

    const NumberInput = ({ label, description, value, onChange, min, max, step = 1, unit }) => (
        <div className="space-y-1.5">
            <label className="text-sm text-slate-400 font-semibold block">{label}</label>
            <div className="flex items-center gap-2">
                <input type="number" min={min} max={max} step={step} value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-brand-accent transition-colors" />
                {unit && <span className="text-xs text-slate-500 whitespace-nowrap">{unit}</span>}
            </div>
            {description && <p className="text-[10px] text-slate-500">{description}</p>}
        </div>
    );

    if (loading) return <div className="p-4 text-center text-slate-400 animate-pulse">Cargando parámetros...</div>;

    return (
        <div className="space-y-4">

            {/* ═══ DEPÓSITO INICIAL ═══ */}
            <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-xl">
                <SectionHeader icon={Settings} title="Capital de Referencia" subtitle="Depósito inicial para cálculo de P&L" />
                <form onSubmit={handleSubmit} className="flex items-end gap-4">
                    <div className="flex-1">
                        <NumberInput label="Depósito Inicial (Historial)" description="Base para calcular pérdidas, rendimiento y línea dorada" value={settings.manual_initial_balance} onChange={(v) => setSettings(p => ({ ...p, manual_initial_balance: v }))} min={0} step={0.01} unit="USD" />
                    </div>
                    <button type="submit" disabled={saving}
                        className="flex items-center gap-2 bg-brand-accent hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 active:scale-95 flex-shrink-0 mb-0.5">
                        <Save className="w-4 h-4" />
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                </form>
            </div>

            {/* ═══════════════════════════════════════════════ */}
            {/* 2. NOTIFICACIONES Y SONIDO                      */}
            {/* ═══════════════════════════════════════════════ */}
            <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-xl">
                <SectionHeader icon={Bell} title="Notificaciones y Sonido" subtitle="Alertas del sistema" />

                <div className="space-y-1">
                    <ToggleSwitch label="Sonido de notificaciones" description="Ping al detectar nuevos eventos (Fractales / Macro)" checked={localSettings.notif_sound_enabled}
                        onChange={(v) => updateLocal('notif_sound_enabled', v)} />
                    <ToggleSwitch label="Alertas de fractales" description="Toast popup cuando se detecta un nuevo fractal" checked={localSettings.notif_fractal_alerts}
                        onChange={(v) => updateLocal('notif_fractal_alerts', v)} />
                    <ToggleSwitch label="Alertas macroeconómicas" description="Notificaciones en tiempo real (NFP, IPC, Tasas)" checked={localSettings.notif_macro_alerts}
                        onChange={(v) => updateLocal('notif_macro_alerts', v)} />
                    <ToggleSwitch label="Popup de sesión pre-apertura" description="Modal automático 5 min antes de apertura de mercado" checked={localSettings.notif_session_popup}
                        onChange={(v) => updateLocal('notif_session_popup', v)} />
                    <ToggleSwitch label="Campana de apertura" description="Sonido de campana al abrir un mercado" checked={localSettings.notif_session_bell}
                        onChange={(v) => updateLocal('notif_session_bell', v)} />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-800">
                    <NumberInput label="Duración de popups" value={localSettings.notif_popup_duration / 1000} onChange={(v) => updateLocal('notif_popup_duration', v * 1000)} min={1} max={15} step={0.5} unit="seg" />
                    <NumberInput label="Pre-alerta de sesión" value={localSettings.notif_pre_alert_minutes} onChange={(v) => updateLocal('notif_pre_alert_minutes', v)} min={1} max={30} step={1} unit="min" />
                </div>
            </div>

            {/* ═══════════════════════════════════════════════ */}
            {/* 3. DASHBOARD Y DATOS EN TIEMPO REAL             */}
            {/* ═══════════════════════════════════════════════ */}
            <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-xl">
                <SectionHeader icon={BarChart3} title="Dashboard y Datos" subtitle="Intervalos de actualización" />

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    <NumberInput label="Refresh Cuenta" description="Intervalo de actualización de métricas" value={localSettings.dash_account_interval} onChange={(v) => updateLocal('dash_account_interval', v)} min={1} max={60} step={1} unit="seg" />
                    <NumberInput label="Refresh Equidad" description="Intervalo del gráfico de equidad" value={localSettings.dash_equity_interval} onChange={(v) => updateLocal('dash_equity_interval', v)} min={10} max={300} step={5} unit="seg" />
                    <NumberInput label="Refresh Señales" description="Intervalo de polling de fractales" value={localSettings.dash_signals_interval} onChange={(v) => updateLocal('dash_signals_interval', v)} min={5} max={120} step={5} unit="seg" />
                    <NumberInput label="Puntos máx. del gráfico" description="Límite de puntos de equidad (previene OOM)" value={localSettings.dash_max_chart_points} onChange={(v) => updateLocal('dash_max_chart_points', v)} min={50} max={2000} step={50} unit="pts" />
                    <div className="space-y-1.5">
                        <label className="text-sm text-slate-400 font-semibold block">Timeframe Equidad</label>
                        <select value={localSettings.dash_default_equity_tf} onChange={(e) => updateLocal('dash_default_equity_tf', e.target.value)}
                            className="w-full bg-dark-bg border border-dark-border rounded-lg p-2.5 text-white focus:outline-none focus:border-brand-accent transition-colors">
                            <option value="M1">M1 (1 minuto)</option>
                            <option value="M5">M5 (5 minutos)</option>
                            <option value="H1">H1 (1 hora)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════ */}
            {/* 4. INTERFAZ VISUAL                              */}
            {/* ═══════════════════════════════════════════════ */}
            <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-xl">
                <SectionHeader icon={Monitor} title="Interfaz Visual" subtitle="Apariencia y UX" />

                <div className="space-y-1">
                    <ToggleSwitch label="Animaciones" description="Transiciones y efectos visuales en la interfaz" checked={localSettings.ui_animations_enabled}
                        onChange={(v) => updateLocal('ui_animations_enabled', v)} />
                    <ToggleSwitch label="Modo compacto" description="Reduce paddings y espaciados para más contenido" checked={localSettings.ui_compact_mode}
                        onChange={(v) => updateLocal('ui_compact_mode', v)} />
                    <ToggleSwitch label="Mostrar spread" description="Mostrar columna de spread en activos de sesión" checked={localSettings.ui_show_spread}
                        onChange={(v) => updateLocal('ui_show_spread', v)} />
                    <ToggleSwitch label="Barra de sesiones" description="Mostrar barra de countdown de mercados debajo del header" checked={localSettings.ui_show_session_bar}
                        onChange={(v) => updateLocal('ui_show_session_bar', v)} />
                    <ToggleSwitch label="Multi-Cuenta MT5" description="Habilita la pestaña Cuentas para gestionar múltiples terminales y copiar trades" checked={localSettings.ui_multi_account}
                        onChange={(v) => updateLocal('ui_multi_account', v)} />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-800">
                    <div className="space-y-1.5">
                        <label className="text-sm text-slate-400 font-semibold block">🕐 Zona Horaria Local</label>
                        <select value={localStorage.getItem('qt_local_timezone') || 'America/Santiago'}
                            onChange={(e) => { localStorage.setItem('qt_local_timezone', e.target.value); toast.success('Zona horaria local actualizada.'); }}
                            className="w-full bg-dark-bg border border-dark-border rounded-lg p-2.5 text-white focus:outline-none focus:border-brand-accent transition-colors text-sm">
                            <option value="America/Santiago">Santiago, Chile (UTC-3)</option>
                            <option value="America/Argentina/Buenos_Aires">Buenos Aires (UTC-3)</option>
                            <option value="America/Bogota">Bogotá, Colombia (UTC-5)</option>
                            <option value="America/Mexico_City">Ciudad de México (UTC-6)</option>
                            <option value="America/Lima">Lima, Perú (UTC-5)</option>
                            <option value="America/New_York">Nueva York (UTC-5)</option>
                            <option value="America/Chicago">Chicago (UTC-6)</option>
                            <option value="America/Los_Angeles">Los Ángeles (UTC-8)</option>
                            <option value="Europe/London">Londres (UTC+0)</option>
                            <option value="Europe/Madrid">Madrid (UTC+1)</option>
                            <option value="Europe/Berlin">Berlín (UTC+1)</option>
                            <option value="Europe/Moscow">Moscú (UTC+3)</option>
                            <option value="Asia/Tokyo">Tokyo (UTC+9)</option>
                            <option value="Asia/Shanghai">Shanghai (UTC+8)</option>
                            <option value="Australia/Sydney">Sídney (UTC+11)</option>
                        </select>
                        <p className="text-[10px] text-slate-500">Reloj local que aparece debajo del header.</p>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm text-slate-400 font-semibold block">🖥️ Zona Horaria MT5</label>
                        <select value={localStorage.getItem('qt_mt5_timezone') || 'Europe/Helsinki'}
                            onChange={(e) => { localStorage.setItem('qt_mt5_timezone', e.target.value); toast.success('Zona horaria MT5 actualizada.'); }}
                            className="w-full bg-dark-bg border border-dark-border rounded-lg p-2.5 text-white focus:outline-none focus:border-brand-accent transition-colors text-sm">
                            <option value="Europe/Helsinki">EET / Helsinki (UTC+2)</option>
                            <option value="Europe/Istanbul">EEST / Estambul (UTC+3)</option>
                            <option value="Europe/London">GMT / Londres (UTC+0)</option>
                            <option value="America/New_York">EST / Nueva York (UTC-5)</option>
                            <option value="Etc/UTC">UTC (UTC+0)</option>
                        </select>
                        <p className="text-[10px] text-slate-500">Depende de tu broker. La mayoría usa EET (UTC+2).</p>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════ */}
            {/* 5. INTEGRACIONES EXTERNAS                       */}
            {/* ═══════════════════════════════════════════════ */}
            <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-xl">
                <SectionHeader icon={Zap} title="Integraciones Externas" subtitle="API Keys de servicios de datos" />

                <div className="space-y-4">
                    <div className="bg-[#0f172a] p-4 rounded-xl border border-slate-700/50 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                <Database className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-white font-bold text-sm">Alpha Vantage</p>
                                <p className="text-slate-500 text-[10px]">Datos macro, earnings y eventos económicos</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="password"
                                name="alpha_vantage_api_key"
                                value={settings.alpha_vantage_api_key || ''}
                                onChange={handleChange}
                                placeholder="Ingresa tu API Key de alphavantage.co"
                                className="flex-1 bg-[#1e293b] border border-slate-700 rounded-lg py-2.5 px-3 text-white font-mono text-sm focus:border-amber-500 outline-none transition-colors placeholder-slate-600"
                                autoComplete="off"
                            />
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        toast.loading("Guardando API Key...", { id: 'savekey' });
                                        await axios.put(`${API_BASE}/api/settings/`, { ...settings });
                                        toast.success("✅ API Key guardada correctamente", { id: 'savekey' });
                                    } catch (err) {
                                        toast.error("Error al guardar la API Key", { id: 'savekey' });
                                        console.error(err);
                                    }
                                }}
                                className="px-4 py-2.5 bg-amber-500/20 text-amber-400 font-bold text-sm rounded-lg hover:bg-amber-500/30 transition-all active:scale-95 border border-amber-500/30 whitespace-nowrap"
                            >
                                Guardar Key
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] text-slate-500">Tier gratuito: 5 req/min, 500 req/día.</p>
                            <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-amber-400/60 hover:text-amber-400 transition-colors">
                                Obtener Key gratis →
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════ */}
            {/* 6. HORARIOS DE SESIONES DE MERCADO               */}
            {/* ═══════════════════════════════════════════════ */}
            <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-xl">
                <SectionHeader icon={Clock} title="Horarios de Apertura de Mercados" subtitle="Horario UTC" />

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    {Object.entries(DEFAULT_SESSION_TIMES).map(([id, defaults]) => (
                        <div key={id} className="bg-black/20 border border-slate-700 rounded-xl p-4">
                            <p className="text-sm font-bold text-white mb-3">{defaults.label}</p>
                            <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <label className="text-[10px] text-slate-500 uppercase block mb-1">Hora</label>
                                    <input type="number" min="0" max="23"
                                        value={sessionTimes[id]?.hour ?? defaults.hour}
                                        onChange={(e) => handleSessionTimeChange(id, 'hour', e.target.value)}
                                        className="w-full bg-dark-bg border border-dark-border rounded-lg p-2 text-white text-center font-mono font-bold focus:outline-none focus:border-brand-accent" />
                                </div>
                                <span className="text-2xl text-slate-600 font-bold mt-4">:</span>
                                <div className="flex-1">
                                    <label className="text-[10px] text-slate-500 uppercase block mb-1">Min</label>
                                    <input type="number" min="0" max="59"
                                        value={sessionTimes[id]?.minute ?? defaults.minute}
                                        onChange={(e) => handleSessionTimeChange(id, 'minute', e.target.value)}
                                        className="w-full bg-dark-bg border border-dark-border rounded-lg p-2 text-white text-center font-mono font-bold focus:outline-none focus:border-brand-accent" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-dark-border">
                    <button onClick={resetSessionTimes} className="text-xs text-slate-500 hover:text-white transition-colors">
                        🔄 Restablecer por defecto
                    </button>
                    <button onClick={saveSessionTimes}
                        className="flex items-center gap-2 bg-brand-accent hover:bg-blue-600 text-white px-5 py-2 rounded-lg font-semibold text-sm transition-colors active:scale-95">
                        <Save className="w-4 h-4" />
                        Guardar Horarios
                    </button>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════ */}
            {/* 6. GESTIÓN DE DATOS                              */}
            {/* ═══════════════════════════════════════════════ */}
            <div className="bg-dark-card border border-dark-border rounded-xl p-5 shadow-xl">
                <SectionHeader icon={Database} title="Gestión de Datos" subtitle="Exportar, importar y limpiar" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button onClick={exportSettings}
                        className="flex items-center justify-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl py-3 text-sm font-bold transition-all active:scale-95 hover:bg-emerald-500/20">
                        <Download className="w-4 h-4" />
                        Exportar Configuración
                    </button>
                    <button onClick={() => { localStorage.removeItem('dismissed_signals'); toast.success('Notificaciones descartadas limpiadas.'); }}
                        className="flex items-center justify-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl py-3 text-sm font-bold transition-all active:scale-95 hover:bg-amber-500/20">
                        <RefreshCw className="w-4 h-4" />
                        Reset Notificaciones
                    </button>
                    <button onClick={clearAllLocalData}
                        className="flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl py-3 text-sm font-bold transition-all active:scale-95 hover:bg-red-500/20">
                        <Trash2 className="w-4 h-4" />
                        Borrar Datos Locales
                    </button>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800">
                    <div className="flex items-center justify-between text-[10px] text-slate-600">
                        <span>QuantTablet v2.0 • Powered by MT5 + Django + React</span>
                        <span>Datos locales: {(JSON.stringify(localSettings).length / 1024).toFixed(1)} KB</span>
                    </div>
                </div>
            </div>
        </div >
    );
};

export default RiskSettingsForm;
