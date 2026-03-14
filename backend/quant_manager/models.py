from django.db import models

class RiskSettings(models.Model):
    max_drawdown_percent = models.DecimalField(
        max_digits=5, 
        decimal_places=2, 
        default=5.00,
        help_text="Porcentaje máximo de drawdown permitido antes de cortar operativa"
    )
    default_lot_size = models.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        default=0.01,
        help_text="Lote por defecto para nuevas operaciones"
    )
    equity_profit_target = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=0.00,
        help_text="Cierre masivo al alcanzar esta equidad (0 = Desactivado)"
    )
    global_stop_loss_points = models.IntegerField(
        default=100,
        help_text="Stop loss global expresado en puntos/pips"
    )
    is_trading_active = models.BooleanField(
        default=True,
        help_text="Botón de pánico: desactiva la apertura de nuevas operaciones"
    )
    # Persistencia del monitor de profit
    profit_target_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=1.00,
        help_text="Meta de profit en % para cierre masivo"
    )
    is_profit_monitor_active = models.BooleanField(
        default=False,
        help_text="Estado del monitor de profit"
    )
    # Stop Loss General de la cuenta
    global_stop_loss_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=30.00,
        help_text="Límite de pérdida en % para cierre masivo (ej: 30%)"
    )
    is_stop_loss_monitor_active = models.BooleanField(
        default=False,
        help_text="Estado del monitor de stop loss general"
    )
    
    # Integraciones Externas
    alpha_vantage_api_key = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="API Key para obtener datos macro de Alpha Vantage"
    )
    manual_initial_balance = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0.00,
        help_text="Capital inicial manual para referencia de rendimiento (ej: 560 USD)"
    )
    magic_number = models.IntegerField(
        default=123456,
        help_text="Número mágico para identificar órdenes de este panel en MT5"
    )
    max_deviation = models.IntegerField(
        default=20,
        help_text="Slippage/Desviación máxima en puntos al ejecutar órdenes"
    )
    default_broker_symbol = models.CharField(
        max_length=50,
        default="EURUSD",
        help_text="Símbolo de referencia para sincronizar hora del broker cuando no hay posiciones"
    )

    class Meta:
        verbose_name_plural = "Risk Settings"

    def __str__(self):
        return f"Risk Settings (Drawdown: {self.max_drawdown_percent}%)"

    @classmethod
    def get_settings(cls):
        obj, created = cls.objects.get_or_create(id=1)
        return obj

class EquitySnapshot(models.Model):
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    balance = models.DecimalField(max_digits=12, decimal_places=2)
    equity = models.DecimalField(max_digits=12, decimal_places=2)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    account_id = models.BigIntegerField(db_index=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name_plural = "Equity Snapshots"

    def __str__(self):
        return f"Snapshot {self.account_id} - {self.timestamp} (E: {self.equity})"

class SymbolProfitTarget(models.Model):
    symbol = models.CharField(max_length=50, unique=True, db_index=True)
    
    # Meta de Ganancia (TP USD)
    target_profit_usd = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text="Meta de profit en USD para este símbolo"
    )
    is_profit_active = models.BooleanField(
        default=False,
        help_text="Estado del monitor de profit para este símbolo"
    )

    # Meta de Pérdida (SL USD)
    target_loss_usd = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text="Límite de pérdida en USD para este símbolo (ej: 50.00)"
    )
    is_loss_active = models.BooleanField(
        default=False,
        help_text="Estado del monitor de pérdida para este símbolo"
    )

    # Trailing Stop en USD
    is_trailing_active = models.BooleanField(
        default=False,
        help_text="Activa el trailing stop por símbolo"
    )
    trail_distance_usd = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=5.00,
        help_text="Distancia de retroceso en USD para activar el cierre (ej: 5.00)"
    )
    trail_peak_usd = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00,
        help_text="Máximo profit registrado desde que el trailing está activo (auto-actualizado)"
    )

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Targets {self.symbol}: +${self.target_profit_usd} / -${self.target_loss_usd}"

