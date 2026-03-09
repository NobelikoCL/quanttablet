import os
import time
import logging
import requests
from typing import Optional, List, Dict, Any, Union
from decimal import Decimal, InvalidOperation
from requests.exceptions import RequestException
from dataclasses import dataclass, asdict

# Configuración de logs para el backend (mostrará en consola de start.bat)
logger = logging.getLogger(__name__)

@dataclass
class MacroEventResult:
    """
    Estructura estandarizada (DTO) para mapeo a PostgreSQL.
    Limpia el ruido de AlphaVantage y preserva solo el "Resultado".
    """
    symbol: str
    event_date: str
    actual_value: Optional[Decimal]
    estimated_value: Optional[Decimal]
    previous_value: Optional[Decimal]
    surprise_value: Optional[Decimal]
    surprise_percentage: Optional[Decimal]
    sentiment_score: Optional[Decimal]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convierte la dataclass a un diccionario apto para Django ORM"""
        return asdict(self)

class AlphaVantageService:
    """
    Servicio de ingesta de datos Macro/Earnings de Alpha Vantage.
    Diseñado con resiliencia y control de Rate Limit (Tier Gratuito).
    """
    
    BASE_URL = "https://www.alphavantage.co/query"
    
    def __init__(self, api_key: Optional[str] = None):
        # Prioridad: argumento directo > BD (configurado por el usuario en el front) > .env > demo
        self.api_key = api_key or self._load_key_from_db() or os.environ.get("ALPHA_VANTAGE_API_KEY", "demo")
        logger.info(f"[AlphaVantage] Servicio inicializado. Key: {'***' + self.api_key[-4:] if len(self.api_key) > 4 else '(demo)'}")
        
        # Parámetros para manejar Tier Gratuito (5 req/min, 500 req/day)
        self.requests_made_in_minute = 0
        self.last_request_time = 0.0
        self.RATE_LIMIT_DELAY = 12.0  # 60 segundos / 5 requests = 12 segs entre requests preventivos

    @staticmethod
    def _load_key_from_db() -> Optional[str]:
        """Intenta cargar la API key desde la configuración del usuario en la BD."""
        try:
            from quant_manager.models import RiskSettings
            settings = RiskSettings.get_settings()
            key = settings.alpha_vantage_api_key
            if key and key.strip():
                logger.debug("[AlphaVantage] API Key cargada desde la base de datos (configuración del usuario).")
                return key.strip()
        except Exception as e:
            logger.warning(f"[AlphaVantage] No se pudo leer la API Key desde la BD: {e}")
        return None
        
    def _enforce_rate_limit(self) -> None:
        """Controla estrictamente la frecuencia de peticiones para evitar bloqueos 429"""
        current_time = time.time()
        elapsed = current_time - self.last_request_time
        
        if elapsed < self.RATE_LIMIT_DELAY:
            sleep_time = self.RATE_LIMIT_DELAY - elapsed
            logger.debug(f"[AlphaVantage] Rate limit preventivo. Esperando {sleep_time:.2f}s...")
            time.sleep(sleep_time)
            
        self.last_request_time = time.time()

    def _safe_decimal(self, value: Any) -> Optional[Decimal]:
        """Convierte valores de formato cadena (a veces "None" o vacíos) a Decimal de forma segura"""
        if value is None or value == "" or str(value).lower() in ("none", "null", "n/a"):
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            logger.warning(f"[AlphaVantage] Valor numérico inválido recibido: '{value}'. Parseado como None.")
            return None

    def fetch_event_results(self, symbol: str) -> List[MacroEventResult]:
        """
        Extrae datos críticos (Actual, Estimado, Previo, Sorpresa) 
        Limpiando el ruido de los metadatos de la API original.
        """
        self._enforce_rate_limit()
        
        params = {
            "function": "EARNINGS", # Usamos EARNINGS como proxy para test de estimación vs actual
            "symbol": symbol,
            "apikey": self.api_key
        }
        
        logger.info(f"[AlphaVantage] Iniciando extracción de resultados para {symbol}...")
        
        try:
            response = requests.get(self.BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # Validación de error o límite de API alcanzado
            if "Information" in data and "rate limit" in data.get("Information", "").lower():
                logger.error("[AlphaVantage] Límite de API de AlphaVantage alcanzado (Rate Limit Exceeded).")
                return []
                
            if "Error Message" in data:
                logger.error(f"[AlphaVantage] Error de la API: {data['Error Message']}")
                return []

            # Parsing Estratégico
            raw_events = data.get("quarterlyEarnings", [])
            parsed_results: List[MacroEventResult] = []
            
            for index, event in enumerate(raw_events):
                actual = self._safe_decimal(event.get("reportedEPS"))
                estimate = self._safe_decimal(event.get("estimatedEPS"))
                surprise = self._safe_decimal(event.get("surprise"))
                surprise_pct = self._safe_decimal(event.get("surprisePercentage"))
                
                # Para el 'previous', deducimos tomando el dato 'actual' del evento anterior del array
                previous = None
                if index + 1 < len(raw_events):
                    previous = self._safe_decimal(raw_events[index + 1].get("reportedEPS"))
                
                # Lógica base para sentiment o asignación de external score
                # Si sorpresa es positiva > mercado alcista
                sentiment = None
                if surprise is not None:
                    sentiment = Decimal('1.0') if surprise > 0 else Decimal('-1.0') if surprise < 0 else Decimal('0.0')

                parsed_results.append(
                    MacroEventResult(
                        symbol=symbol,
                        event_date=event.get("reportedDate", ""),
                        actual_value=actual,
                        estimated_value=estimate,
                        previous_value=previous,
                        surprise_value=surprise,
                        surprise_percentage=surprise_pct,
                        sentiment_score=sentiment
                    )
                )
            
            logger.info(f"[AlphaVantage] Extracción exitosa. {len(parsed_results)} eventos procesados para {symbol}.")
            return parsed_results

        except RequestException as e:
            logger.error(f"[AlphaVantage] Fallo de conectividad al ingerir datos de {symbol}: {str(e)}")
            return []
        except Exception as e:
            logger.exception(f"[AlphaVantage] Error inesperado en el parsing de datos para {symbol}: {str(e)}")
            return []
