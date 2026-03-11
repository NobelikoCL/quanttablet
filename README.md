# QuantTablet — Panel de Trading Cuantitativo

> Plataforma completa de operaciones de trading con integración en tiempo real con MetaTrader 5, diseñada para traders activos en Windows.

---

## Descripción General

QuantTablet es un dashboard web local que se conecta directamente a uno o más terminales de **MetaTrader 5** que se ejecutan en la misma máquina. Proporciona monitoreo de cuenta en tiempo real, gestión de riesgos automatizada, un escáner de mercado multi-temporal y un centro de notificaciones unificado, todo accesible desde cualquier dispositivo en su red local (PC, tablet, teléfono).

---

## Capturas de Pantalla

> Dashboard · Market Watch · Calendario Económico · Historial · Centro de Notificaciones

---

## Características

### Trading y Gestión de Riesgos
- **Datos de cuenta en vivo**: Balance, equidad, margen y P&L flotante actualizados cada 3 segundos.
- **Monitor de ganancias global**: Cierra automáticamente todas las posiciones cuando se alcanza un objetivo de % configurable.
- **Monitor de stop loss global**: Cierra automáticamente todas las posiciones y deshabilita el trading cuando se alcanza un drawdown de % configurable.
- **Alertas proactivas de drawdown**: Avisos visuales al 50%, 75% y 90% del límite de drawdown configurado.
- **Automatización de Breakeven**: Establece el SL al precio de entrada en todas las posiciones ganadoras de forma global o por símbolo.
- **Objetivos por símbolo**: Límites individuales de ganancias y pérdidas en USD con cierre automático por símbolo.
- **Cierre de emergencia**: Botón único para liquidar todas las posiciones abiertas instantáneamente.
- **Cierre por dirección**: Cierra solo el lado BUY o SELL de un símbolo de forma independiente.

### Escáner de Mercado
- **Detección de Fractales**: Fractales de Bill Williams confirmados en marcos temporales configurables (M5 a D1).
- **Confluencia de EMA**: Detecta la alineación de múltiples EMAs en varios marcos temporales (M15 a H4).
- **Acción del Precio**: Detección de rupturas (breakouts) en M15.
- **Señales Estocásticas**: Cruce alcista/bajista, detección de sobrecompra/sobreventa.
- **Filtro de Volumen**: Identifica símbolos con volumen anormal en comparación con su media móvil.
- **Multihilo**: Escanea todos los símbolos visibles en MT5 en paralelo utilizando ThreadPoolExecutor.
- **Configurable**: Habilita/deshabilita cada tipo de señal, establece marcos temporales y filtra símbolos.

### Centro de Notificaciones
- **Panel unificado**: Fractales y noticias macro en un solo lugar, ordenados por tiempo.
- **Seguimiento de leídos**: Punto azul en elementos no leídos que desaparece al leer.
- **Marcar todo como leído**: Botón único para limpiar el contador de no leídos sin borrar el historial.
- **Descartar individuales**: Botón X por elemento; los fractales descartados no volverán a aparecer del escáner.
- **Filtros por pestañas**: Todo / No leídos / Fractales / Macro.
- **Alertas emergentes (Toasts)**: Alertas en tiempo real para nuevos fractales y noticias macro con sonido.

### Calendario Económico
- **Widget de TradingView**: Eventos macro en vivo con detalles completos.
- **Filtro de impacto**: Alterna entre eventos de impacto Alto / Medio / Bajo.
- **Filtro de moneda**: Muestra/oculta eventos por moneda (USD, EUR, GBP, JPY, AUD, CAD, CHF, NZD, CNY).
- **Cuenta regresiva**: Temporizador en vivo para el próximo evento macro de alto impacto utilizando datos de ForexFactory.

### Análisis de Rendimiento (Pestaña Historial)
- **Win Rate, Profit Factor, Net Profit, Avg Win/Loss**.
- **Sharpe Ratio**: Calculado a partir de la distribución de los retornos de las operaciones cerradas.
- **Drawdown Máximo**: Calculado a partir de la serie de P&L acumulado (USD y %).
- **Gráfico de P&L acumulado**: Gráfico de área que muestra la curva de equidad de las operaciones cerradas.
- **Exportación CSV**: Descarga cualquier periodo filtrado como una hoja de cálculo.
- **Selector de periodo**: Hoy / Semana / Mes / Año / Todo el tiempo.

### Multi-Cuenta (Copy Trading)
- Registra múltiples terminales MT5 (diferentes brokers).
- Visualiza posiciones en todos los terminales simultáneamente.
- Copia o cierra operaciones de un terminal a otro.
- Mapeo de símbolos entre brokers (ej. `GOLD` → `XAUUSD`).
- Cambia el terminal activo en tiempo de ejecución sin reiniciar.

