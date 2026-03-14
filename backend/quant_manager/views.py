import logging
import csv
import io
import glob
import os
import requests as http_requests
import MetaTrader5 as mt5
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.db import transaction
from django.utils import timezone
from .models import RiskSettings, EquitySnapshot, SymbolProfitTarget, MarketWatchSettings, MarketWatchSignal
from .serializers import (
    RiskSettingsSerializer,
    SymbolProfitTargetSerializer,
    MarketWatchSettingsSerializer, 
    MarketWatchSignalSerializer
)
from .mt5_client import MT5Engine

logger = logging.getLogger(__name__)

def _get_classified_signals():
    """Auxiliar: Retorna señales agrupadas por estado (limitadas para evitar OOM en el frontend)"""
    MAX_SIGNALS_PER_GROUP = 50
    signals = MarketWatchSignal.objects.all().order_by('-last_update')
    
    classified = {
        "fractals": [],
        "emas": [],
        "scanning": [],
        "all": []
    }
    
    for sig in signals:
        data = MarketWatchSignalSerializer(sig).data
        is_matched = False
        
        if sig.fractal_type and len(classified['fractals']) < MAX_SIGNALS_PER_GROUP:
            classified['fractals'].append(data)
            is_matched = True
            
        if sig.ema_signal and len(classified['emas']) < MAX_SIGNALS_PER_GROUP:
            classified['emas'].append(data)
            is_matched = True
            
        if not is_matched and len(classified['scanning']) < MAX_SIGNALS_PER_GROUP:
            classified['scanning'].append(data)
            
        # Siempre agregar a 'all' para la vista tabular (limitado a 150 total para performance)
        if len(classified['all']) < 150:
            classified['all'].append(data)
    
    logger.debug(f"Señales clasificadas: fractals={len(classified['fractals'])}, emas={len(classified['emas'])}, scanning={len(classified['scanning'])}")
    return classified


