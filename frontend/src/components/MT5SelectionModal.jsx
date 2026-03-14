import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Monitor, CheckCircle2, Circle, AlertTriangle, RefreshCw, Layers, ChevronRight, Loader2, FolderOpen } from 'lucide-react';
import API_BASE from '../api';

/**
 * Modal de selección de terminales MT5 al iniciar.
 * Aparece cuando el backend no tiene ninguna terminal configurada.
 * Permite elegir: todas las cuentas encontradas o solo una específica.
 */
export default function MT5SelectionModal({ onComplete }) {
  const [phase, setPhase] = useState('scanning'); // scanning | select | saving | error
  const [foundTerminals, setFoundTerminals] = useState([]);
  const [selected, setSelected] = useState(null); // null = "todas", o un objeto {path, broker}
  const [mode, setMode] = useState('single'); // 'all' | 'single'
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [scanError, setScanError] = useState('');
  // Entrada manual de ruta
  const [manualPath, setManualPath] = useState('');
  const [manualBroker, setManualBroker] = useState('');
  const manualPathRef = useRef(null);

  useEffect(() => {
    runScan();
  }, []);

  const runScan = async () => {
    setPhase('scanning');
    setScanError('');
    try {
      const { data } = await axios.get(`${API_BASE}/api/terminals/scan/`);
      const terminals = data.terminals || [];
      setFoundTerminals(terminals);
      if (terminals.length === 0) {
        setScanError('No se encontró ninguna instalación de MetaTrader 5 en este equipo.');
        setPhase('error');
      } else {
        // Pre-seleccionar la primera
        setSelected(terminals[0]);
        setMode('single');
        setPhase('select');
      }
    } catch (e) {
      setScanError('Error al escanear el equipo. Asegúrate de que el backend está corriendo.');
      setPhase('error');
    }
  };

  const handleManualAdd = () => {
    const path = manualPath.trim();
    if (!path) return;
    // Normalizar: si termina en terminal64.exe OK, si no, añadirlo
    const exePath = /terminal64\.exe$/i.test(path) ? path : path.replace(/[/\\]$/, '') + '\\terminal64.exe';
    const broker = manualBroker.trim() || 'MT5 Manual';
    const terminal = { path: exePath, broker, folder: path.replace(/[/\\]?terminal64\.exe$/i, '') };
    setFoundTerminals([terminal]);
    setSelected(terminal);
    setMode('single');
    setManualPath('');
    setManualBroker('');
    setPhase('select');
  };

  const handleConfirm = async () => {
    setSaving(true);
    setErrorMsg('');
    try {
      const terminalsToSend = mode === 'all' ? foundTerminals : [selected];
      const activePath = mode === 'all' ? foundTerminals[0].path : selected.path;

      await axios.post(`${API_BASE}/api/terminals/setup/`, {
        mode,
        terminals: terminalsToSend,
        active_path: activePath,
      });

      onComplete();
    } catch (e) {
      const detail = e?.response?.data?.error || 'No se pudo guardar la configuración.';
      setErrorMsg(detail);
      setSaving(false);
    }
  };

  // ─── UI ──────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-dark-card border border-dark-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-dark-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-accent/15 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-brand-accent" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Selección de Cuenta MT5</h2>
              <p className="text-slate-400 text-xs mt-0.5">Elige qué terminal(es) gestionar en esta sesión</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 min-h-[200px] flex flex-col justify-center">

          {/* Escaneando */}
          {phase === 'scanning' && (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-brand-accent" />
              <p className="text-sm">Escaneando MetaTrader 5 instalado en este equipo...</p>
            </div>
          )}

          {/* Error de escaneo */}
          {phase === 'error' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{scanError}</p>
              </div>

              {/* Entrada manual de ruta */}
              <div className="space-y-2">
                <p className="text-xs text-slate-400 font-medium">
                  Introduce la ruta manualmente si MT5 está en una ubicación no estándar:
                </p>
                <input
                  ref={manualPathRef}
                  type="text"
                  value={manualPath}
                  onChange={e => setManualPath(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleManualAdd()}
                  placeholder="Ej: C:\Users\TuNombre\Desktop\MT5\terminal64.exe"
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-accent font-mono"
                />
                <input
                  type="text"
                  value={manualBroker}
                  onChange={e => setManualBroker(e.target.value)}
                  placeholder="Nombre del broker (opcional)"
                  className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-accent"
                />
                <button
                  onClick={handleManualAdd}
                  disabled={!manualPath.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-accent/20 hover:bg-brand-accent/30 disabled:opacity-40 disabled:cursor-not-allowed text-brand-accent border border-brand-accent/30 rounded-xl text-sm font-bold transition-all"
                >
                  <FolderOpen className="w-4 h-4" /> Usar esta ruta
                </button>
              </div>

              <button
                onClick={runScan}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reintentar escaneo automático
              </button>
            </div>
          )}

          {/* Selección */}
          {phase === 'select' && (
            <div className="space-y-3">

              {/* Opción: Todas las cuentas */}
              {foundTerminals.length > 1 && (
                <button
                  onClick={() => setMode('all')}
                  className={`w-full flex items-center gap-3 rounded-xl border p-4 transition-all text-left ${
                    mode === 'all'
                      ? 'border-brand-accent bg-brand-accent/10'
                      : 'border-dark-border bg-dark-bg hover:border-slate-600'
                  }`}
                >
                  <div className={`flex-shrink-0 ${mode === 'all' ? 'text-brand-accent' : 'text-slate-500'}`}>
                    {mode === 'all' ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-400" />
                      <span className="text-white font-semibold text-sm">Todas las cuentas</span>
                      <span className="text-xs text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded-full">
                        {foundTerminals.length}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Registra todas las instalaciones encontradas. Se activa la primera por defecto.
                    </p>
                  </div>
                </button>
              )}

              {/* Lista de terminales individuales */}
              <div className="space-y-2">
                {foundTerminals.length > 1 && (
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">O elige una específica</p>
                )}
                {foundTerminals.map((t, i) => (
                  <button
                    key={t.path}
                    onClick={() => { setMode('single'); setSelected(t); }}
                    className={`w-full flex items-center gap-3 rounded-xl border p-3.5 transition-all text-left ${
                      mode === 'single' && selected?.path === t.path
                        ? 'border-brand-accent bg-brand-accent/10'
                        : 'border-dark-border bg-dark-bg hover:border-slate-600'
                    }`}
                  >
                    <div className={`flex-shrink-0 ${mode === 'single' && selected?.path === t.path ? 'text-brand-accent' : 'text-slate-500'}`}>
                      {mode === 'single' && selected?.path === t.path
                        ? <CheckCircle2 className="w-5 h-5" />
                        : <Circle className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Monitor className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-white font-medium text-sm truncate">{t.broker}</span>
                        {i === 0 && (
                          <span className="text-[10px] text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            principal
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate font-mono">{t.folder || t.path}</p>
                      <p className="text-[10px] text-slate-600 truncate font-mono">{t.path}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Error al guardar */}
              {errorMsg && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{errorMsg}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'select' && (
          <div className="px-6 pb-6 pt-2">
            <button
              onClick={handleConfirm}
              disabled={saving || (!selected && mode === 'single')}
              className="w-full flex items-center justify-center gap-2 bg-brand-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all active:scale-95"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Configurando...</>
              ) : (
                <>
                  Continuar
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
            <p className="text-center text-xs text-slate-600 mt-2">
              Puedes cambiar la cuenta activa en cualquier momento desde Cuentas
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
