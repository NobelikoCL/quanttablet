from django.urls import path
from .views import (
    AccountStatusView, DashboardDataView, RiskSettingsView, EmergencyCloseAllView,
    GroupedPositionsView, SetGlobalBreakevenView, SetBreakevenBySymbolView, ClosePositionsAtProfitView,
    HistoryView, PerformanceMetricsView, EquityHistoryView, ClosePositionsBySymbolView, SymbolProfitTargetView,
    MarketWatchSignalsView, MarketWatchSettingsView, ClosePositionsByDirectionView,
    CloseWinningPositionsBySymbolView, SessionAssetsView,
    MT5TerminalListView, MT5TerminalDetailView, TerminalPositionsView,
    CopyTradeView, SymbolMappingView, TerminalSymbolsView,
    EconomicCalendarView, MacroNewsView, HealthView
)

urlpatterns = [
    path('api/account/', AccountStatusView.as_view(), name='account_status'),
    path('api/dashboard-data/', DashboardDataView.as_view(), name='dashboard_data'),
    path('api/settings/', RiskSettingsView.as_view(), name='risk_settings'),
    path('api/actions/close_all/', EmergencyCloseAllView.as_view(), name='close_all'),
    path('api/positions/', GroupedPositionsView.as_view(), name='positions'),
    path('api/actions/breakeven/', SetGlobalBreakevenView.as_view(), name='breakeven'),
    path('api/actions/breakeven_symbol/', SetBreakevenBySymbolView.as_view(), name='breakeven_symbol'),
    path('api/actions/close_profit/', ClosePositionsAtProfitView.as_view(), name='close_profit'),
    path('api/actions/close_symbol/', ClosePositionsBySymbolView.as_view(), name='close_symbol'),
    path('api/actions/close_direction/', ClosePositionsByDirectionView.as_view(), name='close_direction'),
    path('api/actions/close_winning_symbol/', CloseWinningPositionsBySymbolView.as_view(), name='close_winning_symbol'),
    path('api/symbol-targets/', SymbolProfitTargetView.as_view(), name='symbol_targets'),
    path('api/history/', HistoryView.as_view(), name='history'),
    path('api/history/metrics/', PerformanceMetricsView.as_view(), name='history_metrics'),
    path('api/equity-history/', EquityHistoryView.as_view(), name='equity_history'),
    
    # Market Watch
    path('api/market-watch/signals/', MarketWatchSignalsView.as_view(), name='mw_signals'),
    path('api/market-watch/settings/', MarketWatchSettingsView.as_view(), name='mw_settings'),

    # Session Assets
    path('api/session-assets/', SessionAssetsView.as_view(), name='session_assets'),

    # Multi-Terminal
    path('api/terminals/', MT5TerminalListView.as_view(), name='terminal_list'),
    path('api/terminals/<int:terminal_id>/', MT5TerminalDetailView.as_view(), name='terminal_detail'),
    path('api/terminals/positions/', TerminalPositionsView.as_view(), name='terminal_positions'),
    path('api/terminals/<int:terminal_id>/symbols/', TerminalSymbolsView.as_view(), name='terminal_symbols'),
    path('api/terminals/copy-trade/', CopyTradeView.as_view(), name='copy_trade'),
    path('api/terminals/symbol-mappings/', SymbolMappingView.as_view(), name='symbol_mappings'),

    # Calendario Económico & Noticias Macro
    path('api/economic-calendar/', EconomicCalendarView.as_view(), name='economic_calendar'),
    path('api/macro-news/', MacroNewsView.as_view(), name='macro_news'),

    # Health Check (sin autenticación - monitoreo externo)
    path('api/health/', HealthView.as_view(), name='health'),
]