class AccountStatusView(APIView):
    def get(self, request):
        logger.info("API AccountStatus: GET solicitado")
        account_info = MT5Engine.get_account_info()
        daily_metrics = MT5Engine.get_daily_metrics()
        
        if not account_info:
            logger.error("No se pudo conectar a MT5 para obtener el Account Info.")
            return Response(
                {"error": "MT5 Connection Failed or Terminal Offline"}, 
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
            
        try:
            now = timezone.now()
            account_id = account_info.get("login", 0)
            if account_id:
                last_snapshot = EquitySnapshot.objects.filter(account_id=account_id).first()
                if not last_snapshot or last_snapshot.timestamp.minute != now.minute or (now - last_snapshot.timestamp).total_seconds() > 59:
                    EquitySnapshot.objects.create(
                        account_id=account_id,
                        balance=account_info.get("balance", 0.0),
                        equity=account_info.get("equity", 0.0),
                        credit=account_info.get("credit", 0.0)
                    )
        except Exception as e:
            logger.error(f"Error guardando snapshot de equidad: {str(e)}")

        return Response({
            "balance": account_info.get("balance", 0.0),
            "credit": account_info.get("credit", 0.0),
            "balance_total": account_info.get("balance", 0.0) + account_info.get("credit", 0.0),
            "equity": account_info.get("equity", 0.0),
            "margin": account_info.get("margin", 0.0),
            "margin_free": account_info.get("margin_free", 0.0),
            "currency": account_info.get("currency", "USD"),
            "daily_pl_percent": daily_metrics.get("daily_pl_percent", 0.0),
            "initial_balance_today": daily_metrics.get("initial_balance_today", 0.0),
            "initial_deposit": daily_metrics.get("initial_deposit", 0.0),
            "daily_profit_usd": daily_metrics.get("daily_profit_usd", 0.0),
        }, status=status.HTTP_200_OK)

class DashboardDataView(APIView):
    def get(self, request):
        logger.debug("API DashboardData: GET solicitado")
        
        # 1. Obterner Account Info
        account_info = MT5Engine.get_account_info()
        daily_metrics = MT5Engine.get_daily_metrics()
        
        account_data = {}
        if not account_info:
            logger.error("No se pudo conectar a MT5 para obtener el Account Info en DashboardData.")
        else:
            try:
                now = timezone.now()
                account_id = account_info.get("login", 0)
                if account_id:
                    last_snapshot = EquitySnapshot.objects.filter(account_id=account_id).first()
                    if not last_snapshot or last_snapshot.timestamp.minute != now.minute or (now - last_snapshot.timestamp).total_seconds() > 59:
                        EquitySnapshot.objects.create(
                            account_id=account_id,
                            balance=account_info.get("balance", 0.0),
                            equity=account_info.get("equity", 0.0),
                            credit=account_info.get("credit", 0.0)
                        )
            except Exception as e:
                logger.error(f"Error guardando snapshot de equidad: {str(e)}")
            
            account_data = {
                "balance": account_info.get("balance", 0.0),
                "credit": account_info.get("credit", 0.0),
                "balance_total": account_info.get("balance", 0.0) + account_info.get("credit", 0.0),
                "equity": account_info.get("equity", 0.0),
                "margin": account_info.get("margin", 0.0),
                "margin_free": account_info.get("margin_free", 0.0),
                "currency": account_info.get("currency", "USD"),
                "daily_pl_percent": daily_metrics.get("daily_pl_percent", 0.0),
                "initial_balance_today": daily_metrics.get("initial_balance_today", 0.0),
                "initial_deposit": daily_metrics.get("initial_deposit", 0.0),
                "daily_profit_usd": daily_metrics.get("daily_profit_usd", 0.0),
            }
            
        # 2. Obtener Positions
        positions = MT5Engine.get_open_positions_grouped()
        if not positions and account_info:
             logger.debug("DashboardData: No hay posiciones abiertas detectadas.")
        
        # 3. Obtener Settings
        settings_obj = RiskSettings.get_settings()
        settings_data = RiskSettingsSerializer(settings_obj).data
        
        return Response({
            "account": account_data,
            "positions": positions,
            "settings": settings_data
        }, status=status.HTTP_200_OK)

class RiskSettingsView(APIView):
    def get(self, request):
        logger.info("API RiskSettings: GET solicitado")
        settings_obj = RiskSettings.get_settings()
        serializer = RiskSettingsSerializer(settings_obj)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @transaction.atomic
    def put(self, request):
        logger.info(f"API RiskSettings: PUT con datos: {request.data}")
        settings_obj = RiskSettings.get_settings()
        serializer = RiskSettingsSerializer(settings_obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class EmergencyCloseAllView(APIView):
    def post(self, request):
        logger.warning("API EmergencyCloseAll: SOLICITUD DE CIERRE MASIVO RECIBIDA")
        cerradas = MT5Engine.close_all_positions()
        if cerradas == -1:
            return Response({"error": "Error interno en MT5"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response({"success": True, "message": f"Se cerraron {cerradas} posiciones."}, status=status.HTTP_200_OK)

class GroupedPositionsView(APIView):
    def get(self, request):
        logger.info("API GroupedPositions: GET solicitado")
        groups = MT5Engine.get_open_positions_grouped()
        return Response(groups, status=status.HTTP_200_OK)

class SetGlobalBreakevenView(APIView):
    def post(self, request):
        logger.info("API SetGlobalBreakeven: POST solicitado")
        modified = MT5Engine.set_global_breakeven()
        if modified == -1:
            return Response({"error": "Error interno en MT5"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response({"success": True, "message": f"BreakEven aplicado a {modified} posiciones."}, status=status.HTTP_200_OK)

class SetBreakevenBySymbolView(APIView):
    def post(self, request):
        symbol = request.data.get('symbol')
        logger.info(f"API SetBreakevenBySymbol: POST symbol={symbol}")
        if not symbol:
            logger.warning("SetBreakevenBySymbol: Falta parámetro symbol")
            return Response({"error": "Falta parámetro symbol"}, status=status.HTTP_400_BAD_REQUEST)
            
        modified = MT5Engine.set_breakeven_by_symbol(symbol)
        
        if modified == -1:
            return Response({"error": "Error interno en MT5"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        return Response({"success": True, "message": f"BreakEven aplicado a {modified} posiciones de {symbol}."}, status=status.HTTP_200_OK)

class SymbolProfitTargetView(APIView):
    def get(self, request):
        logger.info(f"API SymbolProfitTarget: GET symbol={request.query_params.get('symbol', 'ALL')}")
        targets = SymbolProfitTarget.objects.all()
        symbol = request.query_params.get('symbol')
        if symbol:
            target = targets.filter(symbol=symbol).first()
            if not target: return Response({"symbol": symbol, "target_profit_usd": 0.0, "is_active": False})
            return Response(SymbolProfitTargetSerializer(target).data)
        return Response(SymbolProfitTargetSerializer(targets, many=True).data)

    def post(self, request):
        logger.info(f"API SymbolProfitTarget: POST datos={request.data}")
        symbol = request.data.get('symbol')
        if not symbol: return Response({"error": "Falta symbol"}, status=status.HTTP_400_BAD_REQUEST)
        target, _ = SymbolProfitTarget.objects.get_or_create(symbol=symbol)
        serializer = SymbolProfitTargetSerializer(target, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class HistoryView(APIView):
    def get(self, request):
        # Soportar tanto period (nuevo) como days (viejo/compatible)
        period = request.query_params.get('period', 'day')
        if period.isdigit():
            # Si es un número lo tratamos como 'days' vía get_history_deals fallback
            history = MT5Engine.get_history_deals(period=period)
        else:
            history = MT5Engine.get_history_deals(period=period)
            
        return Response(history)

class PerformanceMetricsView(APIView):
    def get(self, request):
        period = request.query_params.get('period', 'month')
        metrics = MT5Engine.get_performance_metrics(period=period)
        return Response(metrics)

class EquityHistoryView(APIView):
    def get(self, request):
        timeframe = request.query_params.get('tf', 'M1')
        logger.info(f"API EquityHistory: GET tf={timeframe}")
        since = timezone.now() - timezone.timedelta(hours=24)
        snapshots = EquitySnapshot.objects.filter(timestamp__gte=since).order_by('timestamp')
        data = []
        step = 1
        if timeframe == 'M5': step = 5
        elif timeframe == 'H1': step = 60
        MAX_POINTS = 500
        for i, snap in enumerate(snapshots):
            if i % step == 0:
                data.append({
                    "time": snap.timestamp.strftime('%H:%M'),
                    "equity": float(snap.equity),
                    "balance": float(snap.balance + snap.credit),
                })
        # Limitar a los últimos MAX_POINTS para evitar OOM en el frontend
        if len(data) > MAX_POINTS:
            data = data[-MAX_POINTS:]
            logger.debug(f"EquityHistory truncado a {MAX_POINTS} puntos (de {len(data) + MAX_POINTS})")
        return Response(data, status=status.HTTP_200_OK)

# --- MARKET WATCH VIEWS ---

class MarketWatchSignalsView(APIView):
    def get(self, request):
        logger.debug("API MarketWatchSignals: GET solicitado")
        signals_data = _get_classified_signals()
        return Response(signals_data, status=status.HTTP_200_OK)

class MarketWatchSettingsView(APIView):
    def get(self, request):
        logger.info("API MarketWatchSettings: GET solicitado")
        settings_obj = MarketWatchSettings.get_settings()
        serializer = MarketWatchSettingsSerializer(settings_obj)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        logger.info(f"API MarketWatchSettings: PUT datos={request.data}")
        settings_obj = MarketWatchSettings.get_settings()
        serializer = MarketWatchSettingsSerializer(settings_obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class ClosePositionsBySymbolView(APIView):
    def post(self, request):
        symbol = request.data.get('symbol')
        logger.info(f"API ClosePositionsBySymbol: POST symbol={symbol}")
        cerradas = MT5Engine.close_positions_by_symbol(symbol)
        return Response({"success": True, "message": f"Se cerraron {cerradas} posiciones."}, status=status.HTTP_200_OK)

class ClosePositionsByDirectionView(APIView):
    def post(self, request):
        symbol = request.data.get('symbol')
        direction = request.data.get('direction')
        logger.info(f"API ClosePositionsByDirection: symbol={symbol}, direction={direction}")
        if not symbol or not direction:
            logger.warning(f"ClosePositionsByDirection: Faltan parámetros. symbol={symbol}, direction={direction}")
            return Response({"error": "Faltan parámetros symbol y direction"}, status=status.HTTP_400_BAD_REQUEST)
        if direction.upper() not in ['BUY', 'SELL']:
            logger.warning(f"ClosePositionsByDirection: Dirección inválida: {direction}")
            return Response({"error": "direction debe ser BUY o SELL"}, status=status.HTTP_400_BAD_REQUEST)
        cerradas = MT5Engine.close_positions_by_symbol_direction(symbol, direction)
        logger.info(f"API ClosePositionsByDirection COMPLETADO: {symbol} {direction} -> {cerradas} cerradas")
        return Response({"success": True, "message": f"Se cerraron {cerradas} posiciones {direction.upper()} de {symbol}."}, status=status.HTTP_200_OK)

class CloseWinningPositionsBySymbolView(APIView):
    def post(self, request):
        symbol = request.data.get('symbol')
        logger.info(f"API CloseWinningPositionsBySymbol: POST symbol={symbol}")
        if not symbol:
            logger.warning("CloseWinningPositionsBySymbol: Falta parámetro symbol")
            return Response({"error": "Falta parámetro symbol"}, status=status.HTTP_400_BAD_REQUEST)
        cerradas = MT5Engine.close_winning_positions_by_symbol(symbol)
        
        if cerradas == -1:
            return Response({"error": "Error interno en MT5"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        logger.info(f"API CloseWinningPositionsBySymbol COMPLETADO: {symbol} -> {cerradas} cerradas")
        return Response({"success": True, "message": f"Se cerraron {cerradas} posiciones en ganancia de {symbol}."}, status=status.HTTP_200_OK)

class ClosePositionsAtProfitView(APIView):
    def post(self, request):
        profit_percent = request.data.get('profit_percent')
        logger.info(f"API ClosePositionsAtProfit: POST profit_percent={profit_percent}")
        result = MT5Engine.close_positions_at_profit(float(profit_percent))
        return Response(result, status=status.HTTP_200_OK)


class SessionAssetsView(APIView):
    """Devuelve precios actuales de activos específicos para el popup de sesión de mercado"""
    def get(self, request):
        symbols_param = request.query_params.get('symbols', '')
        if not symbols_param:
            return Response({"error": "Parámetro 'symbols' requerido"}, status=status.HTTP_400_BAD_REQUEST)
        
        symbols = [s.strip() for s in symbols_param.split(',') if s.strip()]
        logger.info(f"API SessionAssets: GET symbols={symbols}")
        
        import MetaTrader5 as mt5
        results = []
        for symbol in symbols:
            try:
                tick = mt5.symbol_info_tick(symbol)
                if tick:
                    results.append({
                        "symbol": symbol,
                        "bid": float(tick.bid),
                        "ask": float(tick.ask),
                        "spread": round(float(tick.ask - tick.bid), 5),
                        "time": tick.time
                    })
                else:
                    logger.warning(f"SessionAssets: No se pudo obtener tick para {symbol}")
                    results.append({"symbol": symbol, "bid": 0, "ask": 0, "spread": 0, "time": 0})
            except Exception as e:
                logger.error(f"SessionAssets: Error obteniendo {symbol}: {e}")
                results.append({"symbol": symbol, "bid": 0, "ask": 0, "spread": 0, "time": 0, "error": str(e)})
        
        return Response(results, status=status.HTTP_200_OK)


# --- MULTI-TERMINAL VIEWS ---

class MT5TerminalListView(APIView):
    """Lista todas las terminales registradas o crea una nueva."""
    def get(self, request):
        from .models import MT5Terminal
        from .serializers import MT5TerminalSerializer
        terminals = MT5Terminal.objects.all()
        serializer = MT5TerminalSerializer(terminals, many=True)
        logger.info(f"[Terminals] Listando {len(serializer.data)} terminales registradas.")
        return Response(serializer.data)

    def post(self, request):
        from .serializers import MT5TerminalSerializer
        serializer = MT5TerminalSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            logger.info(f"[Terminals] Nueva terminal creada: {serializer.data['name']} → {serializer.data['terminal_path']}")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        logger.error(f"[Terminals] Error creando terminal: {serializer.errors}")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MT5TerminalDetailView(APIView):
    """Edita, elimina o activa una terminal específica."""
    def put(self, request, terminal_id):
        from .models import MT5Terminal
        from .serializers import MT5TerminalSerializer
        try:
            terminal = MT5Terminal.objects.get(id=terminal_id)
        except MT5Terminal.DoesNotExist:
            return Response({"error": "Terminal no encontrada"}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = MT5TerminalSerializer(terminal, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            logger.info(f"[Terminals] Terminal actualizada: {terminal.name}")
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, terminal_id):
        from .models import MT5Terminal
        try:
            terminal = MT5Terminal.objects.get(id=terminal_id)
            name = terminal.name
            terminal.delete()
            logger.info(f"[Terminals] Terminal eliminada: {name}")
            return Response({"message": f"Terminal '{name}' eliminada"})
        except MT5Terminal.DoesNotExist:
            return Response({"error": "Terminal no encontrada"}, status=status.HTTP_404_NOT_FOUND)

    def post(self, request, terminal_id):
        """Activar esta terminal como la actual."""
        success = MT5Engine.switch_terminal(terminal_id)
        if success:
            return Response({"message": "Terminal activada correctamente"})
        return Response({"error": "No se pudo activar la terminal"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class TerminalPositionsView(APIView):
    """Obtiene las posiciones de todas las terminales registradas para comparación."""
    def get(self, request):
        from .models import MT5Terminal, SymbolMapping
        terminals = MT5Terminal.objects.all()
        if terminals.count() == 0:
            return Response({"terminals": [], "mappings": []})

        results = []
        for terminal in terminals:
            try:
                positions_data = MT5Engine.get_positions_from_terminal(terminal.id)
                results.append(positions_data)
                logger.info(f"[TerminalPositions] {terminal.name}: {len(positions_data.get('positions', []))} posiciones")
            except Exception as e:
                logger.error(f"[TerminalPositions] Error obteniendo posiciones de {terminal.name}: {e}")
                results.append({
                    'terminal_id': terminal.id,
                    'terminal_name': terminal.name,
                    'error': str(e),
                    'positions': []
                })

        # Cargar mapeos de símbolos
        mappings = SymbolMapping.objects.all()
        from .serializers import SymbolMappingSerializer
        mappings_data = SymbolMappingSerializer(mappings, many=True).data

        return Response({"terminals": results, "mappings": mappings_data})


class CopyTradeView(APIView):
    """Copia o cierra una operación en una terminal destino."""
    def post(self, request):
        terminal_id = request.data.get('terminal_id')
        symbol = request.data.get('symbol')
        volume = float(request.data.get('volume', 0.01))
        trade_type = request.data.get('trade_type', 'BUY')
        action = request.data.get('action', 'open')

        if not terminal_id or not symbol:
            return Response({"error": "terminal_id y symbol son requeridos"}, status=status.HTTP_400_BAD_REQUEST)

        logger.info(f"[CopyTrade] Solicitud: {action} {trade_type} {volume} {symbol} → terminal {terminal_id}")
        result = MT5Engine.copy_trade_to_terminal(terminal_id, symbol, volume, trade_type, action)
        
        if result.get('success'):
            return Response(result)
        return Response(result, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SymbolMappingView(APIView):
    """CRUD de mapeos de símbolos entre terminales."""
    def get(self, request):
        from .models import SymbolMapping
        from .serializers import SymbolMappingSerializer
        mappings = SymbolMapping.objects.all()
        return Response(SymbolMappingSerializer(mappings, many=True).data)

    def post(self, request):
        from .serializers import SymbolMappingSerializer
        serializer = SymbolMappingSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            logger.info(f"[SymbolMapping] Nuevo mapeo creado: {request.data}")
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request):
        from .models import SymbolMapping
        mapping_id = request.data.get('id')
        try:
            mapping = SymbolMapping.objects.get(id=mapping_id)
            mapping.delete()
            logger.info(f"[SymbolMapping] Mapeo {mapping_id} eliminado")
            return Response({"message": "Mapeo eliminado"})
        except SymbolMapping.DoesNotExist:
            return Response({"error": "Mapeo no encontrado"}, status=status.HTTP_404_NOT_FOUND)


class TerminalSymbolsView(APIView):
    """Obtiene los símbolos disponibles de una terminal específica."""
    def get(self, request, terminal_id):
        symbols = MT5Engine.get_all_symbols_from_terminal(terminal_id)
        logger.info(f"[TerminalSymbols] Terminal {terminal_id}: {len(symbols)} símbolos")
        return Response({"symbols": symbols})


class EconomicCalendarView(APIView):
    """
    Calendario Económico: Próximos Earnings y Resultados Históricos.
    Usa Alpha Vantage EARNINGS_CALENDAR + EARNINGS.
    """
    _cache = {}
    _cache_ttl = 300  # 5 minutos de cache

    def get(self, request):
        import time

        action = request.query_params.get("action", "calendar")
        symbol = request.query_params.get("symbol", "")
        horizon = request.query_params.get("horizon", "3month")

        try:
            settings_obj = RiskSettings.get_settings()
            api_key = settings_obj.alpha_vantage_api_key
            if not api_key or not api_key.strip():
                logger.warning("[EconCalendar] No hay API Key de Alpha Vantage configurada.")
                return Response({
                    "error": "No hay API Key de Alpha Vantage configurada. Ve a Configuración → Integraciones Externas.",
                    "data": []
                }, status=status.HTTP_400_BAD_REQUEST)

            api_key = api_key.strip()
            base_url = "https://www.alphavantage.co/query"

            # --- CALENDARIO DE EARNINGS (Próximos) ---
            if action == "calendar":
                cache_key = f"cal_{horizon}_{symbol}"
                cached = self._get_cached(cache_key)
                if cached:
                    logger.debug(f"[EconCalendar] Sirviendo calendario desde cache ({cache_key})")
                    return Response({"data": cached, "source": "cache"})

                params = {
                    "function": "EARNINGS_CALENDAR",
                    "horizon": horizon,
                    "apikey": api_key,
                }
                if symbol:
                    params["symbol"] = symbol

                logger.info(f"[EconCalendar] Consultando EARNINGS_CALENDAR horizon={horizon} symbol={symbol or 'ALL'}")
                response = http_requests.get(base_url, params=params, timeout=15)
                response.raise_for_status()

                # Alpha Vantage retorna CSV para este endpoint
                content = response.text
                if "rate limit" in content.lower() or "premium endpoint" in content.lower():
                    logger.error(f"[EconCalendar] Rate limit o endpoint premium: {content[:200]}")
                    return Response({"error": "Límite de API alcanzado. Espera 1 minuto.", "data": []}, status=429)

                reader = csv.DictReader(io.StringIO(content))
                events = []
                for row in reader:
                    events.append({
                        "symbol": row.get("symbol", ""),
                        "name": row.get("name", ""),
                        "report_date": row.get("reportDate", ""),
                        "fiscal_date_ending": row.get("fiscalDateEnding", ""),
                        "estimate": self._safe_float(row.get("estimate")),
                        "currency": row.get("currency", "USD"),
                    })

                self._set_cache(cache_key, events)
                logger.info(f"[EconCalendar] Calendario obtenido: {len(events)} eventos próximos.")
                return Response({"data": events, "source": "api"})

            # --- RESULTADOS HISTÓRICOS DE EARNINGS (Sorpresas) ---
            elif action == "earnings":
                if not symbol:
                    return Response({"error": "Se requiere el parámetro 'symbol'", "data": []}, status=400)

                cache_key = f"earn_{symbol}"
                cached = self._get_cached(cache_key)
                if cached:
                    logger.debug(f"[EconCalendar] Sirviendo earnings desde cache ({cache_key})")
                    return Response({"data": cached, "source": "cache"})

                params = {
                    "function": "EARNINGS",
                    "symbol": symbol,
                    "apikey": api_key,
                }

                logger.info(f"[EconCalendar] Consultando EARNINGS para {symbol}")
                response = http_requests.get(base_url, params=params, timeout=15)
                response.raise_for_status()
                data = response.json()

                if "Information" in data:
                    logger.error(f"[EconCalendar] API Info: {data['Information'][:200]}")
                    return Response({"error": data["Information"], "data": []}, status=429)
                if "Error Message" in data:
                    logger.error(f"[EconCalendar] API Error: {data['Error Message']}")
                    return Response({"error": data["Error Message"], "data": []}, status=400)

                quarterly = data.get("quarterlyEarnings", [])
                results = []
                for i, q in enumerate(quarterly):
                    reported = self._safe_float(q.get("reportedEPS"))
                    estimated = self._safe_float(q.get("estimatedEPS"))
                    surprise = self._safe_float(q.get("surprise"))
                    surprise_pct = self._safe_float(q.get("surprisePercentage"))

                    # Previous = reported del trimestre anterior
                    previous = None
                    if i + 1 < len(quarterly):
                        previous = self._safe_float(quarterly[i + 1].get("reportedEPS"))

                    # Sentiment score
                    sentiment = None
                    if surprise is not None:
                        sentiment = 1.0 if surprise > 0 else -1.0 if surprise < 0 else 0.0

                    results.append({
                        "report_date": q.get("reportedDate", ""),
                        "fiscal_date_ending": q.get("fiscalDateEnding", ""),
                        "reported_eps": reported,
                        "estimated_eps": estimated,
                        "surprise": surprise,
                        "surprise_pct": surprise_pct,
                        "previous_eps": previous,
                        "sentiment": sentiment,
                    })

                self._set_cache(cache_key, results)
                logger.info(f"[EconCalendar] Earnings históricos: {len(results)} trimestres para {symbol}.")
                return Response({"data": results, "symbol": symbol, "source": "api"})

            else:
                return Response({"error": f"Acción '{action}' no reconocida"}, status=400)

        except http_requests.exceptions.Timeout:
            logger.error("[EconCalendar] Timeout al consultar Alpha Vantage.")
            return Response({"error": "Timeout al consultar Alpha Vantage", "data": []}, status=504)
        except http_requests.exceptions.RequestException as e:
            logger.error(f"[EconCalendar] Error de red: {str(e)}")
            return Response({"error": f"Error de red: {str(e)}", "data": []}, status=502)
        except Exception as e:
            logger.exception(f"[EconCalendar] Error inesperado: {str(e)}")
            return Response({"error": str(e), "data": []}, status=500)

    @classmethod
    def _get_cached(cls, key):
        import time
        entry = cls._cache.get(key)
        if entry and (time.time() - entry["ts"]) < cls._cache_ttl:
            return entry["data"]
        return None

    @classmethod
    def _set_cache(cls, key, data):
        import time
        cls._cache[key] = {"data": data, "ts": time.time()}

    @staticmethod
    def _safe_float(value):
        if value is None or str(value).strip() in ("", "None", "null", "N/A"):
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

# --- MT5 TERMINAL SCAN ---

class MT5ScanView(APIView):
    """Escanea el PC buscando instalaciones de MetaTrader 5 (terminal64.exe)."""

    def get(self, request):
        found = []
        seen = set()

        # Rutas de Program Files (profundidad 1 y 2)
        pf_roots = [
            os.environ.get('PROGRAMFILES', r'C:\Program Files'),
            os.environ.get('PROGRAMFILES(X86)', r'C:\Program Files (x86)'),
            r'C:\MT5', r'C:\MT4',
        ]
        for root in pf_roots:
            if not root or not os.path.isdir(root):
                continue
            for pattern in [
                os.path.join(root, '*', 'terminal64.exe'),
                os.path.join(root, '*', '*', 'terminal64.exe'),
            ]:
                for exe_path in glob.glob(pattern):
                    if exe_path in seen:
                        continue
                    seen.add(exe_path)
                    broker = os.path.basename(os.path.dirname(exe_path))
                    found.append({'path': exe_path, 'broker': broker})

        # Rutas de AppData (MetaQuotes data folders)
        appdata = os.environ.get('APPDATA', '')
        mq_root = os.path.join(appdata, 'MetaQuotes', 'Terminal')
        if os.path.isdir(mq_root):
            for hash_folder in os.listdir(mq_root):
                hash_path = os.path.join(mq_root, hash_folder)
                origin_file = os.path.join(hash_path, 'origin.txt')
                if not os.path.isfile(origin_file):
                    continue
                try:
                    with open(origin_file, encoding='utf-8', errors='ignore') as f:
                        install_path = f.read().strip()
                    exe_path = os.path.join(install_path, 'terminal64.exe') if not install_path.lower().endswith('.exe') else install_path
                    if os.path.isfile(exe_path) and exe_path not in seen:
                        seen.add(exe_path)
                        broker = os.path.basename(os.path.dirname(exe_path))
                        found.append({'path': exe_path, 'broker': broker})
                except Exception:
                    pass

        logger.info(f"[MT5 Scan] {len(found)} terminal(es) encontrada(s) en el PC")
        return Response({'terminals': found})


# --- HEALTH CHECK ---

class HealthView(APIView):
    """Endpoint público (sin API KEY) para monitorear el estado del sistema."""
    permission_classes = [AllowAny]

    def get(self, request):
        from .scanner import MarketWatchScanner  # noqa: import diferido para evitar ciclo
        try:
            mt5_connected = MT5Engine.get_account_info() is not None
        except Exception:
            mt5_connected = False

        try:
            scanner_running = (
                MarketWatchScanner._scanner_thread is not None and
                MarketWatchScanner._scanner_thread.is_alive()
            )
        except Exception:
            scanner_running = False

        last_signal = MarketWatchSignal.objects.order_by('-last_update').first()
        db_ok = True
        try:
            from django.db import connection
            connection.ensure_connection()
        except Exception:
            db_ok = False

        return Response({
            'status': 'ok' if (mt5_connected and db_ok) else 'degraded',
            'mt5_connected': mt5_connected,
            'scanner_running': scanner_running,
            'db_ok': db_ok,
            'last_signal_at': last_signal.last_update.isoformat() if last_signal else None,
            'timestamp': timezone.now().isoformat(),
        })


# --- FOREX FACTORY MACRO NEWS ---

from .services.forex_factory_service import ForexFactoryService

class MacroNewsView(APIView):
    """
    Endpoint para proveer el feed de XML de ForexFactory procesado.
    Pensado para que el frontend haga polling y dispare notificaciones de datos macro.
    """
    def get(self, request):
        try:
            # Obtener noticias del día con datos reales (actual)
            news = ForexFactoryService.get_recent_news()
            
            # Limitar a los eventos de alto impacto si lo desea el usuario,
            # pero el servicio ya filtra High/Medium.
            return Response({"data": news, "source": "forexfactory"}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"[MacroNewsView] Error obteniendo noticias macro: {e}")
            return Response({"error": "Error interno", "data": []}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
