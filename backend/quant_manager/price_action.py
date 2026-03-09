import logging
import MetaTrader5 as mt5
import pandas as pd
import numpy as np
from datetime import datetime

logger = logging.getLogger(__name__)

class PriceActionAnalyzer:
    @staticmethod
    def get_candles(symbol, timeframe, count=100):
        """Obtiene velas de MT5 y las convierte a DataFrame"""
        tf_map = {
            'M1': mt5.TIMEFRAME_M1,
            'M5': mt5.TIMEFRAME_M5,
            'M15': mt5.TIMEFRAME_M15,
            'M30': mt5.TIMEFRAME_M30,
            'H1': mt5.TIMEFRAME_H1,
            'H4': mt5.TIMEFRAME_H4,
            'D1': mt5.TIMEFRAME_D1
        }
        
        rates = mt5.copy_rates_from_pos(symbol, tf_map.get(timeframe, mt5.TIMEFRAME_H1), 0, count)
        if rates is None or len(rates) == 0:
            logger.error(f"No se pudieron obtener velas para {symbol} {timeframe}")
            return None
        
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        
        # Eliminar columnas pesadas que no usamos para ahorrar memoria
        cols_to_keep = ['time', 'open', 'high', 'low', 'close', 'tick_volume']
        df = df[cols_to_keep].copy()
        
        return df

    @staticmethod
    def detect_fractals(df):
        """Detecta fractales de 5 velas (Swing Highs y Swing Lows)"""
        highs = []
        lows = []
        
        for i in range(2, len(df) - 2):
            # Swing High: La vela del centro es más alta que las 2 anteriores y las 2 siguientes
            if df['high'][i] > df['high'][i-1] and df['high'][i] > df['high'][i-2] and \
               df['high'][i] > df['high'][i+1] and df['high'][i] > df['high'][i+2]:
                highs.append({'index': i, 'price': df['high'][i], 'time': df['time'][i]})
            
            # Swing Low: La vela del centro es más baja que las 2 anteriores y las 2 siguientes
            if df['low'][i] < df['low'][i-1] and df['low'][i] < df['low'][i-2] and \
               df['low'][i] < df['low'][i+1] and df['low'][i] < df['low'][i+2]:
                lows.append({'index': i, 'price': df['low'][i], 'time': df['time'][i]})
                
        return highs, lows

    @staticmethod
    def determine_structure(highs, lows):
        """Determina la tendencia actual basándose en HH/HL LH/LL"""
        if len(highs) < 2 or len(lows) < 2:
            return "NEUTRAL", None, None
        
        last_h = highs[-1]['price']
        prev_h = highs[-2]['price']
        last_l = lows[-1]['price']
        prev_l = lows[-2]['price']
        
        if last_h > prev_h and last_l > prev_l:
            return "BULLISH", last_h, last_l
        elif last_h < prev_h and last_l < prev_l:
            return "BEARISH", last_h, last_l
        
        return "NEUTRAL", last_h, last_l

    @staticmethod
    def find_order_block(df, highs, lows, trend):
        """Identifica el último Order Block (última vela contraria antes de un quiebre)"""
        if trend == "BULLISH":
            # BOS alcista: el precio superó el último Swing High
            # Buscamos el último Swing Low y la vela bajista antes del movimiento alcista
            last_low_idx = lows[-1]['index']
            for i in range(last_low_idx, 0, -1):
                if df['close'][i] < df['open'][i]: # Vela bajista
                    return {
                        'type': 'BULLISH_OB',
                        'high': df['high'][i],
                        'low': df['low'][i],
                        'price': df['low'][i]
                    }
        elif trend == "BEARISH":
            # BOS bajista: el precio rompió el último Swing Low
            last_high_idx = highs[-1]['index']
            for i in range(last_high_idx, 0, -1):
                if df['close'][i] > df['open'][i]: # Vela alcista
                    return {
                        'type': 'BEARISH_OB',
                        'high': df['high'][i],
                        'low': df['low'][i],
                        'price': df['high'][i]
                    }
        return None

    @staticmethod
    def find_supply_demand_zones(df, imbalance_threshold=1.5):
        """
        Identifica zonas de Supply & Demand basadas en Smart Money Concepts.
        Busca movimientos impulsivos fuertes y marca la vela previa (base) como zona.
        
        Args:
            df: DataFrame con velas ('open', 'high', 'low', 'close')
            imbalance_threshold: Multiplicador sobre el cuerpo promedio para considerar una vela como 'impulsiva'.
        
        Returns:
            list de dicts con las zonas activas (no mitigadas):
            [{'type': 'DEMAND', 'high': zone_high, 'low': zone_low, 'index': i}, ...]
        """
        if len(df) < 5:
            return []

        # Calculamos el tamaño del cuerpo (Body) y mechas para cada vela
        df['body_size'] = abs(df['close'] - df['open'])
        # Calculamos el promedio del body en las últimas 20 velas para tener un baseline dinámico
        df['avg_body'] = df['body_size'].rolling(window=20, min_periods=1).mean()

        zones = []
        
        # Necesitamos dejar margen al final para comprobar si el FVG sigue activo (Vela 3 vs Vela 1)
        for i in range(2, len(df) - 2):
            # 1. Movimiento Impulsivo Alcista (Creación de Demanda)
            # La vela actual (i+1) es fuertemente alcista y deja imbalance con respecto a (i-1)
            is_bullish_impulse = (
                df['close'][i+1] > df['open'][i+1] and 
                df['body_size'][i+1] > (df['avg_body'][i] * float(imbalance_threshold))
            )
            
            if is_bullish_impulse:
                # Comprobamos FVG (Fair Value Gap): Low de vela 3 > High de vela 1
                # Vela 1: i, Vela 2 (Impulso): i+1, Vela 3: i+2
                if df['low'][i+2] > df['high'][i]:
                    # Tenemos un Imbalance alcista. El bloque de origen de este movimiento es la vela 'i' o conjunto de velas.
                    # Simplificando a Smart Money: La zona de DEMANDA es la última vela bajista antes del impulso,
                    # o toda la vela base (i) si generó el FVG.
                    
                    # Buscamos hacia atrás (max 3 velas) la última vela bajista como la 'Base'
                    base_idx = i
                    for b in range(i, max(0, i-3), -1):
                        if df['close'][b] < df['open'][b]:
                            base_idx = b
                            break
                    
                    zone_high = df['high'][base_idx]
                    zone_low = df['low'][base_idx]
                    zones.append({
                        'type': 'DEMAND',
                        'high': zone_high,
                        'low': zone_low,
                        'index': base_idx,
                        'mitigated': False
                    })
            
            # 2. Movimiento Impulsivo Bajista (Creación de Supply)
            is_bearish_impulse = (
                df['close'][i+1] < df['open'][i+1] and 
                df['body_size'][i+1] > (df['avg_body'][i] * float(imbalance_threshold))
            )
            
            if is_bearish_impulse:
                # Comprobamos FVG bajista: High de vela 3 < Low de vela 1
                if df['high'][i+2] < df['low'][i]:
                    # Zona de SUPPLY: Última vela alcista (o vela base) antes del impulso bajista.
                    base_idx = i
                    for b in range(i, max(0, i-3), -1):
                        if df['close'][b] > df['open'][b]:
                            base_idx = b
                            break
                    
                    zone_high = df['high'][base_idx]
                    zone_low = df['low'][base_idx]
                    zones.append({
                        'type': 'SUPPLY',
                        'high': zone_high,
                        'low': zone_low,
                        'index': base_idx,
                        'mitigated': False
                    })

        # Paso Final: Eliminar zonas que ya fueron mitigadas por la acción del precio posterior.
        # Una zona de Demanda se mitiga si el precio cae por debajo de su 'high'.
        # Una zona de Supply se mitiga si el precio sube por encima de su 'low'.
        active_zones = []
        for z in zones:
            start_idx = z['index'] + 1
            mitigated = False
            for j in range(start_idx, len(df)):
                if z['type'] == 'DEMAND' and df['low'][j] <= z['high']:
                    mitigated = True
                    break
                elif z['type'] == 'SUPPLY' and df['high'][j] >= z['low']:
                    mitigated = True
                    break
            
            if not mitigated:
                active_zones.append(z)

        return active_zones

    @staticmethod
    def check_choch(df_ltf, trend_htf, lookback=5):
        """
        Detecta el Change of Character en temporalidad menor.
        Busca si hubo un quiebre en las últimas 'lookback' velas.
        """
        if len(df_ltf) < 15:
            return False, 0
            
        highs, lows = PriceActionAnalyzer.detect_fractals(df_ltf)
        if not highs or not lows:
            return False, 0
            
        # Revisamos las últimas 'lookback' velas para ver si alguna cerró por encima/debajo del fractal
        # No usamos solo close[-1] para dar persistencia
        for i in range(1, lookback + 1):
            idx = -i
            price_at_idx = df_ltf['close'].iloc[idx]
            
            if trend_htf == "BULLISH":
                # CHoCH alcista: rompe el último swing high de LTF
                # Buscamos el high que existía ANTES de esa vela o en esa ventana
                last_high = highs[-1]['price']
                if price_at_idx > last_high:
                    return True, last_high
            elif trend_htf == "BEARISH":
                # CHoCH bajista: rompe el último swing low de LTF
                last_low = lows[-1]['price']
                if price_at_idx < last_low:
                    return True, last_low
                    
        return False, 0
    @staticmethod
    def calculate_smi(df, q=5, r=20, s=5, u=5):
        """
        Calcula el Stochastic Momentum Index (SMI) siguiendo la lógica MQL5.
        Retorna los últimos valores de SMI y Signal para detección de cruces.
        """
        if df is None or len(df) < (q + r + s + u):
            return None, None

        # Trabajar con copia para no contaminar el DataFrame original
        calc = df[['close', 'high', 'low']].copy()

        # 1. HH y LL del periodo Q
        calc['hh'] = calc['high'].rolling(window=q).max()
        calc['ll'] = calc['low'].rolling(window=q).min()
        
        # 2. Distancia al punto medio y Rango
        calc['midpoint'] = (calc['hh'] + calc['ll']) / 2.0
        calc['ds'] = calc['close'] - calc['midpoint']
        calc['range'] = calc['hh'] - calc['ll']
        
        # 3. Primer suavizado (EMA R)
        # Nota: Usamos adjust=False para coincidir con el cálculo recursivo de MQL5
        ema_ds_r = calc['ds'].ewm(span=r, adjust=False).mean()
        ema_range_r = calc['range'].ewm(span=r, adjust=False).mean()
        
        # 4. Segundo suavizado (EMA S)
        ema2_ds_s = ema_ds_r.ewm(span=s, adjust=False).mean()
        ema2_range_s = ema_range_r.ewm(span=s, adjust=False).mean()
        
        # 5. Calcular SMI
        # SMI = 100 * (EMA2_ds / (0.5 * EMA2_range))
        calc['smi'] = 100.0 * (ema2_ds_s / (0.5 * ema2_range_s))
        calc['smi'] = calc['smi'].replace([np.inf, -np.inf], 0).fillna(0)
        
        # 6. Línea de Señal (EMA U sobre SMI)
        calc['smi_signal'] = calc['smi'].ewm(span=u, adjust=False).mean()
        
        if len(calc) < 5:
            return None
            
        # Retornamos las series completas (últimas velas) para que el scanner busque cruces recientes
        return {
            'smi': calc['smi'].tolist(),
            'signal': calc['smi_signal'].tolist()
        }

    @staticmethod
    def calculate_stochastic(df, k_period=14, d_period=3, slowing=3):
        """
        Calcula el Estocástico Clásico (Slow Stochastic).
        %K = SMA( (Close - LL) / (HH - LL) * 100, slowing )
        %D = SMA(%K, d_period)
        Retorna: (k_actual, d_actual, k_previo, d_previo)
        """
        min_bars = k_period + slowing + d_period
        if df is None or len(df) < min_bars:
            logger.warning(f"Datos insuficientes para Stochastic: {len(df) if df is not None else 0} < {min_bars}")
            return None, None, None, None

        # Trabajar con copia para no contaminar el DataFrame original
        calc = df[['close', 'high', 'low']].copy()

        # 1. Highest High y Lowest Low del periodo K
        calc['hh'] = calc['high'].rolling(window=k_period).max()
        calc['ll'] = calc['low'].rolling(window=k_period).min()

        # 2. %K rápido (sin suavizar)
        calc['fast_k'] = ((calc['close'] - calc['ll']) / (calc['hh'] - calc['ll'])) * 100.0
        calc['fast_k'] = calc['fast_k'].replace([np.inf, -np.inf], 50.0).fillna(50.0)

        # 3. %K lento (suavizado con SMA de slowing)
        calc['k'] = calc['fast_k'].rolling(window=slowing).mean()

        # 4. %D (SMA de %K)
        calc['d'] = calc['k'].rolling(window=d_period).mean()

        # Rellenar NaN residuales
        calc['k'] = calc['k'].fillna(50.0)
        calc['d'] = calc['d'].fillna(50.0)

        if len(calc) < 5:
            return None

        return {
            'k': calc['k'].tolist(),
            'd': calc['d'].tolist()
        }