### UX e Interfaz
- **Tema oscuro Glassmorphism**: Optimizado para entornos de trading con poca luz.
- **Responsivo**: Funciona en móviles, tablets, computadoras de escritorio y monitores 2K.
- **Skeleton loaders**: Transiciones de carga suaves en lugar de pantallas en blanco.
- **Detección de desconexión**: Muestra el tiempo desde la última conexión, con reconexión mediante retroceso exponencial (5s → 10s → 20s → 40s → 60s).
- **Temporizador de sesiones**: Cuenta regresiva para las sesiones de Londres, Nueva York, Tokio y Sídney.
- **Acceso LAN**: Accede desde cualquier dispositivo en la red local mediante la IP autodetectada.

---

## Pila Tecnológica

| Capa | Tecnología |
|-------|-----------|
| Framework Backend | Django 6.0 + Django REST Framework 3.16 |
| Integración MT5 | Librería Python MetaTrader5 5.0.5640 |
| Procesamiento de Datos | NumPy 2.4 + Pandas 3.0 |
| Base de Datos | SQLite3 (local, no requiere configuración) |
| Autenticación | Encabezado de API Key (`X-API-KEY`) |
| Framework Frontend | React 19 + Vite 7 |
| Estilos | TailwindCSS 4 |
| Gráficos | Recharts 3 |
| Iconos | Lucide React |
| Cliente HTTP | Axios |
| Notificaciones | react-hot-toast |

---

## Estructura del Proyecto

```
quanttablet/
├── backend/
│   ├── config/                  # Ajustes de Django, URLs, ASGI/WSGI
│   ├── quant_manager/
│   │   ├── models.py            # RiskSettings, EquitySnapshot, Signals, Terminals
│   │   ├── views.py             # 28 endpoints de la API REST
│   │   ├── mt5_client.py        # MT5Engine — conexión, posiciones, monitor de riesgo
│   │   ├── scanner.py           # MarketWatchScanner — detección multihilo de señales
│   │   ├── price_action.py      # Lógica de fractales, EMA y Estocástico
│   │   ├── serializers.py       # Serializadores DRF
│   │   ├── permissions.py       # Autenticación por API Key
│   │   ├── tests.py             # 20 pruebas de backend
│   │   └── services/            # Integraciones con ForexFactory + Alpha Vantage
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── App.jsx              # Raíz — rutas, centro de notificaciones, sondeo
│       ├── api.js               # Autodetecta la IP del backend para acceso LAN
│       └── components/
│           ├── DashboardTab.jsx         # Posiciones, gráfico de equidad, acciones de riesgo
│           ├── MarketWatchTab.jsx       # Tabla de señales del escáner + ajustes
│           ├── HistoryTab.jsx           # Historial, gráfico P&L, analíticas
│           ├── EconomicCalendarTab.jsx  # Widget de calendario + filtros + cuenta regresiva
│           ├── AccountsTab.jsx          # Copy trading multi-terminal
│           ├── RiskSettingsForm.jsx     # Configuración de riesgo global
│           ├── MarketSessionTimer.jsx   # Emergente de cuenta regresiva de sesiones
│           ├── MetricsPanel.jsx         # Tarjetas de métricas superiores
│           └── SkeletonLoader.jsx       # Componentes de estado de carga
│
├── install.bat      # Instalación con un clic (Python venv + pip + npm install)
├── start.bat        # Inicio con un clic (Django + React dev server)
└── .gitignore       # Excluye venv, node_modules, db, logs, .env
```

---

## Requisitos

- **Windows 10/11** (MetaTrader 5 es exclusivo de Windows)
- **Terminal MetaTrader 5** instalado y con sesión iniciada
- **Python 3.11+**
- **Node.js 18+**

---

## Instalación

**1. Clonar el repositorio**
```bash
git clone https://github.com/NobelikoCL/quanttablet.git
cd quanttablet
```

**2. Ejecutar el instalador** (crea el venv de Python e instala todas las dependencias)
```
install.bat
```

**3. Iniciar el panel**
```
start.bat
```

El lanzador:
- Autodetectará su IP local.
- Creará `backend/.env` si no existe.
- Ejecutará las migraciones de Django.
- Iniciará Django en `0.0.0.0:8000`.
- Iniciará el servidor de desarrollo de React en `0.0.0.0:5173`.

**4. Abrir en el navegador**
```
http://localhost:5173
```
O desde cualquier dispositivo en su LAN:
```
http://<su-ip-local>:5173
```

---

## Notas

- La base de datos (`db.sqlite3`) está excluida del repositorio. Se crea automáticamente en la primera ejecución mediante `manage.py migrate`.
- Los logs se almacenan en `backend/quant_backend_logs.log` con rotación automática (10 MB × 5 archivos).
- El frontend autodetecta la IP del backend usando `window.location.hostname`.
- MT5 debe estar ejecutándose y conectado a una cuenta antes de iniciar el backend.

---

## Licencia

Ver [LICENSE](LICENSE) para más detalles.