class MarketWatchSettings(models.Model):
    symbols = models.TextField(default="ALL", help_text="Símbolos a monitorear. Usa 'ALL' para escanear todo el Market Watch de MT5.")
    is_scanner_active = models.BooleanField(default=True, help_text="Activa/Desactiva el escaneo general")
    
    # Configuraciones de Fractales (Multi-Timeframe)
    is_fractal_active = models.BooleanField(default=True, help_text="Activa/Desactiva el escaneo de Fractales de Bill Williams")
    fractal_timeframes = models.CharField(
        max_length=50, 
        default="M5,M15,M30,H1,H4,D1", 
        help_text="Temporalidades a evaluar para fractales, separadas por coma"
    )

    # Configuraciones de EMA Confluence
    is_ema_active = models.BooleanField(default=True, help_text="Activa/Desactiva el escaneo de Confluencia EMA")
    ema_timeframes = models.CharField(
        max_length=50, 
        default="M15,M30,H1,H4", 
        help_text="Temporalidades a evaluar para EMAs, separadas por coma"
    )
    
    # Configuraciones de Estocástico
    stoch_timeframes = models.CharField(
        max_length=50,
        default="M15,M30,H1,H4,D1",
        help_text="Temporalidades a evaluar para el estocástico, separadas por coma"
    )

    # Configuración de Ruptura (Donchian)
    breakout_timeframe = models.CharField(
        max_length=10,
        default="M15",
        help_text="Temporalidad del canal Donchian para detectar rupturas"
    )

    # Configuraciones de Volumen
    is_volume_filter_active = models.BooleanField(default=False, help_text="Resaltar símbolos con volumen inusual")
    volume_min_multiplier = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=1.50,
        help_text="Multiplicador sobre la media para considerar volumen alto (ej: 1.5)"
    )

    class Meta:
        verbose_name_plural = "Market Watch Settings"

    @classmethod
    def get_settings(cls):
        obj, created = cls.objects.get_or_create(id=1)
        return obj

class MarketWatchSignal(models.Model):
    STATUS_CHOICES = [
        ('SCANNING', 'Scanning'),
        ('FRACTAL_MATCH', 'Fractal Match'),
        ('EMA_MATCH', 'EMA Match'),
    ]
    
    symbol = models.CharField(max_length=50, unique=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='SCANNING')
    
    # Datos de Fractales
    fractal_type = models.CharField(max_length=20, blank=True, null=True, help_text="SWING_HIGH o SWING_LOW")
    fractal_price = models.DecimalField(max_digits=15, decimal_places=5, blank=True, null=True, help_text="Precio del vértice del fractal")
    fractal_time = models.CharField(max_length=50, blank=True, null=True, help_text="Hora de la vela del fractal")
    matched_tfs = models.JSONField(default=list, help_text="Lista de temporalidades donde se detectó el fractal")
    
    # Datos de EMA
    ema_signal = models.CharField(max_length=20, blank=True, null=True, help_text="BULLISH o BEARISH")
    ema_matched_tfs = models.JSONField(default=list, help_text="Lista de TFs donde hay confluencia")
    ema_200_h1_status = models.CharField(max_length=20, blank=True, null=True, help_text="ABOVE_EMA200 o BELOW_EMA200 en H1")
    
    # Datos de Estocástico
    stoch_status = models.CharField(max_length=500, blank=True, null=True, help_text="BULLISH_CROSS, BEARISH_CROSS, OVERBOUGHT, OVERSOLD")
    stoch_data = models.JSONField(default=dict, help_text="Datos detallados de estocástico por TF")

    # Datos de Rupturas
    breakout_m15 = models.CharField(max_length=50, default='RANGE', help_text="RANGE, BULLISH_BREAKOUT, BEARISH_BREAKOUT")

    # Datos de Volumen
    tick_volume = models.BigIntegerField(default=0, help_text="Volumen de ticks actual")
    volume_ma = models.FloatField(default=0.0, help_text="Media móvil del volumen (filtro)")

    # Precio actual y formato según tipo de instrumento
    current_bid = models.DecimalField(max_digits=15, decimal_places=8, blank=True, null=True, help_text="Precio bid actual del tick")
    symbol_digits = models.IntegerField(default=5, help_text="Decimales del símbolo según MT5 (forex=5, índices=2, etc.)")

    last_update = models.DateTimeField(auto_now=True)
    message = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.symbol} - {self.status}"


