from rest_framework import serializers
from .models import RiskSettings, SymbolProfitTarget, MarketWatchSettings, MarketWatchSignal, MT5Terminal, SymbolMapping

class RiskSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = RiskSettings
        fields = '__all__'

class SymbolProfitTargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = SymbolProfitTarget
        fields = '__all__'

class MarketWatchSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketWatchSettings
        fields = [
            'id', 'symbols', 'is_scanner_active', 
            'is_fractal_active', 'fractal_timeframes',
            'is_ema_active', 'ema_timeframes',
            'is_volume_filter_active', 'volume_min_multiplier'
        ]

class MarketWatchSignalSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarketWatchSignal
        fields = [
            'id', 'symbol', 'status', 
            'fractal_type', 'fractal_price', 'fractal_time', 'matched_tfs',
            'ema_signal', 'ema_matched_tfs', 'ema_200_h1_status',
            'stoch_status', 'stoch_data', 'breakout_m15',
            'tick_volume', 'volume_ma',
            'last_update', 'message'
        ]

class MT5TerminalSerializer(serializers.ModelSerializer):
    class Meta:
        model = MT5Terminal
        fields = '__all__'

class SymbolMappingSerializer(serializers.ModelSerializer):
    terminal_a_name = serializers.CharField(source='terminal_a.name', read_only=True)
    terminal_b_name = serializers.CharField(source='terminal_b.name', read_only=True)

    class Meta:
        model = SymbolMapping
        fields = ['id', 'terminal_a', 'terminal_b', 'terminal_a_name', 'terminal_b_name', 'symbol_a', 'symbol_b']
