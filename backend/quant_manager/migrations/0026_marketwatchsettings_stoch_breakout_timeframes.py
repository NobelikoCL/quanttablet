from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('quant_manager', '0025_marketwatchsignal_breakout_m15'),
    ]

    operations = [
        migrations.AddField(
            model_name='marketwatchsettings',
            name='stoch_timeframes',
            field=models.CharField(
                default='M15,M30,H1,H4,D1',
                help_text='Temporalidades a evaluar para el estocástico, separadas por coma',
                max_length=50,
            ),
        ),
        migrations.AddField(
            model_name='marketwatchsettings',
            name='breakout_timeframe',
            field=models.CharField(
                default='M15',
                help_text='Temporalidad del canal Donchian para detectar rupturas',
                max_length=10,
            ),
        ),
    ]
