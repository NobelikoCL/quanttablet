import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class QuantManagerConfig(AppConfig):
    name = 'quant_manager'

    def ready(self):
        import os
        # Evitar doble ejecución en el servidor de desarrollo de Django
        if os.environ.get('RUN_MAIN') == 'true':
            from .mt5_client import MT5Engine
            MT5Engine.initialize()
            logger.info("MT5 Engine e Hilo de Riesgo inicializados correctamente.")