class MT5Terminal(models.Model):
    """Terminal MT5 registrada para soporte multi-cuenta."""
    name = models.CharField(
        max_length=100,
        help_text="Nombre amigable (ej: 'Cuenta Principal', 'Prop Firm')"
    )
    terminal_path = models.CharField(
        max_length=500,
        help_text="Ruta completa al terminal64.exe del broker"
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Terminal por defecto al iniciar el sistema"
    )
    is_active = models.BooleanField(
        default=False,
        help_text="Terminal actualmente conectada"
    )
    order = models.IntegerField(default=0, help_text="Orden de display")
    created_at = models.DateTimeField(auto_now_add=True)

    # ── Datos de cuenta (cacheados tras sincronización con MT5) ──────────────
    account_login = models.BigIntegerField(
        null=True, blank=True,
        help_text="Número de cuenta MT5 (login)"
    )
    account_server = models.CharField(
        max_length=100, blank=True, default='',
        help_text="Servidor del broker (ej: ICMarkets-Live)"
    )
    account_balance = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Balance de la cuenta (cacheado)"
    )
    account_equity = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Equity de la cuenta (cacheado)"
    )
    account_currency = models.CharField(
        max_length=10, blank=True, default='USD',
        help_text="Divisa de la cuenta"
    )
    account_name = models.CharField(
        max_length=200, blank=True, default='',
        help_text="Nombre del titular de la cuenta"
    )
    account_type = models.CharField(
        max_length=20, blank=True, default='',
        help_text="Tipo de cuenta: demo / real / contest"
    )
    last_sync_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Última vez que se sincronizaron los datos de cuenta"
    )

    class Meta:
        ordering = ['order', 'id']
        verbose_name_plural = "MT5 Terminals"

    def __str__(self):
        active = " [ACTIVA]" if self.is_active else ""
        return f"{self.name} — {self.terminal_path}{active}"

    def save(self, *args, **kwargs):
        # SANITIZACIÓN BÁSICA DE SEGURIDAD
        if self.terminal_path:
            import os
            self.terminal_path = str(self.terminal_path).strip()
            if not self.terminal_path.lower().endswith('.exe'):
                raise ValueError("La ruta del terminal debe ser un ejecutable (.exe)")
            if 'cmd.exe' in self.terminal_path.lower() or 'powershell' in self.terminal_path.lower():
                raise ValueError("Ruta no permitida por seguridad.")
                
        # Si se marca como activa, desactivar las demás
        if self.is_active:
            MT5Terminal.objects.exclude(pk=self.pk).update(is_active=False)
        # Si es la primera terminal, hacerla default y activa
        if not self.pk and MT5Terminal.objects.count() == 0:
            self.is_default = True
            self.is_active = True
        super().save(*args, **kwargs)

    @classmethod
    def get_active(cls):
        """Retorna la terminal activa o la default."""
        active = cls.objects.filter(is_active=True).first()
        if active:
            return active
        default = cls.objects.filter(is_default=True).first()
        if default:
            default.is_active = True
            default.save()
            return default
        return cls.objects.first()


class SymbolMapping(models.Model):
    """Mapeo de nombres de símbolos entre terminales MT5 de diferentes brokers."""
    terminal_a = models.ForeignKey(MT5Terminal, related_name='mappings_a', on_delete=models.CASCADE)
    terminal_b = models.ForeignKey(MT5Terminal, related_name='mappings_b', on_delete=models.CASCADE)
    symbol_a = models.CharField(max_length=50, help_text="Nombre del símbolo en terminal A")
    symbol_b = models.CharField(max_length=50, help_text="Nombre del símbolo equivalente en terminal B")

    class Meta:
        unique_together = ['terminal_a', 'terminal_b', 'symbol_a']
        verbose_name_plural = "Symbol Mappings"

    def __str__(self):
        return f"{self.terminal_a.name}: {self.symbol_a} ↔ {self.terminal_b.name}: {self.symbol_b}"
