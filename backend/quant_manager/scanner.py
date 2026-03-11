import logging
import threading
import time
import gc
import pandas as pd
from decimal import Decimal
import psutil
import os
import MetaTrader5 as mt5
from django.db import close_old_connections
from .models import MarketWatchSettings, MarketWatchSignal

logger = logging.getLogger(__name__)

class MarketWatchScanner:
    _scanner_thread = None
    _stop_event = threading.Event()
    _process = None

    @staticmethod
    def start():
        if MarketWatchScanner._scanner_thread is None or not MarketWatchScanner._scanner_thread.is_alive():
            MarketWatchScanner._stop_event.clear()
            MarketWatchScanner._scanner_thread = threading.Thread(target=MarketWatchScanner._run, daemon=True)
            MarketWatchScanner._scanner_thread.start()
            logger.info("Market Watch Scanner INICIADO.")

    @staticmethod
    def stop():
        MarketWatchScanner._stop_event.set()
        if MarketWatchScanner._scanner_thread:
            MarketWatchScanner._scanner_thread.join(timeout=2)
        logger.info("Market Watch Scanner DETENIDO.")

    @staticmethod
    def _run():
        while not MarketWatchScanner._stop_event.is_set():
            try:
                close_old_connections()
                settings = MarketWatchSettings.get_settings()

                if not MarketWatchScanner._process:
                    try:
                        MarketWatchScanner._process = psutil.Process(os.getpid())
                    except Exception as e:
                        logger.warning(f"No se pudo obtener el proceso psutil: {e}")

                # Determinar qué símbolos escanear
                symbols_info = mt5.symbols_get()
                if symbols_info is None:
                    logger.warning("No se pudo obtener símbolos de MT5. Reintentando...")
                    time.sleep(10)
                    continue

                if settings.symbols.strip().upper() == "ALL":
                    symbols = [s.name for s in symbols_info if s.visible and s.trade_mode != mt5.SYMBOL_TRADE_MODE_DISABLED]
                    if not symbols:
                        symbols = ["EURUSD", "GBPUSD", "GOLD"]
                # Temporalidades para Fractales y EMA
                fractal_tfs = [tf.strip() for tf in settings.fractal_timeframes.split(',') if tf.strip()]
                if not fractal_tfs:
                    fractal_tfs = ["M5", "M15", "M30", "H1", "H4", "D1"]

                ema_tfs = [tf.strip() for tf in getattr(settings, 'ema_timeframes', 'M15,M30,H1,H4').split(',') if tf.strip()]
                if not ema_tfs:
                    ema_tfs = ["M15", "M30", "H1", "H4"]

                stoch_tfs = [tf.strip() for tf in getattr(settings, 'stoch_timeframes', 'M15,M30,H1,H4,D1').split(',') if tf.strip()]
                if not stoch_tfs:
                    stoch_tfs = ["M15", "M30", "H1", "H4", "D1"]

                breakout_tf = getattr(settings, 'breakout_timeframe', 'M15').strip().upper() or 'M15'

                # Monitoreo de Memoria
                mem_mb = 0
                if MarketWatchScanner._process:
                    try:
                        mem_mb = MarketWatchScanner._process.memory_info().rss / 1024 / 1024
                    except Exception as e:
                        logger.warning(f"Error leyendo memoria: {e}")

                from concurrent.futures import ThreadPoolExecutor
                # Limitar hilos a 4 para reducir contención en SQLite.
                # Con ALL + acciones son >200 símbolos: demasiados escritores simultáneos = "database is locked".
                max_workers = min(4, os.cpu_count() or 4)

                logger.debug(f"[INICIO] CICLO ({len(symbols)} activos) | Hilos: {max_workers} | RAM: {mem_mb:.2f} MB")

                def _safe_analyze(symbol_name):
                    try:
                        # Cada hilo de Django necesita cerrar conexiones viejas para evitar "Database is locked" o leaks
                        close_old_connections()
                        MarketWatchScanner._analyze_symbol(symbol_name, settings, fractal_tfs, ema_tfs, stoch_tfs, breakout_tf)
                    except Exception as e:
                        logger.error(f"Error analizando {symbol_name} en hilo: {str(e)}")

                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    executor.map(_safe_analyze, symbols)

                gc.collect()
                mem_end = 0
                if MarketWatchScanner._process:
                    try:
                        mem_end = MarketWatchScanner._process.memory_info().rss / 1024 / 1024
                    except Exception as e:
                        logger.warning(f"Error leyendo memoria final: {e}")

                logger.debug(f"[FIN] CICLO FINALIZADO | RAM: {mem_end:.2f} MB | Dif: {mem_end - mem_mb:+.2f} MB")
                time.sleep(5)
            except Exception as e:
                logger.error(f"Error crítico en loop del scanner: {str(e)}")
                time.sleep(10)

    # ──────────────────────────────────────────────────────────────
    #  ANÁLISIS DE UN SÍMBOLO
    # ──────────────────────────────────────────────────────────────
    @staticmethod
    def _analyze_symbol(symbol, settings, fractal_tfs, ema_tfs, stoch_tfs=None, breakout_tf="M15"):
        signal, _ = MarketWatchSignal.objects.get_or_create(symbol=symbol)

        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            return

        sym_info = mt5.symbol_info(symbol)

        signal.status = 'SCANNING'
        signal.message = f"Escaneando {symbol}..."

        # Reset de señales
        signal.fractal_type = None
        signal.fractal_price = None
        signal.fractal_time = None
        signal.matched_tfs = []

        signal.ema_signal = None
        signal.ema_matched_tfs = []
        signal.ema_200_h1_status = None
        signal.stoch_status = None
        signal.stoch_data = {}
        signal.breakout_m15 = 'RANGE'

        # Precio actual y decimales del símbolo (funciona con forex, índices y acciones)
        signal.current_bid = Decimal(str(tick.bid))
        if sym_info:
            signal.symbol_digits = sym_info.digits

        # Volumen: usar tick_volume de la vela M5 actual (acumulado en el período corriente).
        # NO usar tick.volume de symbol_info_tick — ese es el volumen de UN solo tick (valor 1-5),
        # incomparable con la media de velas que acumula miles de ticks por período.
        df_vol = MarketWatchScanner._get_candles(symbol, "M5", 22)  # 20 cerradas + 1 actual + margen
        if df_vol is not None and len(df_vol) >= 2:
            # iloc[-1] = vela actual (formándose), iloc[-21:-1] = últimas 20 velas cerradas
            current_vol = int(df_vol['tick_volume'].iloc[-1])
            ma_vol = float(df_vol['tick_volume'].iloc[-21:-1].mean()) if len(df_vol) >= 21 else float(df_vol['tick_volume'].iloc[:-1].mean())
            signal.tick_volume = current_vol
            signal.volume_ma = ma_vol
            if ma_vol > 0 and current_vol > ma_vol * 2.0:
                logger.debug(f"[Scanner] VOLUMEN INUSUAL en {symbol}: {current_vol} (Media: {int(ma_vol)})")
        else:
            signal.tick_volume = 0
            signal.volume_ma = 0.0

        # --- Análisis de contexto EMA 200 en H1 ---
        # Se usan 600 velas para que el EWM tenga suficiente warmup:
        # con span=200 y 600 bars, el peso de la 1ª vela cae a <0.5% (vs ~37% con solo 201 bars)
        try:
            df_h1 = MarketWatchScanner._get_candles(symbol, "H1", 600)
            if df_h1 is not None and len(df_h1) >= 400:
                ema200 = df_h1['close'].ewm(span=200, adjust=False).mean().iloc[-1]
                current_price = tick.bid
                signal.ema_200_h1_status = 'ABOVE_EMA200' if current_price > ema200 else 'BELOW_EMA200'
        except Exception as e:
            logger.error(f"Error calculando EMA 200 H1 para {symbol}: {e}")
        # --- Análisis Estocástico (14, 3, 3) ---
        if not stoch_tfs:
            stoch_tfs = ["M15", "M30", "H1", "H4", "D1"]
        stoch_results = {}
        stoch_summary = []
        
        for tf in stoch_tfs:
            try:
                # Necesitamos al menos 14 + 3 + 3 para el estocástico suave
                df_stoch = MarketWatchScanner._get_candles(symbol, tf, 50)
                if df_stoch is not None and len(df_stoch) >= 20:
                    # %K = (Close - Low14)/(High14 - Low14) * 100
                    low_14 = df_stoch['low'].rolling(window=14).min()
                    high_14 = df_stoch['high'].rolling(window=14).max()
                    k = 100 * (df_stoch['close'] - low_14) / (high_14 - low_14)
                    
                    # Suavizado %K (3 per) y %D (3 per)
                    k_smooth = k.rolling(window=3).mean()
                    d_smooth = k_smooth.rolling(window=3).mean()
                    
                    curr_k = float(k_smooth.iloc[-1])
                    curr_d = float(d_smooth.iloc[-1])
                    prev_k = float(k_smooth.iloc[-2])
                    prev_d = float(d_smooth.iloc[-2])
                    
                    stoch_results[tf] = {"k": round(curr_k, 2), "d": round(curr_d, 2)}
                    
                    # Detectar Cruces - SOLO si están en zonas de interés (Filtro Anti-Ruido)
                    # Bullish Cross: Cruza hacia arriba estando en sobreventa (<30)
                    if prev_k <= prev_d and curr_k > curr_d and (curr_k < 30 or prev_k < 30):
                        stoch_summary.append(f"BULLISH_CROSS_{tf}")
                    # Bearish Cross: Cruza hacia abajo estando en sobrecompra (>70)
                    elif prev_k >= prev_d and curr_k < curr_d and (curr_k > 70 or prev_k > 70):
                        stoch_summary.append(f"BEARISH_CROSS_{tf}")
                    
                    # Detectar Niveles
                    if curr_k >= 80:
                        stoch_summary.append(f"OVERBOUGHT_{tf}")
                    elif curr_k <= 20:
                        stoch_summary.append(f"OVERSOLD_{tf}")
            except Exception as e:
                logger.error(f"Error estocástico en {symbol} {tf}: {e}")
        
        signal.stoch_data = stoch_results
        signal.stoch_status = ",".join(stoch_summary) if stoch_summary else "NEUTRAL"

        # --- Detección de Rupturas Donchian (TF configurable) ---
        try:
            df_bo = MarketWatchScanner._get_candles(symbol, breakout_tf, 25)
            if df_bo is not None and len(df_bo) >= 21:
                # Calculamos el rango de las últimas 20 velas cerradas (sin contar la actual)
                range_df = df_bo.iloc[-21:-1]
                upper_bound = range_df['high'].max()
                lower_bound = range_df['low'].min()

                current_price = tick.bid
                if current_price > upper_bound:
                    signal.breakout_m15 = 'BULLISH_BREAKOUT'
                    logger.warning(f"[BREAKOUT] {symbol} | ALCISTA {breakout_tf} | Precio: {current_price:.5f} > Techo: {upper_bound:.5f}")
                elif current_price < lower_bound:
                    signal.breakout_m15 = 'BEARISH_BREAKOUT'
                    logger.warning(f"[BREAKOUT] {symbol} | BAJISTA {breakout_tf} | Precio: {current_price:.5f} < Suelo: {lower_bound:.5f}")
                else:
                    signal.breakout_m15 = 'RANGE'
        except Exception as e:
            logger.error(f"Error detectando ruptura {breakout_tf} para {symbol}: {e}")

        # Determinar TFs que necesitan escaneo (combinar ambos para no solicitar datos redundantes si coinciden)
        all_tfs = set()
        if settings.is_fractal_active:
            all_tfs.update(fractal_tfs)
        if getattr(settings, 'is_ema_active', False):
            all_tfs.update(ema_tfs)

        fractal_matches = []
        fractal_best_type = None
        fractal_best_price = None
        fractal_best_time = None
        
        ema_matches = []
        ema_best_signal = None

        for tf in all_tfs:
            if MarketWatchScanner._stop_event.is_set():
                break
                
            # Optimización Experta: Solo descargar lo necesario
            needs_ema = getattr(settings, 'is_ema_active', False) and tf in ema_tfs
            # 800 velas: necesarias para warmup correcto de EMA 200 (peso 1ª vela < 0.1%)
            needed_candles = 800 if needs_ema else 20
            
            logger.debug(f"[Scanner] {symbol} @ {tf} -> Fetching {needed_candles} candles.")
            df = MarketWatchScanner._get_candles(symbol, tf, needed_candles)
            if df is None or len(df) < 5:
                continue

            # Evaluar Fractales
            if settings.is_fractal_active and tf in fractal_tfs:
                fractal_res = MarketWatchScanner._eval_fractals(df)
                if fractal_res:
                    fractal_matches.append(tf)
                    if not fractal_best_type:
                        fractal_best_type = fractal_res['type']
                        fractal_best_price = fractal_res['price']
                        fractal_best_time = fractal_res['time'].strftime('%Y-%m-%dT%H:%M:%SZ')

            # Evaluar EMA
            if needs_ema:
                ema_res = MarketWatchScanner._eval_ema_confluence(df)
                if ema_res:
                    ema_matches.append(tf)
                    if not ema_best_signal:
                        ema_best_signal = ema_res

        # Guardar resultados
        updated = False
        
        if settings.is_fractal_active and fractal_matches:
            signal.status = 'FRACTAL_MATCH'
            signal.fractal_type = fractal_best_type
            signal.fractal_price = fractal_best_price
            signal.fractal_time = fractal_best_time
            signal.matched_tfs = fractal_matches
            logger.warning(f"[FRACTAL] {symbol} | {fractal_best_type} | Precio: {fractal_best_price:.5f} | Hora: {fractal_best_time} | TFs: {', '.join(fractal_matches)}")
            updated = True
            
        if getattr(settings, 'is_ema_active', False) and ema_matches:
            if not updated:  # Si ya es FRACTAL_MATCH, mantenemos ese o lo actualizamos a EMA, o usamos el booleano
                signal.status = 'EMA_MATCH'
            signal.ema_signal = ema_best_signal
            signal.ema_matched_tfs = ema_matches
            logger.warning(f"[EMA] {symbol} | {ema_best_signal} | TFs: {', '.join(ema_matches)}")

        signal.save()
        
    @staticmethod
    def _get_candles(symbol, timeframe_str, count=20):
        tf_map = {
            "M1": mt5.TIMEFRAME_M1, "M5": mt5.TIMEFRAME_M5, "M15": mt5.TIMEFRAME_M15,
            "M30": mt5.TIMEFRAME_M30, "H1": mt5.TIMEFRAME_H1, "H4": mt5.TIMEFRAME_H4,
            "D1": mt5.TIMEFRAME_D1, "W1": mt5.TIMEFRAME_W1, "MN1": mt5.TIMEFRAME_MN1
        }
        tf = tf_map.get(timeframe_str.upper())
        if not tf:
            return None
        rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
        if rates is None or len(rates) == 0:
            return None
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s', utc=True)
        # Aseguramos nombres consistentes según lo que devuelve copy_rates_from_pos
        if 'tick_volume' not in df.columns and 'volume' in df.columns:
            df['tick_volume'] = df['volume']
        return df

    # ──────────────────────────────────────────────────────────────
    #  FRACTALES (Bill Williams) - Vectorizado
    # ──────────────────────────────────────────────────────────────
    @staticmethod
    def _eval_fractals(df):
        """
        Evalúa si la vela de confirmación (índice -3 respecto a hoy que es -1) 
        forma un fractal de Bill Williams puro.
        """
        # Desplazamientos vectoriales rápidos (shift)
        df['high_prev1'] = df['high'].shift(1)
        df['high_prev2'] = df['high'].shift(2)
        df['high_next1'] = df['high'].shift(-1)
        df['high_next2'] = df['high'].shift(-2)

        df['low_prev1'] = df['low'].shift(1)
        df['low_prev2'] = df['low'].shift(2)
        df['low_next1'] = df['low'].shift(-1)
        df['low_next2'] = df['low'].shift(-2)

        # Vector: Es Swing High?
        df['is_swing_high'] = (
            (df['high'] > df['high_prev1']) & 
            (df['high'] > df['high_prev2']) & 
            (df['high'] > df['high_next1']) & 
            (df['high'] > df['high_next2'])
        )

        # Vector: Es Swing Low?
        df['is_swing_low'] = (
            (df['low'] < df['low_prev1']) & 
            (df['low'] < df['low_prev2']) & 
            (df['low'] < df['low_next1']) & 
            (df['low'] < df['low_next2'])
        )

        # Miramos ESTRICTAMENTE la vela en la posición -3 para evitar look-ahead bias
        # df.iloc[-1] es la vela formándose AHORA
        # df.iloc[-2] es la vela anterior
        # df.iloc[-3] es la vela central del posible fractal (que requiere 2 velas a la derecha, que son -2 y -1)
        
        target_candle = df.iloc[-3]
        
        if target_candle['is_swing_high']:
            return {
                'type': 'SWING_HIGH',
                'price': Decimal(str(target_candle['high'])),
                'time': target_candle['time']
            }
            
        if target_candle['is_swing_low']:
            return {
                'type': 'SWING_LOW',
                'price': Decimal(str(target_candle['low'])),
                'time': target_candle['time']
            }
            
        return None

    # ──────────────────────────────────────────────────────────────
    #  EMA CONFLUENCE
    # ──────────────────────────────────────────────────────────────
    @staticmethod
    def _eval_ema_confluence(df):
        """
        Evalúa la confluencia de medias móviles exponenciales.
        EMAs evaluadas: 20, 40, 80, 200, 400.
        Condición alcista: 20, 40, 80 > 200
        Condición bajista: 20, 40, 80 < 200
        """
        df['ema_20'] = df['close'].ewm(span=20, adjust=False).mean()
        df['ema_40'] = df['close'].ewm(span=40, adjust=False).mean()
        df['ema_80'] = df['close'].ewm(span=80, adjust=False).mean()
        df['ema_200'] = df['close'].ewm(span=200, adjust=False).mean()
        df['ema_400'] = df['close'].ewm(span=400, adjust=False).mean()

        last_candle = df.iloc[-1]
        
        # Trigger es 20, 40, 80 con respecto a 200
        e20 = last_candle['ema_20']
        e40 = last_candle['ema_40']
        e80 = last_candle['ema_80']
        e200 = last_candle['ema_200']
        
        if e20 > e200 and e40 > e200 and e80 > e200:
            return 'BULLISH'
            
        if e20 < e200 and e40 < e200 and e80 < e200:
            return 'BEARISH'
            
        return None


