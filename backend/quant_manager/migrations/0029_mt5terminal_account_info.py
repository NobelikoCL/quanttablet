from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quant_manager', '0028_add_trailing_stop_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='mt5terminal',
            name='account_login',
            field=models.BigIntegerField(blank=True, help_text='Número de cuenta MT5 (login)', null=True),
        ),
        migrations.AddField(
            model_name='mt5terminal',
            name='account_server',
            field=models.CharField(blank=True, default='', help_text='Servidor del broker (ej: ICMarkets-Live)', max_length=100),
        ),
        migrations.AddField(
            model_name='mt5terminal',
            name='account_balance',
            field=models.DecimalField(blank=True, decimal_places=2, help_text='Balance de la cuenta (cacheado)', max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='mt5terminal',
            name='account_equity',
            field=models.DecimalField(blank=True, decimal_places=2, help_text='Equity de la cuenta (cacheado)', max_digits=12, null=True),
        ),
        migrations.AddField(
            model_name='mt5terminal',
            name='account_currency',
            field=models.CharField(blank=True, default='USD', help_text='Divisa de la cuenta', max_length=10),
        ),
        migrations.AddField(
            model_name='mt5terminal',
            name='account_name',
            field=models.CharField(blank=True, default='', help_text='Nombre del titular de la cuenta', max_length=200),
        ),
        migrations.AddField(
            model_name='mt5terminal',
            name='account_type',
            field=models.CharField(blank=True, default='', help_text='Tipo de cuenta: demo / real / contest', max_length=20),
        ),
        migrations.AddField(
            model_name='mt5terminal',
            name='last_sync_at',
            field=models.DateTimeField(blank=True, help_text='Última vez que se sincronizaron los datos de cuenta', null=True),
        ),
    ]
