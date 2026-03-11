"""
Router de base de datos para QuantTablet.

Split:
  default  → Todo Django + configuraciones (baja frecuencia de escritura)
  scanner  → MarketWatchSignal exclusivamente (alta frecuencia: cada 5s × todos los símbolos)

Objetivo: evitar que el scanner bloquee las peticiones API y viceversa.
"""


class ScannerRouter:
    SCANNER_MODELS = {'marketwatchsignal'}

    def _is_scanner(self, model):
        return model._meta.model_name in self.SCANNER_MODELS

    def db_for_read(self, model, **hints):
        return 'scanner' if self._is_scanner(model) else 'default'

    def db_for_write(self, model, **hints):
        return 'scanner' if self._is_scanner(model) else 'default'

    def allow_relation(self, obj1, obj2, **hints):
        # MarketWatchSignal no tiene FK hacia otras tablas, así que siempre OK
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if db == 'scanner':
            # En scanner.sqlite3 solo permitir modelos del conjunto SCANNER_MODELS.
            # model_name puede ser None cuando Django evalúa migraciones completas de una app;
            # en ese caso bloqueamos para no duplicar tablas innecesarias.
            return model_name in self.SCANNER_MODELS
        # En default, bloquear los modelos exclusivos de scanner
        if model_name in self.SCANNER_MODELS:
            return False
        return True
