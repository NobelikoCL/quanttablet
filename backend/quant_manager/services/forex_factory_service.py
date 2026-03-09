import logging
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from django.utils import timezone

logger = logging.getLogger(__name__)

class ForexFactoryService:
    XML_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml"
    
    # "Better than expected" logic para interpretar si el resultado fortalece o debilita la moneda
    # Si la keyword está en INVERSE_KEYWORDS, un dato mayor a lo estimado es MALO (Bearish) para esa moneda.
    # Por defecto, se asume que un dato mayor es BUENO (Bullish).
    INVERSE_KEYWORDS = [
        "Unemployment", 
        "Jobless Claims", 
        "Trade Balance",  # usualmente deficit, por lo que más deficit es malo
        "Inflation",
        "CPI", # La inflación es compleja (para divisas a veces es bullish por tasas, pero a nivel de mkt es bearish). Lo tomaremos como "Higher CPI -> Bearish Stocks / Bullish USD"
    ]

    @classmethod
    def get_recent_news(cls):
        """
        Descarga el XML, lo parsea y devuelve los eventos de "hoy" que ya tienen el campo 'actual'.
        Ideal para hacer polling desde el frontend cada 30-60 segs.
        """
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/xml'
            }
            res = requests.get(cls.XML_URL, headers=headers, timeout=10)
            res.raise_for_status()
            
            # Limpiar contenido extraño (A veces FF tiene un warning header)
            content = res.text
            if "<?xml" not in content:
                # Tratar de encontrar el inicio del xml
                start = content.find("<?xml")
                if start != -1:
                    content = content[start:]
                else:
                    logger.error("[ForexFactory] El feed no parece contener XML válido.")
                    return []

            root = ET.fromstring(content)
            events = []
            
            now_date_str = timezone.now().strftime("%m-%d-%Y") # FF format: MM-dd-yyyy
            
            for event in root.findall('event'):
                date_text = event.findtext('date')
                # Solo nos importan las noticias de HOY para las alertas push en vivo
                if date_text != now_date_str:
                    continue
                    
                actual_text = event.findtext('actual')
                # Solo enviar alertas si YA salió el dato y no está vacío
                if not actual_text or not actual_text.strip():
                    continue
                    
                impact = event.findtext('impact')
                # Filtrar solo impacto Alto o Medio para evitar spam
                if impact not in ["High", "Medium"]:
                    continue

                country = event.findtext('country')
                title = event.findtext('title')
                forecast_text = event.findtext('forecast')
                previous_text = event.findtext('previous')
                time_text = event.findtext('time')
                event_id = event.findtext('id') or f"{date_text}_{time_text}_{country}_{title[:10]}"

                # Intentar calcular sentimiento
                sentiment = cls._calculate_sentiment(title, actual_text, forecast_text)

                events.append({
                    "id": event_id.replace(" ", "_"),
                    "title": title,
                    "country": country,
                    "impact": impact,
                    "time": time_text,
                    "actual": actual_text,
                    "forecast": forecast_text,
                    "previous": previous_text,
                    "sentiment": sentiment # "BULL", "BEAR", "NEUTRAL"
                })
                
            # Ordenar por tiempo (asumiendo que vienen por fecha, no es estricto en el polling)
            return events

        except Exception as e:
            logger.error(f"[ForexFactory] Error obteniendo feed XML: {e}")
            return []

    @classmethod
    def _clean_number(cls, val_str):
        if not val_str: return None
        # Eliminar letras como 'K', 'M', '%', ','
        import re
        num_str = re.sub(r'[^\d\.\-]', '', val_str)
        try:
            return float(num_str)
        except:
            return None

    @classmethod
    def _calculate_sentiment(cls, title, actual, forecast):
        if not actual or not forecast:
            return "NEUTRAL"
            
        act_val = cls._clean_number(actual)
        fcst_val = cls._clean_number(forecast)
        
        if act_val is None or fcst_val is None:
            return "NEUTRAL"
            
        is_higher = act_val > fcst_val
        is_lower = act_val < fcst_val
        
        if act_val == fcst_val:
            return "NEUTRAL"
            
        inverse_logic = False
        for kw in cls.INVERSE_KEYWORDS:
            if kw.lower() in title.lower():
                inverse_logic = True
                break
                
        # Por defecto: Mayor a lo estimado = BUL para la moneda
        # Si es inverso: Mayor a lo estimado = BEAR para la moneda
        if is_higher:
            return "BEAR" if inverse_logic else "BULL"
        elif is_lower:
            return "BULL" if inverse_logic else "BEAR"
            
        return "NEUTRAL"
