import logging
import MetaTrader5 as mt5
import threading
from concurrent.futures import ThreadPoolExecutor
import time
from datetime import datetime, time as dtime, timedelta
from django.conf import settings

logger = logging.getLogger(__name__)

class MT5Engine:
    _background_thread = None
    _stop_event = threading.Event()
    _initial_deposit_cache = None
    _current_terminal_path = None  # Path de la terminal actualmente conectada
    _lock = threading.Lock()  # Lock para switch seguro entre terminales
    _last_mt5_error_log_ts = 0.0  # Throttle: evita flood de logs cuando MT5 no responde

    @staticmethod
    def initialize(path=None):
        try:
            # Si no se pasa path, buscar la terminal activa en DB
            if path is None:
                try:
                    from .models import MT5Terminal
                    active = MT5Terminal.get_active()
                    if active and active.terminal_path:
                        path = active.terminal_path
                        logger.info(f"Usando terminal activa de DB: {active.name} → {path}")
                except Exception:
                    pass  # No hay terminales registradas, usar default

            if path:
                logger.info(f"Intentando conectar con MetaTrader 5 (path: {path})...")
                if not mt5.initialize(path=path):
                    logger.error(f"Fallo al inicializar MT5 con path {path}. Error: {mt5.last_error()}")
                    return False
                MT5Engine._current_terminal_path = path
            else:
                logger.info("Intentando conectar con MetaTrader 5 (default)...")
                if not mt5.initialize():
                    logger.error(f"Fallo al inicializar MT5. Código de error: {mt5.last_error()}")
                    return False
                MT5Engine._current_terminal_path = 'default'
            
            # Iniciar el Monitor de Riesgo en segundo plano si no está corriendo
            MT5Engine.start_risk_monitor()
            
            # Iniciar el Scanner de Market Watch
            from .scanner import MarketWatchScanner
            MarketWatchScanner.start()
            
            # Login opcional si se provee en .env
            mt5_account = getattr(settings, 'MT5_ACCOUNT', None)
            if mt5_account:
                password = getattr(settings, 'MT5_PASSWORD', '')
                server = getattr(settings, 'MT5_SERVER', '')
                authorized = mt5.login(int(mt5_account), password=password, server=server)
                if not authorized:
                    logger.error(f"Fallo al logear en la cuenta MT5 {mt5_account}. Error: {mt5.last_error()}")
                    return False
                logger.info(f"Conexión exitosa y autenticada en cuenta MT5 {mt5_account}.")
            else:
                logger.info("Conectado a la terminal MT5 abierta actualmente (sin login explícito).")
            return True
        except Exception as e:
            logger.exception(f"Excepción crítica al inicializar MT5: {str(e)}")
            return False

    @staticmethod
    def start_risk_monitor():
        if MT5Engine._background_thread is None or not MT5Engine._background_thread.is_alive():
            MT5Engine._stop_event.clear()
            MT5Engine._background_thread = threading.Thread(target=MT5Engine._risk_monitor_loop, daemon=True)
            MT5Engine._background_thread.start()
            logger.info("Monitor de Riesgo Persistente (Backend) INICIADO.")

    @staticmethod
    def _risk_monitor_loop():
        # Importación diferida para evitar ciclos
        from .models import RiskSettings
        from django.db import close_old_connections
        
        logger.info("Hilo de Risk Monitor entrando en bucle...")
        while not MT5Engine._stop_event.is_set():
            try:
                close_old_connections()
                settings = RiskSettings.get_settings()

                if settings.is_profit_monitor_active or settings.is_stop_loss_monitor_active:
                    logger.debug(f"[Risk Monitor] Activo — TP: {settings.profit_target_percent}% | SL: {settings.global_stop_loss_percent}%")

                    # Chequeo de Profit
                    if settings.is_profit_monitor_active:
                        result_tp = MT5Engine.monitor_account_performance('profit', float(settings.profit_target_percent))
                        if result_tp.get("triggered"):
                            logger.warning(f"[Risk Monitor] ¡META DE PROFIT ALCANZADA! {result_tp.get('message')}")
                            settings.is_profit_monitor_active = False
                            settings.save()
                        elif result_tp.get("closed") == -1:
                            # MT5 no responde — throttle: loguear máximo 1 vez por minuto
                            now_ts = time.time()
                            if now_ts - MT5Engine._last_mt5_error_log_ts >= 60:
                                logger.warning("[Risk Monitor] MT5 no responde. Reintentando en próximo ciclo. (Este mensaje se suprime 60s)")
                                MT5Engine._last_mt5_error_log_ts = now_ts
                            time.sleep(2)
                            continue

                    # Chequeo de Stop Loss
                    if settings.is_stop_loss_monitor_active:
                        result_sl = MT5Engine.monitor_account_performance('loss', float(settings.global_stop_loss_percent))
                        if result_sl.get("triggered"):
                            logger.error(f"[Risk Monitor] ¡STOP LOSS GLOBAL ALCANZADO! {result_sl.get('message')}")
                            settings.is_stop_loss_monitor_active = False
                            settings.is_trading_active = False
                            settings.save()
                        elif result_sl.get("closed") == -1:
                            now_ts = time.time()
                            if now_ts - MT5Engine._last_mt5_error_log_ts >= 60:
                                logger.warning("[Risk Monitor] MT5 no responde (SL check). (Este mensaje se suprime 60s)")
                                MT5Engine._last_mt5_error_log_ts = now_ts
                            time.sleep(2)
                            continue

                # --- LÓGICA: Monitor de Símbolos ---
                from .models import SymbolProfitTarget
                from django.db.models import Q

                # Recopilar profits actuales una sola vez para todos los monitores
                raw_positions = mt5.positions_get()
                symbol_profits = {}
                if raw_positions:
                    for pos in raw_positions:
                        symbol_profits[pos.symbol] = symbol_profits.get(pos.symbol, 0.0) + pos.profit

                # Buscamos targets que tengan activo el profit, la pérdida O el trailing
                active_symbol_targets = SymbolProfitTarget.objects.filter(
                    Q(is_profit_active=True) | Q(is_loss_active=True) | Q(is_trailing_active=True)
                )

                for target in active_symbol_targets:
                    current_sym_profit = symbol_profits.get(target.symbol, 0.0)

                    # 1. Chequeo de Profit fijo
                    if target.is_profit_active and current_sym_profit >= float(target.target_profit_usd):
                        logger.info(f"Target de PROFIT alcanzado para {target.symbol}: {current_sym_profit} >= {target.target_profit_usd}. Cerrando...")
                        MT5Engine.close_positions_by_symbol(target.symbol)
                        target.is_profit_active = False
                        target.save()
                        continue

                    # 2. Chequeo de Pérdida fija
                    if target.is_loss_active and current_sym_profit <= -abs(float(target.target_loss_usd)):
                        logger.warning(f"Límite de PÉRDIDA alcanzado para {target.symbol}: {current_sym_profit} <= -{target.target_loss_usd}. Cerrando...")
                        MT5Engine.close_positions_by_symbol(target.symbol)
                        target.is_loss_active = False
                        target.save()
                        continue

                    # 3. Trailing Stop en USD
                    if target.is_trailing_active:
                        trail_dist = float(target.trail_distance_usd)
                        peak = float(target.trail_peak_usd)

                        # Actualizar el pico máximo si el profit actual lo supera
                        if current_sym_profit > peak:
                            target.trail_peak_usd = current_sym_profit
                            target.save(update_fields=['trail_peak_usd'])
                            peak = current_sym_profit
                            logger.debug(f"[Trailing] {target.symbol}: nuevo pico ${peak:.2f}")

                        # Activar cierre solo si alguna vez se alcanzó la distancia mínima de trail
                        # y el precio retrocedió desde el pico más de trail_dist USD
                        if peak >= trail_dist and current_sym_profit < peak - trail_dist:
                            logger.warning(
                                f"[Trailing Stop] {target.symbol}: profit ${current_sym_profit:.2f} "
                                f"retrocedió desde pico ${peak:.2f} más de ${trail_dist:.2f}. Cerrando..."
                            )
                            MT5Engine.close_positions_by_symbol(target.symbol)
                            target.is_trailing_active = False
                            target.trail_peak_usd = 0.00
                            target.save()
                
            except Exception as e:
                logger.error(f"Error en el bucle del monitor de riesgo: {str(e)}")
            
            time.sleep(2)

    @staticmethod
    def get_account_info():
        try:
            if not mt5.terminal_info():
                logger.warning("Terminal MT5 no responde. Intentando re-inicializar...")
                if not MT5Engine.initialize():
                    return None
            
            account_info = mt5.account_info()
            if account_info is None:
                logger.error(f"No se pudo obtener información de la cuenta. Error: {mt5.last_error()}")
                return None
                
            info_dict = account_info._asdict()
            logger.debug(f"Account Info recuperado. Balance: {info_dict.get('balance')} | Equidad: {info_dict.get('equity')}")
            return info_dict
        except Exception as e:
            logger.exception(f"Excepción al obtener Account Info: {str(e)}")
            return None
            
    @staticmethod
    def close_all_positions():
        try:
            logger.info("INICIO - Solicitud de Cierre Masivo de Posiciones")
            positions = mt5.positions_get()
            if positions is None or len(positions) == 0:
                logger.info("No hay posiciones abiertas para cerrar.")
                return 0
            
            closed_count = MT5Engine._close_all_list(positions)
            
            logger.info(f"FIN - Cierre Masivo. Posiciones cerradas: {closed_count}/{len(positions)}")
            return closed_count
            
        except Exception as e:
            logger.exception(f"Excepción crítica durante el cierre de posiciones: {str(e)}")
            return -1

    @staticmethod
    def get_open_positions_grouped():
        try:
            positions = mt5.positions_get()
            if positions is None:
                logger.info("get_open_positions_grouped: No hay posiciones abiertas (None)")
                return []
                
            from .models import SymbolProfitTarget
            targets = {t.symbol: t for t in SymbolProfitTarget.objects.all()}
            
            groups = {}
            for pos in positions:
                sym = pos.symbol
                if sym not in groups:
                    target_obj = targets.get(sym)
                    groups[sym] = {
                        "symbol": sym,
                        "count": 0,
                        "volume": 0.0,
                        "profit": 0.0,
                        "buy_count": 0,
                        "buy_volume": 0.0,
                        "buy_profit": 0.0,
                        "sell_count": 0,
                        "sell_volume": 0.0,
                        "sell_profit": 0.0,
                        "symbol_target_usd": float(target_obj.target_profit_usd) if target_obj else 0.0,
                        "symbol_target_active": target_obj.is_profit_active if target_obj else False,
                        "symbol_loss_usd": float(target_obj.target_loss_usd) if target_obj else 0.0,
                        "symbol_loss_active": target_obj.is_loss_active if target_obj else False,
                        "trailing_active": target_obj.is_trailing_active if target_obj else False,
                        "trail_distance_usd": float(target_obj.trail_distance_usd) if target_obj else 5.0,
                        "trail_peak_usd": float(target_obj.trail_peak_usd) if target_obj else 0.0,
                    }
                groups[sym]["count"] += 1
                groups[sym]["volume"] += pos.volume
                groups[sym]["profit"] += pos.profit
                
                # Desglose por dirección BUY / SELL
                if pos.type == mt5.POSITION_TYPE_BUY:
                    groups[sym]["buy_count"] += 1
                    groups[sym]["buy_volume"] += pos.volume
                    groups[sym]["buy_profit"] += pos.profit
                elif pos.type == mt5.POSITION_TYPE_SELL:
                    groups[sym]["sell_count"] += 1
                    groups[sym]["sell_volume"] += pos.volume
                    groups[sym]["sell_profit"] += pos.profit
            
            logger.debug(f"get_open_positions_grouped: {len(groups)} símbolos agrupados")
            return list(groups.values())
        except Exception as e:
            logger.exception(f"Error agrupando posiciones: {str(e)}")
            return []

    @staticmethod
    def set_global_breakeven():
        try:
            logger.info("INICIO - Set Global Breakeven")
            positions = mt5.positions_get()
            if not positions:
                return 0
                
            modified_count = 0
            for pos in positions:
                if pos.profit > 0 and abs(pos.sl - pos.price_open) > 1e-6:
                    request = {
                        "action": mt5.TRADE_ACTION_SLTP,
                        "position": pos.ticket,
                        "symbol": pos.symbol,
                        "sl": pos.price_open,
                        "tp": pos.tp,
                        "magic": pos.magic
                    }
                    res = mt5.order_send(request)
                    if res is None:
                        err = mt5.last_error()
                        logger.error(f"Fallo BreakEven ticket {pos.ticket}. order_send devolvió None. MT5 Error: {err}")
                    elif res.retcode == mt5.TRADE_RETCODE_DONE:
                        logger.info(f"BreakEven seteado exitosamente para ticket {pos.ticket}")
                        modified_count += 1
                    elif res.retcode == mt5.TRADE_RETCODE_NO_CHANGES:
                        logger.info(f"BreakEven sin cambios para ticket {pos.ticket}. Ya estaba en precio de entrada.")
                    else:
                        logger.warning(f"Fallo BreakEven ticket {pos.ticket}. Retcode: {res.retcode}, Comentario: {res.comment}")
            
            logger.info(f"FIN - BreakEven. Modificados: {modified_count}")
            return modified_count
        except Exception as e:
            logger.exception(f"Error en Breakeven: {str(e)}")
            return -1

    @staticmethod
    def set_breakeven_by_symbol(symbol):
        """Mueve el SL al precio de apertura para posiciones ganadoras de un símbolo específico."""
        try:
            logger.info(f"INICIO - Set Breakeven para símbolo: {symbol}")
            positions = mt5.positions_get(symbol=symbol)
            if not positions:
                logger.info(f"No hay posiciones abiertas para {symbol} para aplicar Breakeven.")
                return 0
                
            modified_count = 0
            for pos in positions:
                if pos.profit > 0 and abs(pos.sl - pos.price_open) > 1e-6:
                    request = {
                        "action": mt5.TRADE_ACTION_SLTP,
                        "position": pos.ticket,
                        "symbol": pos.symbol,
                        "sl": pos.price_open,
                        "tp": pos.tp,
                        "magic": pos.magic
                    }
                    res = mt5.order_send(request)
                    if res is None:
                        err = mt5.last_error()
                        logger.error(f"Fallo BreakEven ticket {pos.ticket} ({symbol}). order_send devolvió None. MT5 Error: {err}")
                    elif res.retcode == mt5.TRADE_RETCODE_DONE:
                        logger.info(f"BreakEven seteado exitosamente para ticket {pos.ticket} ({symbol})")
                        modified_count += 1
                    elif res.retcode == mt5.TRADE_RETCODE_NO_CHANGES:
                        logger.info(f"BreakEven sin cambios para ticket {pos.ticket} ({symbol}). Ya estaba en precio de entrada.")
                    else:
                        logger.warning(f"Fallo BreakEven ticket {pos.ticket} ({symbol}). Retcode: {res.retcode}, Comentario: {res.comment}")
            
            logger.info(f"FIN - BreakEven {symbol}. Modificados: {modified_count}")
            return modified_count
        except Exception as e:
            logger.exception(f"Error en Breakeven por símbolo {symbol}: {str(e)}")
            return -1

    @staticmethod
    def _close_all_list(positions):
        try:
            from .models import RiskSettings
            settings_obj = RiskSettings.get_settings()
            deviation = settings_obj.max_deviation
            
            def close_single_position(pos):
                tick = mt5.symbol_info_tick(pos.symbol)
                if not tick:
                    logger.error(f"Tick no disponible para {pos.symbol} en cierre paralelo.")
                    return False
                    
                price = tick.ask if pos.type == mt5.POSITION_TYPE_SELL else tick.bid
                order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                
                filling_modes = [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]
                for mode in filling_modes:
                    request = {
                        "action": mt5.TRADE_ACTION_DEAL,
                        "symbol": pos.symbol,
                        "volume": pos.volume,
                        "type": order_type,
                        "position": pos.ticket,
                        "price": price,
                        "deviation": deviation,
                        "magic": pos.magic,
                        "comment": "Cierre Paralelo Q-UI",
                        "type_time": mt5.ORDER_TIME_GTC,
                        "type_filling": mode,
                    }
                    result = mt5.order_send(request)
                    if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                        logger.info(f"Éxito: Ticket {pos.ticket} cerrado en paralelo (mode {mode})")
                        return True
                return False

            logger.info(f"Iniciando cierre paralelo de {len(positions)} posiciones...")
            # Limitamos a 10 hilos para no saturar la terminal/broker
            with ThreadPoolExecutor(max_workers=10) as executor:
                results = list(executor.map(close_single_position, positions))
            
            closed_count = sum(1 for r in results if r)
            return closed_count
        except Exception as e:
            logger.exception(f"Error en _close_all_list (paralelo): {str(e)}")
            return -1

    @staticmethod
    def close_positions_by_symbol(symbol):
        try:
            logger.info(f"Cierre por Símbolo INICIADO: {symbol}")
            from .models import RiskSettings
            settings_obj = RiskSettings.get_settings()
            deviation = settings_obj.max_deviation
            positions = mt5.positions_get(symbol=symbol)
            if positions is None or len(positions) == 0:
                logger.info(f"No hay posiciones abiertas para {symbol}")
                return 0
                
            closed_count = 0
            for pos in positions:
                tick = mt5.symbol_info_tick(pos.symbol)
                if not tick:
                    logger.error(f"No se pudo obtener el tick para {pos.symbol}")
                    continue
                    
                price = tick.ask if pos.type == mt5.POSITION_TYPE_SELL else tick.bid
                order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                
                # Intentar con diferentes filling modes para mayor robustez
                filling_modes = [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]
                success = False
                
                for mode in filling_modes:
                    request = {
                        "action": mt5.TRADE_ACTION_DEAL,
                        "symbol": pos.symbol,
                        "volume": pos.volume,
                        "type": order_type,
                        "position": pos.ticket,
                        "price": price,
                        "deviation": deviation,
                        "magic": pos.magic,
                        "comment": f"Cierre {symbol} (Q-UI)",
                        "type_time": mt5.ORDER_TIME_GTC,
                        "type_filling": mode,
                    }
                    
                    result = mt5.order_send(request)
                    if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                        logger.info(f"ÉXITO al cerrar ticket {pos.ticket} ({pos.symbol}) con mode {mode}")
                        closed_count += 1
                        success = True
                        break
                    else:
                        error_msg = f"Fallo parcial ticket {pos.ticket} con mode {mode}. Retcode: {result.retcode if result else 'N/A'}"
                        if result:
                            logger.warning(f"{error_msg}. Comentario MT5: {result.comment}")
                        else:
                            logger.warning(error_msg)
                            
                if not success:
                    logger.error(f"FALLO CRÍTICO: No se pudo cerrar ticket {pos.ticket} después de intentar todos los modos.")
            
            logger.info(f"Cierre por Símbolo {symbol} COMPLETADO. Total cerradas: {closed_count}")
            return closed_count
        except Exception as e:
            logger.exception(f"Error cerrando {symbol}: {str(e)}")
            return -1

    @staticmethod
    def close_positions_by_symbol_direction(symbol, direction):
        """Cierra solo las posiciones BUY o SELL de un símbolo específico."""
        try:
            dir_upper = direction.upper()
            mt5_type = mt5.POSITION_TYPE_BUY if dir_upper == "BUY" else mt5.POSITION_TYPE_SELL
            logger.info(f"Cierre direccional INICIADO: {symbol} dirección={dir_upper}")
            
            from .models import RiskSettings
            settings_obj = RiskSettings.get_settings()
            deviation = settings_obj.max_deviation
            
            positions = mt5.positions_get(symbol=symbol)
            if positions is None or len(positions) == 0:
                logger.info(f"No hay posiciones abiertas para {symbol}")
                return 0
            
            # Filtrar solo la dirección solicitada
            filtered = [p for p in positions if p.type == mt5_type]
            logger.info(f"Posiciones {dir_upper} encontradas para {symbol}: {len(filtered)} de {len(positions)} totales")
            
            if len(filtered) == 0:
                logger.info(f"No hay posiciones {dir_upper} para {symbol}")
                return 0
            
            closed_count = 0
            for pos in filtered:
                tick = mt5.symbol_info_tick(pos.symbol)
                if not tick:
                    logger.error(f"No se pudo obtener el tick para {pos.symbol}")
                    continue
                
                price = tick.ask if pos.type == mt5.POSITION_TYPE_SELL else tick.bid
                order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                
                filling_modes = [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]
                success = False
                
                for mode in filling_modes:
                    request = {
                        "action": mt5.TRADE_ACTION_DEAL,
                        "symbol": pos.symbol,
                        "volume": pos.volume,
                        "type": order_type,
                        "position": pos.ticket,
                        "price": price,
                        "deviation": deviation,
                        "magic": pos.magic,
                        "comment": f"Cierre {dir_upper} {symbol} (Q-UI)",
                        "type_time": mt5.ORDER_TIME_GTC,
                        "type_filling": mode,
                    }
                    
                    result = mt5.order_send(request)
                    if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                        logger.info(f"ÉXITO al cerrar ticket {pos.ticket} ({dir_upper} {pos.symbol}) vol={pos.volume} con mode {mode}")
                        closed_count += 1
                        success = True
                        break
                    else:
                        error_msg = f"Fallo parcial ticket {pos.ticket} con mode {mode}. Retcode: {result.retcode if result else 'N/A'}"
                        if result:
                            logger.warning(f"{error_msg}. Comentario MT5: {result.comment}")
                        else:
                            logger.warning(error_msg)
                
                if not success:
                    logger.error(f"FALLO CRÍTICO: No se pudo cerrar ticket {pos.ticket} ({dir_upper}) después de intentar todos los modos.")
            
            logger.info(f"Cierre direccional {symbol} {dir_upper} COMPLETADO. Cerradas: {closed_count}/{len(filtered)}")
            return closed_count
        except Exception as e:
            logger.exception(f"Error cerrando {symbol} dirección {direction}: {str(e)}")
            return -1

    @staticmethod
    def close_winning_positions_by_symbol(symbol):
        """Cierra solo las posiciones ganadoras (profit > 0) de un símbolo específico."""
        try:
            logger.info(f"Cierre de ganancias INICIADO: {symbol}")
            
            from .models import RiskSettings
            settings_obj = RiskSettings.get_settings()
            deviation = settings_obj.max_deviation
            
            positions = mt5.positions_get(symbol=symbol)
            if positions is None or len(positions) == 0:
                logger.info(f"No hay posiciones abiertas para {symbol}")
                return 0
            
            # Filtrar solo posiciones con profit positivo
            filtered = [p for p in positions if p.profit > 0]
            logger.info(f"Posiciones GANADORAS encontradas para {symbol}: {len(filtered)} de {len(positions)} totales")
            
            if len(filtered) == 0:
                logger.info(f"No hay posiciones en ganancia para {symbol}")
                return 0
            
            closed_count = 0
            for pos in filtered:
                tick = mt5.symbol_info_tick(pos.symbol)
                if not tick:
                    logger.error(f"No se pudo obtener el tick para {pos.symbol}")
                    continue
                
                price = tick.ask if pos.type == mt5.POSITION_TYPE_SELL else tick.bid
                order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                
                filling_modes = [mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN]
                success = False
                
                for mode in filling_modes:
                    request = {
                        "action": mt5.TRADE_ACTION_DEAL,
                        "symbol": pos.symbol,
                        "volume": pos.volume,
                        "type": order_type,
                        "position": pos.ticket,
                        "price": price,
                        "deviation": deviation,
                        "magic": pos.magic,
                        "comment": f"Cierre Ganancia {symbol} (Q-UI)",
                        "type_time": mt5.ORDER_TIME_GTC,
                        "type_filling": mode,
                    }
                    
                    result = mt5.order_send(request)
                    if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                        logger.info(f"ÉXITO al cerrar ticket {pos.ticket} (Ganancia {pos.symbol}) vol={pos.volume} con mode {mode}")
                        closed_count += 1
                        success = True
                        break
                    else:
                        error_msg = f"Fallo parcial ticket {pos.ticket} con mode {mode}. Retcode: {result.retcode if result else 'N/A'}"
                        if result:
                            logger.warning(f"{error_msg}. Comentario MT5: {result.comment}")
                        else:
                            logger.warning(error_msg)
                
                if not success:
                    logger.error(f"FALLO CRÍTICO: No se pudo cerrar ticket {pos.ticket} (Ganancia) después de intentar todos los modos.")
            
            logger.info(f"Cierre de ganancias {symbol} COMPLETADO. Cerradas: {closed_count}/{len(filtered)}")
            return closed_count
        except Exception as e:
            logger.exception(f"Error cerrando ganancias de {symbol}: {str(e)}")
            return -1
            
            
    @staticmethod
    def monitor_account_performance(mode, percent):
        """
        Monitorea el rendimiento de la cuenta (Profit o Loss) y cierra todo si se alcanza el % objetivo.
        mode: 'profit' o 'loss'
        percent: % positivo (para profit) o % positivo (para pérdida, se tratará como negativo internamente)
        """
        try:
            from .models import RiskSettings
            settings_obj = RiskSettings.get_settings()
            manual_balance = float(settings_obj.manual_initial_balance)
            
            account_info = mt5.account_info()
            if not account_info:
                # No loguear aquí — el caller (_risk_monitor_loop) lo hace con throttle para evitar flood
                return {"closed": -1, "message": "MT5 no responde"}
                
            balance = account_info.balance
            credit = account_info.credit
            equity = account_info.equity
            
            # BASE DE CAPITAL: Solo el capital real del usuario (sin crédito)
            base_capital = manual_balance if manual_balance > 0 else balance
            
            # PROFIT FLOTANTE: equity - (balance + credit)
            current_floating_profit = equity - (balance + credit)
            
            if mode == 'profit':
                target_amount = base_capital * (percent / 100.0)
                triggered = current_floating_profit >= target_amount
                msg_status = f"Profit: ${current_floating_profit:.2f} / Meta: ${target_amount:.2f} ({percent}%)"
                msg_trigger = f"¡Meta alcanzada! {msg_status}. Se cerraron las posiciones."
            else: # loss
                # El porcentaje de pérdida se asume positivo en el input (ej: 30%)
                limit_amount = -abs(base_capital * (percent / 100.0))
                triggered = current_floating_profit <= limit_amount
                msg_status = f"Pérdida: ${current_floating_profit:.2f} / Límite SL: ${limit_amount:.2f} ({percent}%)"
                msg_trigger = f"¡STOP LOSS ALCANZADO! {msg_status}. Liquidando cuenta por seguridad."

            if triggered:
                logger.warning(f"[{mode.upper()} Monitor] DISPARADO: {msg_status}")
                closed = MT5Engine.close_all_positions()
                return {
                    "closed": closed,
                    "triggered": True,
                    "message": msg_trigger
                }
            else:
                return {
                    "closed": 0,
                    "triggered": False,
                    "message": msg_status
                }
        except Exception as e:
            logger.exception(f"Error en Monitor de Cuenta ({mode}): {str(e)}")
            return {"closed": -1, "message": str(e)}

    @staticmethod
    def close_positions_at_profit(profit_percent):
        """Mantenido por compatibilidad si algo más lo llama, pero redirigido al nuevo monitor."""
        return MT5Engine.monitor_account_performance('profit', profit_percent)

    @staticmethod
    def get_daily_metrics():
        try:
            account_info = mt5.account_info()
            if not account_info:
                return {"daily_pl_percent": 0.0, "initial_balance_today": 0.0}

            # Sincronización de hora del broker usando símbolo configurable
            from .models import RiskSettings
            risk_obj = RiskSettings.get_settings()
            check_symbol = risk_obj.default_broker_symbol
            pos_any = mt5.positions_get()
            if pos_any and len(pos_any) > 0:
                check_symbol = pos_any[0].symbol
            
            tick = mt5.symbol_info_tick(check_symbol)
            if tick:
                broker_now = datetime.fromtimestamp(tick.time)
            else:
                broker_now = datetime.now() # Fallback a hora local si falla el tick
                
            # Inicio del día basado en la hora del BROKER
            broker_start_day = datetime.combine(broker_now.date(), dtime.min)
            
            # Pedimos el historial solo de HOY
            history_deals = mt5.history_deals_get(broker_start_day, datetime.now() + timedelta(hours=1))
            
            daily_realized_profit = 0.0
            if history_deals:
                for deal in history_deals:
                    # Excluir depósitos, retiros y créditos (DEAL_TYPE_BALANCE=2, DEAL_TYPE_CREDIT=3)
                    if deal.type not in [mt5.DEAL_TYPE_BALANCE, mt5.DEAL_TYPE_CREDIT]:
                        # Sumamos profit bruto + comisiones + swaps (esto es el profit NETO)
                        daily_realized_profit += (deal.profit + deal.commission + deal.swap)
            
            current_balance = account_info.balance
            current_credit = account_info.credit
            current_equity = account_info.equity
            
            # Balance real al inicio del día (sin contar el bono/crédito)
            balance_start_day = current_balance - daily_realized_profit
            
            # Capital total al inicio del día (con el bono/crédito)
            initial_capital_today = balance_start_day + current_credit
            
            # CAPITAL INICIAL PERPETUO (Uso de Caché para evitar OOM)
            from .models import RiskSettings
            settings_obj = RiskSettings.get_settings()
            manual_balance = float(settings_obj.manual_initial_balance)
            
            initial_deposit = manual_balance if manual_balance > 0 else 0.0
            
            if initial_deposit <= 0:
                if MT5Engine._initial_deposit_cache is not None:
                    initial_deposit = MT5Engine._initial_deposit_cache
                else:
                    # Buscar solo la primera actividad histórica registrada (Depósito Inicial)
                    from_date_epoch = datetime(2010, 1, 1)
                    deals_all = mt5.history_deals_get(from_date_epoch, datetime.now())
                    if deals_all and len(deals_all) > 0:
                        first_activity_date = None
                        temp_initial = 0.0
                        for deal in deals_all:
                            if deal.type in [mt5.DEAL_TYPE_BALANCE, mt5.DEAL_TYPE_CREDIT]:
                                first_activity_date = datetime.fromtimestamp(deal.time).date()
                                break
                        
                        if first_activity_date:
                            for deal in deals_all:
                                deal_dt = datetime.fromtimestamp(deal.time)
                                if deal_dt.date() == first_activity_date:
                                    if deal.type in [mt5.DEAL_TYPE_BALANCE, mt5.DEAL_TYPE_CREDIT]:
                                        temp_initial += deal.profit
                                elif deal_dt.date() > first_activity_date:
                                    break
                        
                        if temp_initial > 0:
                            MT5Engine._initial_deposit_cache = temp_initial
                            initial_deposit = temp_initial
                            
            # Equidad menos Balance (profit de operaciones abiertas)
            floating_profit = current_equity - current_balance

            # P/L y % calculados en base al depósito inicial para que ambas métricas sean consistentes.
            # Si initial_deposit no está disponible, se usa initial_capital_today como fallback.
            if initial_deposit > 0:
                net_daily_profit_usd = current_equity - initial_deposit
                daily_pl_percent = (net_daily_profit_usd / initial_deposit) * 100
            else:
                # Fallback: calcular contra el capital de inicio del día
                net_daily_profit_usd = current_equity - initial_capital_today
                daily_pl_percent = (net_daily_profit_usd / initial_capital_today) * 100 if initial_capital_today > 0 else 0.0

            logger.info(f"P&L vs Depósito: {net_daily_profit_usd:.2f} USD ({daily_pl_percent:.2f}%) | Base: {initial_deposit} | Flotante: {floating_profit:.2f} | Inicial Hoy: {initial_capital_today}")
            
            return {
                "daily_pl_percent": round(daily_pl_percent, 2),
                "initial_balance_today": round(initial_capital_today, 2),
                "initial_deposit": round(initial_deposit, 2),
                "daily_profit_usd": round(net_daily_profit_usd, 2)
            }
        except Exception as e:
            logger.exception(f"Error calculando métricas diarias sincronizadas: {str(e)}")
            return {"daily_pl_percent": 0.0, "initial_balance_today": 0.0, "daily_profit_usd": 0.0, "initial_deposit": 0.0}

    @staticmethod
    def get_history_deals(period='day'):
        """
        Obtiene el historial de deals para un periodo específico.
        Periodos: 'day', 'week', 'month', 'year', 'all'
        """
        try:
            from .models import RiskSettings
            risk_obj = RiskSettings.get_settings()
            check_symbol = risk_obj.default_broker_symbol
            
            # Sincronización de hora del broker
            tick = mt5.symbol_info_tick(check_symbol)
            broker_now = datetime.fromtimestamp(tick.time) if tick else datetime.now()
            
            # Determinar fecha de inicio según periodo
            if period == 'day':
                start_date = datetime.combine(broker_now.date(), dtime.min)
            elif period == 'week':
                start_date = datetime.combine(broker_now.date() - timedelta(days=broker_now.weekday()), dtime.min)
            elif period == 'month':
                start_date = datetime.combine(broker_now.date().replace(day=1), dtime.min)
            elif period == 'year':
                start_date = datetime.combine(broker_now.date().replace(month=1, day=1), dtime.min)
            elif period == 'all':
                start_date = datetime(2010, 1, 1)
            else:
                # Fallback a 1 día si el periodo no es reconocido o es un número
                days_num = int(period) if isinstance(period, (int, str)) and str(period).isdigit() else 1
                start_date = datetime.combine(broker_now.date(), dtime.min) - timedelta(days=days_num-1)

            # Margen de seguridad para history_deals_get
            history_deals = mt5.history_deals_get(start_date, datetime.now() + timedelta(hours=1))
            
            if history_deals is None:
                logger.warning(f"No se pudieron obtener deals para el periodo: {period}")
                return []

            results = []
            for d in history_deals:
                # Solo trading deals (Buy/Sell) que no sean balance/credit
                if d.type in [mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL]:
                    deal_time_dt = datetime.fromtimestamp(d.time)
                    if deal_time_dt >= start_date:
                        results.append({
                            "ticket": d.ticket,
                            "order": d.order,
                            "time": deal_time_dt.strftime('%Y-%m-%d %H:%M:%S'),
                            "symbol": d.symbol,
                            "type": "BUY" if d.type == mt5.DEAL_TYPE_BUY else "SELL",
                            "entry": "IN" if d.entry == mt5.DEAL_ENTRY_IN else ("OUT" if d.entry == mt5.DEAL_ENTRY_OUT else "IN/OUT"),
                            "volume": d.volume,
                            "price": d.price,
                            "profit": d.profit,
                            "commission": d.commission,
                            "swap": d.swap,
                            "total": round(d.profit + d.commission + d.swap, 2),
                            "comment": d.comment,
                            "magic": d.magic
                        })
            
            results.sort(key=lambda x: x["time"], reverse=True)
            logger.info(f"Historial {period.upper()}: {len(results)} deals recuperados.")
            return results
        except Exception as e:
            logger.exception(f"Error en get_history_deals ({period}): {str(e)}")
            return []

    @staticmethod
    def get_performance_metrics(period='month'):
        """
        Calcula métricas de rendimiento avanzadas basadas en el historial de deals.
        """
        try:
            deals = MT5Engine.get_history_deals(period)
            # Solo consideramos deals de salida (OUT) para calcular Profit/Loss real
            # En MT5, el profit real de una operación se registra en el deal de salida.
            
            closed_trades = [d for d in deals if d['entry'] == 'OUT']
            
            total_trades = len(closed_trades)
            if total_trades == 0:
                return {
                    "win_rate": 0,
                    "profit_factor": 0,
                    "total_net_profit": 0,
                    "gross_profit": 0,
                    "gross_loss": 0,
                    "avg_win": 0,
                    "avg_loss": 0,
                    "total_trades": 0,
                    "winning_trades": 0,
                    "losing_trades": 0
                }

            winning_deals = [d['total'] for d in closed_trades if d['total'] > 0]
            losing_deals = [d['total'] for d in closed_trades if d['total'] < 0]
            all_profits = [d['total'] for d in closed_trades]

            gross_profit = sum(winning_deals)
            gross_loss = abs(sum(losing_deals))
            total_net_profit = gross_profit - gross_loss

            win_rate = (len(winning_deals) / total_trades) * 100 if total_trades > 0 else 0
            profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 0)

            avg_win = sum(winning_deals) / len(winning_deals) if len(winning_deals) > 0 else 0
            avg_loss = sum(losing_deals) / len(losing_deals) if len(losing_deals) > 0 else 0

            # Sharpe Ratio simplificado (sin tasa libre de riesgo, basado en profits USD)
            sharpe_ratio = 0.0
            if len(all_profits) >= 2:
                import statistics
                mean_p = statistics.mean(all_profits)
                std_p = statistics.stdev(all_profits)
                if std_p > 0:
                    sharpe_ratio = round(mean_p / std_p, 2)

            # Max Drawdown desde cumulative profit series
            max_drawdown_usd = 0.0
            max_drawdown_pct = 0.0
            if all_profits:
                cumulative = 0.0
                peak = 0.0
                for p in all_profits:
                    cumulative += p
                    if cumulative > peak:
                        peak = cumulative
                    dd = peak - cumulative
                    if dd > max_drawdown_usd:
                        max_drawdown_usd = dd
                if peak > 0:
                    max_drawdown_pct = round((max_drawdown_usd / peak) * 100, 2)
                max_drawdown_usd = round(max_drawdown_usd, 2)

            metrics = {
                "period": period,
                "win_rate": round(win_rate, 2),
                "profit_factor": round(profit_factor, 2),
                "total_net_profit": round(total_net_profit, 2),
                "gross_profit": round(gross_profit, 2),
                "gross_loss": round(gross_loss, 2),
                "avg_win": round(avg_win, 2),
                "avg_loss": round(avg_loss, 2),
                "total_trades": total_trades,
                "winning_trades": len(winning_deals),
                "losing_trades": len(losing_deals),
                "sharpe_ratio": sharpe_ratio,
                "max_drawdown_usd": max_drawdown_usd,
                "max_drawdown_pct": max_drawdown_pct,
            }
            
            logger.info(f"Métricas {period.upper()} calculadas: WinRate {win_rate:.1f}%, PF {profit_factor:.2f}")
            return metrics
        except Exception as e:
            logger.exception(f"Error calculando métricas de performance ({period}): {str(e)}")
            return {
                "win_rate": 0,
                "profit_factor": 0,
                "total_net_profit": 0,
                "gross_profit": 0,
                "gross_loss": 0,
                "avg_win": 0,
                "avg_loss": 0,
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0
            }

    # ═══════════════════════════════════════════════
    # MULTI-TERMINAL: Switch, Compare, Copy
    # ═══════════════════════════════════════════════

    @staticmethod
    def switch_terminal(terminal_id):
        """Cambia la conexión MT5 a otra terminal registrada."""
        with MT5Engine._lock:
            try:
                from .models import MT5Terminal
                terminal = MT5Terminal.objects.get(id=terminal_id)
                logger.info(f"[MultiTerminal] Switching a terminal: {terminal.name} ({terminal.terminal_path})")

                # Shutdown actual
                mt5.shutdown()
                logger.info("[MultiTerminal] MT5 shutdown completado.")

                # Initialize con nuevo path
                if not mt5.initialize(path=terminal.terminal_path):
                    logger.error(f"[MultiTerminal] Fallo al conectar con {terminal.terminal_path}. Error: {mt5.last_error()}")
                    # Intentar reconectar a la anterior
                    if MT5Engine._current_terminal_path and MT5Engine._current_terminal_path != 'default':
                        mt5.initialize(path=MT5Engine._current_terminal_path)
                    else:
                        mt5.initialize()
                    return False

                MT5Engine._current_terminal_path = terminal.terminal_path

                # Marcar como activa en DB
                terminal.is_active = True
                terminal.save()

                # Info de la cuenta conectada — persistir en DB
                acc = mt5.account_info()
                if acc:
                    logger.info(f"[MultiTerminal] Conectado: Cuenta #{acc.login} | Balance: {acc.balance} | Server: {acc.server}")
                    try:
                        from django.utils import timezone as tz
                        acc_type = 'demo' if acc.trade_mode == 0 else ('contest' if acc.trade_mode == 1 else 'real')
                        terminal.account_login = acc.login
                        terminal.account_server = acc.server or ''
                        terminal.account_balance = acc.balance
                        terminal.account_equity = acc.equity
                        terminal.account_currency = acc.currency or 'USD'
                        terminal.account_name = acc.name or ''
                        terminal.account_type = acc_type
                        terminal.last_sync_at = tz.now()
                        terminal.save()
                    except Exception as e:
                        logger.warning(f"[MultiTerminal] No se pudo guardar info de cuenta: {e}")
                else:
                    logger.warning("[MultiTerminal] Conectado pero no se pudo obtener info de cuenta.")

                return True
            except Exception as e:
                logger.exception(f"[MultiTerminal] Error durante switch: {str(e)}")
                return False

    @staticmethod
    def get_positions_from_terminal(terminal_id):
        """Obtiene las posiciones abiertas de una terminal específica (switch temporal)."""
        with MT5Engine._lock:
            original_path = MT5Engine._current_terminal_path
            try:
                from .models import MT5Terminal
                terminal = MT5Terminal.objects.get(id=terminal_id)
                
                # Si ya estamos en esa terminal, solo leer
                if original_path == terminal.terminal_path:
                    positions = mt5.positions_get()
                    acc = mt5.account_info()
                    return {
                        'terminal_id': terminal.id,
                        'terminal_name': terminal.name,
                        'account': acc.login if acc else 0,
                        'balance': acc.balance if acc else 0,
                        'equity': acc.equity if acc else 0,
                        'server': acc.server if acc else '',
                        'positions': MT5Engine._format_positions(positions)
                    }

                # Switch temporal
                mt5.shutdown()
                if not mt5.initialize(path=terminal.terminal_path):
                    logger.error(f"[MultiTerminal] No se pudo conectar a {terminal.name}")
                    # Reconectar original
                    MT5Engine._reconnect_original(original_path)
                    return {'terminal_id': terminal.id, 'terminal_name': terminal.name, 'error': 'No se pudo conectar', 'positions': []}

                positions = mt5.positions_get()
                acc = mt5.account_info()
                result = {
                    'terminal_id': terminal.id,
                    'terminal_name': terminal.name,
                    'account': acc.login if acc else 0,
                    'balance': acc.balance if acc else 0,
                    'equity': acc.equity if acc else 0,
                    'server': acc.server if acc else '',
                    'positions': MT5Engine._format_positions(positions)
                }

                # Reconectar a la terminal original
                mt5.shutdown()
                MT5Engine._reconnect_original(original_path)

                return result

            except Exception as e:
                logger.exception(f"[MultiTerminal] Error obteniendo posiciones: {str(e)}")
                MT5Engine._reconnect_original(original_path)
                return {'error': str(e), 'positions': []}

    @staticmethod
    def get_all_symbols_from_terminal(terminal_id):
        """Obtiene todos los símbolos disponibles de una terminal (switch temporal)."""
        with MT5Engine._lock:
            original_path = MT5Engine._current_terminal_path
            try:
                from .models import MT5Terminal
                terminal = MT5Terminal.objects.get(id=terminal_id)

                need_switch = original_path != terminal.terminal_path
                if need_switch:
                    mt5.shutdown()
                    if not mt5.initialize(path=terminal.terminal_path):
                        MT5Engine._reconnect_original(original_path)
                        return []

                symbols = mt5.symbols_get()
                result = []
                if symbols:
                    result = [s.name for s in symbols if s.visible]

                if need_switch:
                    mt5.shutdown()
                    MT5Engine._reconnect_original(original_path)

                logger.info(f"[MultiTerminal] {len(result)} símbolos visibles en {terminal.name}")
                return result
            except Exception as e:
                logger.exception(f"[MultiTerminal] Error obteniendo símbolos: {str(e)}")
                MT5Engine._reconnect_original(original_path)
                return []

    @staticmethod
    def fetch_account_info_from_terminal(terminal_id):
        """Conecta brevemente a una terminal para obtener sus datos de cuenta y los persiste en DB."""
        with MT5Engine._lock:
            original_path = MT5Engine._current_terminal_path
            try:
                from .models import MT5Terminal
                from django.utils import timezone as tz

                terminal = MT5Terminal.objects.get(id=terminal_id)
                need_switch = original_path != terminal.terminal_path

                if need_switch:
                    mt5.shutdown()
                    if not mt5.initialize(path=terminal.terminal_path):
                        logger.error(f"[MultiTerminal] No se pudo conectar a {terminal.name} para sync de cuenta")
                        MT5Engine._reconnect_original(original_path)
                        return None

                acc = mt5.account_info()
                result = None

                if acc:
                    acc_type = 'demo' if acc.trade_mode == 0 else ('contest' if acc.trade_mode == 1 else 'real')
                    terminal.account_login = acc.login
                    terminal.account_server = acc.server or ''
                    terminal.account_balance = acc.balance
                    terminal.account_equity = acc.equity
                    terminal.account_currency = acc.currency or 'USD'
                    terminal.account_name = acc.name or ''
                    terminal.account_type = acc_type
                    terminal.last_sync_at = tz.now()
                    terminal.save(update_fields=[
                        'account_login', 'account_server', 'account_balance',
                        'account_equity', 'account_currency', 'account_name',
                        'account_type', 'last_sync_at',
                    ])
                    result = {
                        'login': acc.login,
                        'server': acc.server,
                        'balance': acc.balance,
                        'equity': acc.equity,
                        'currency': acc.currency,
                        'name': acc.name,
                        'type': acc_type,
                    }
                    logger.info(f"[MultiTerminal] Sync cuenta OK: #{acc.login} | {acc.server} | {acc.balance} {acc.currency}")
                else:
                    logger.warning(f"[MultiTerminal] Conectado a {terminal.name} pero no se obtuvo info de cuenta")

                if need_switch:
                    mt5.shutdown()
                    MT5Engine._reconnect_original(original_path)

                return result
            except Exception as e:
                logger.exception(f"[MultiTerminal] Error en fetch_account_info_from_terminal: {str(e)}")
                MT5Engine._reconnect_original(original_path)
                return None

    @staticmethod
    def copy_trade_to_terminal(terminal_id, symbol, volume, trade_type, action='open'):
        """Copia/cierra una operación en la terminal destino.
        trade_type: 'BUY' o 'SELL'
        action: 'open' para abrir, 'close' para cerrar todas las de ese símbolo+dirección
        """
        with MT5Engine._lock:
            original_path = MT5Engine._current_terminal_path
            try:
                from .models import MT5Terminal, RiskSettings
                terminal = MT5Terminal.objects.get(id=terminal_id)
                settings_obj = RiskSettings.get_settings()
                deviation = settings_obj.max_deviation

                # Switch a terminal destino
                need_switch = original_path != terminal.terminal_path
                if need_switch:
                    mt5.shutdown()
                    if not mt5.initialize(path=terminal.terminal_path):
                        logger.error(f"[CopyTrade] No se pudo conectar a {terminal.name}")
                        MT5Engine._reconnect_original(original_path)
                        return {'success': False, 'message': f'No se pudo conectar a {terminal.name}'}

                if action == 'open':
                    # Abrir posición
                    tick = mt5.symbol_info_tick(symbol)
                    if not tick:
                        logger.error(f"[CopyTrade] Tick no disponible para {symbol} en {terminal.name}")
                        if need_switch:
                            mt5.shutdown()
                            MT5Engine._reconnect_original(original_path)
                        return {'success': False, 'message': f'Símbolo {symbol} no encontrado en {terminal.name}'}

                    order_type = mt5.ORDER_TYPE_BUY if trade_type == 'BUY' else mt5.ORDER_TYPE_SELL
                    price = tick.ask if trade_type == 'BUY' else tick.bid

                    request = {
                        "action": mt5.TRADE_ACTION_DEAL,
                        "symbol": symbol,
                        "volume": volume,
                        "type": order_type,
                        "price": price,
                        "deviation": deviation,
                        "magic": settings_obj.magic_number,
                        "comment": "CopyTrade Q-UI",
                        "type_time": mt5.ORDER_TIME_GTC,
                        "type_filling": mt5.ORDER_FILLING_IOC,
                    }

                    result = mt5.order_send(request)
                    success = result and result.retcode == mt5.TRADE_RETCODE_DONE
                    msg = f"{'OK' if success else 'FALLO'}: {trade_type} {volume} {symbol} en {terminal.name}"
                    if success:
                        logger.info(f"[CopyTrade] {msg}")
                    else:
                        logger.error(f"[CopyTrade] {msg}. Retcode: {result.retcode if result else 'N/A'}")

                elif action == 'close':
                    # Cerrar posiciones de ese símbolo y dirección
                    mt5_type = mt5.POSITION_TYPE_BUY if trade_type == 'BUY' else mt5.POSITION_TYPE_SELL
                    positions = mt5.positions_get(symbol=symbol)
                    if not positions:
                        msg = f"No hay posiciones de {symbol} en {terminal.name}"
                        logger.info(f"[CopyTrade] {msg}")
                        if need_switch:
                            mt5.shutdown()
                            MT5Engine._reconnect_original(original_path)
                        return {'success': True, 'message': msg, 'closed': 0}

                    filtered = [p for p in positions if p.type == mt5_type]
                    closed = 0
                    for pos in filtered:
                        tick = mt5.symbol_info_tick(pos.symbol)
                        if not tick:
                            continue
                        close_price = tick.ask if pos.type == mt5.POSITION_TYPE_SELL else tick.bid
                        close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                        req = {
                            "action": mt5.TRADE_ACTION_DEAL,
                            "symbol": pos.symbol,
                            "volume": pos.volume,
                            "type": close_type,
                            "position": pos.ticket,
                            "price": close_price,
                            "deviation": deviation,
                            "magic": pos.magic,
                            "comment": "CopyClose Q-UI",
                            "type_time": mt5.ORDER_TIME_GTC,
                            "type_filling": mt5.ORDER_FILLING_IOC,
                        }
                        res = mt5.order_send(req)
                        if res and res.retcode == mt5.TRADE_RETCODE_DONE:
                            closed += 1

                    msg = f"Cerradas {closed}/{len(filtered)} posiciones {trade_type} {symbol} en {terminal.name}"
                    logger.info(f"[CopyTrade] {msg}")
                    success = True

                # Reconectar original
                if need_switch:
                    mt5.shutdown()
                    MT5Engine._reconnect_original(original_path)

                return {'success': success, 'message': msg}

            except Exception as e:
                logger.exception(f"[CopyTrade] Error: {str(e)}")
                MT5Engine._reconnect_original(original_path)
                return {'success': False, 'message': str(e)}

    @staticmethod
    def _format_positions(positions):
        """Formatea posiciones de MT5 a dict para API."""
        if not positions:
            return []
        result = []
        for pos in positions:
            result.append({
                'ticket': pos.ticket,
                'symbol': pos.symbol,
                'type': 'BUY' if pos.type == mt5.POSITION_TYPE_BUY else 'SELL',
                'volume': pos.volume,
                'price_open': pos.price_open,
                'price_current': pos.price_current,
                'profit': pos.profit,
                'sl': pos.sl,
                'tp': pos.tp,
                'magic': pos.magic,
                'comment': pos.comment,
                'time': str(pos.time)
            })
        return result

    @staticmethod
    def _reconnect_original(original_path):
        """Reconecta a la terminal original tras un switch temporal."""
        try:
            if original_path and original_path != 'default':
                mt5.initialize(path=original_path)
            else:
                mt5.initialize()
            MT5Engine._current_terminal_path = original_path
        except Exception as e:
            logger.error(f"[MultiTerminal] Error reconectando a terminal original: {str(e)}")
