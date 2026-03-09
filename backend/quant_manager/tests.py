"""
Tests básicos de QuantTablet Backend.
Cubre modelos, endpoints de API y lógica de riesgo.
Para ejecutar: python manage.py test quant_manager
"""
from unittest.mock import patch, MagicMock
from django.test import TestCase, Client
from django.conf import settings as django_settings
from .models import (
    RiskSettings, EquitySnapshot, MarketWatchSignal,
    MarketWatchSettings, SymbolProfitTarget
)


class RiskSettingsModelTest(TestCase):
    def test_get_settings_creates_singleton(self):
        s1 = RiskSettings.get_settings()
        s2 = RiskSettings.get_settings()
        self.assertEqual(s1.pk, s2.pk)
        self.assertEqual(s1.id, 1)

    def test_default_values(self):
        s = RiskSettings.get_settings()
        self.assertEqual(float(s.max_drawdown_percent), 5.0)
        self.assertEqual(float(s.default_lot_size), 0.01)
        self.assertTrue(s.is_trading_active)
        self.assertFalse(s.is_profit_monitor_active)
        self.assertFalse(s.is_stop_loss_monitor_active)

    def test_update_settings(self):
        s = RiskSettings.get_settings()
        s.profit_target_percent = 2.50
        s.save()
        reloaded = RiskSettings.get_settings()
        self.assertAlmostEqual(float(reloaded.profit_target_percent), 2.50)


class MarketWatchSettingsModelTest(TestCase):
    def test_get_settings_singleton(self):
        s1 = MarketWatchSettings.get_settings()
        s2 = MarketWatchSettings.get_settings()
        self.assertEqual(s1.pk, s2.pk)

    def test_default_fractal_timeframes(self):
        s = MarketWatchSettings.get_settings()
        self.assertIn('H1', s.fractal_timeframes)
        self.assertTrue(s.is_fractal_active)
        self.assertTrue(s.is_ema_active)


class EquitySnapshotModelTest(TestCase):
    def test_create_snapshot(self):
        snap = EquitySnapshot.objects.create(
            account_id=12345,
            balance=10000.00,
            equity=10250.00,
            credit=0.00
        )
        self.assertEqual(snap.account_id, 12345)
        self.assertAlmostEqual(float(snap.equity), 10250.00)

    def test_ordering_newest_first(self):
        EquitySnapshot.objects.create(account_id=1, balance=100, equity=100, credit=0)
        EquitySnapshot.objects.create(account_id=1, balance=110, equity=110, credit=0)
        snaps = EquitySnapshot.objects.filter(account_id=1)
        self.assertGreaterEqual(snaps[0].timestamp, snaps[1].timestamp)


class MarketWatchSignalModelTest(TestCase):
    def test_create_signal(self):
        sig = MarketWatchSignal.objects.create(
            symbol='EURUSD',
            status='FRACTAL_MATCH',
            fractal_type='SWING_HIGH',
            fractal_price=1.08500,
            matched_tfs=['H1', 'H4'],
        )
        self.assertEqual(sig.symbol, 'EURUSD')
        self.assertEqual(sig.fractal_type, 'SWING_HIGH')
        self.assertEqual(sig.matched_tfs, ['H1', 'H4'])

    def test_symbol_unique(self):
        MarketWatchSignal.objects.create(symbol='GBPUSD', status='SCANNING')
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            MarketWatchSignal.objects.create(symbol='GBPUSD', status='SCANNING')


class SymbolProfitTargetModelTest(TestCase):
    def test_create_target(self):
        target = SymbolProfitTarget.objects.create(
            symbol='EURUSD',
            target_profit_usd=50.00,
            is_profit_active=True,
            target_loss_usd=30.00,
            is_loss_active=False,
        )
        self.assertEqual(target.symbol, 'EURUSD')
        self.assertAlmostEqual(float(target.target_profit_usd), 50.00)


class HealthEndpointTest(TestCase):
    def setUp(self):
        self.client = Client()

    @patch('quant_manager.views.MT5Engine.get_account_info', return_value=None)
    @patch('quant_manager.views.MarketWatchScanner', create=True)
    def test_health_accessible_without_auth(self, mock_scanner, mock_mt5):
        """Health endpoint debe responder sin API KEY."""
        response = self.client.get('/api/health/')
        self.assertIn(response.status_code, [200, 404])  # 404 si URL no configurada en test

    def test_health_no_api_key_required(self):
        """Verificar que HealthView tiene permiso AllowAny."""
        from .views import HealthView
        from rest_framework.permissions import AllowAny
        view = HealthView()
        self.assertIn(AllowAny, view.permission_classes)


class RiskSettingsAPITest(TestCase):
    def setUp(self):
        self.client = Client()
        self.api_key = django_settings.API_SECRET_KEY

    def test_get_settings_requires_auth(self):
        response = self.client.get('/api/settings/')
        self.assertEqual(response.status_code, 403)

    def test_get_settings_with_valid_key(self):
        response = self.client.get('/api/settings/', HTTP_X_API_KEY=self.api_key)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('max_drawdown_percent', data)
        self.assertIn('is_trading_active', data)

    def test_put_settings_updates_value(self):
        payload = {'profit_target_percent': '3.50', 'is_profit_monitor_active': False}
        response = self.client.put(
            '/api/settings/',
            data=payload,
            content_type='application/json',
            HTTP_X_API_KEY=self.api_key
        )
        self.assertEqual(response.status_code, 200)
        s = RiskSettings.get_settings()
        self.assertAlmostEqual(float(s.profit_target_percent), 3.50)


class MarketWatchSignalsAPITest(TestCase):
    def setUp(self):
        self.client = Client()
        self.api_key = django_settings.API_SECRET_KEY

    def test_signals_returns_classified_groups(self):
        MarketWatchSignal.objects.create(
            symbol='EURUSD',
            status='FRACTAL_MATCH',
            fractal_type='SWING_HIGH',
            fractal_price=1.08500,
            matched_tfs=['H1'],
        )
        response = self.client.get(
            '/api/market-watch/signals/',
            HTTP_X_API_KEY=self.api_key
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('fractals', data)
        self.assertIn('emas', data)
        self.assertIn('all', data)
        self.assertEqual(len(data['fractals']), 1)

    def test_signals_empty_when_no_data(self):
        response = self.client.get(
            '/api/market-watch/signals/',
            HTTP_X_API_KEY=self.api_key
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['fractals'], [])


class EquityHistoryAPITest(TestCase):
    def setUp(self):
        self.client = Client()
        self.api_key = django_settings.API_SECRET_KEY

    def test_equity_history_returns_list(self):
        EquitySnapshot.objects.create(account_id=999, balance=10000, equity=10100, credit=0)
        response = self.client.get(
            '/api/equity-history/?tf=M1',
            HTTP_X_API_KEY=self.api_key
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)
