hola papacito

# QuantTablet - Plataforma de Trading Cuantitativo

## Descripción General
QuantTablet es una plataforma avanzada de visualización y escaneo de mercados financieros, diseñada para traders expertos. Integra un backend robusto en Django con una interfaz frontend premium en React, conectándose directamente con MetaTrader 5 para el análisis técnico en tiempo real.

## Arquitectura del Proyecto (Senior Architect Standards)

### Backend (Django + MT5 + WebSockets)
El sistema utiliza una arquitectura orientada a eventos para minimizar la latencia.
- **Directorio:** `backend/`
- **Tecnologías:** Django, DRF, Django Channels (WebSockets).
- **Componentes Clave:**
  - `quant_manager/scanner.py`: Escáner multihilo optimizado para no bloquear el loop de eventos.
  - `Heartbeat Mechanism`: Sincronización continua para validar la conexión con el terminal MT5 local.
- **Estrategias Avanzadas:** Integración de conceptos ICT (FVG, Order Blocks) en los algoritmos de detección.

### Frontend (React + Zustand + TanStack)
Interfaz de alta fidelidad con diseño "Glassmorphism" y actualizaciones en tiempo real.
- **Directorio:** `frontend/`
- **Tecnologías:** React, TypeScript, Zustand (Estado Global), TanStack Query (Caché de Datos).
- **Visualización:** Integración sugerida de `Lightweight Charts` para gráficos de alto rendimiento.
- **Componentes Clave:**
  - `DashboardTab`: Resumen de equidad, balance y rendimiento (Zustand state).
  - `MarketWatchTab`: Visualización de señales (TanStack Query caching).
  - `RiskSettingsForm`: Configuración técnica y de riesgo.
  - `HistoryTab`: Registro de operaciones y señales pasadas.

## Flujo de Trabajo (Arquitecto Senior)
1. El backend mantiene un `Heartbeat` con MT5 e intenta exponer datos vía WebSockets/Channels (en proceso).
2. El escáner procesa símbolos buscando configuraciones de fractales y EMAs.
3. Los resultados se transmiten al frontend para una UI reactiva.

## Configuración y ejecución
- **Instalación:** Ejecutar `install.bat` en la raíz.
- **Inicio:** Ejecutar `start.bat` para levantar el ecosistema (Django + React).

### Eficiencia y Estabilidad (Memory Management)
Para evitar errores de "Out of Memory" (OOM) en el navegador:
- **Límites de Datos**: Todo flujo en tiempo real (velas, equidad, logs) debe tener un buffer máximo (ej. 500 entradas).
- **Virtualización**: Listas extensas deben renderizarse de forma virtual.
- **Ciclo de Vida**: Prohibido dejar intervalos o suscripciones abiertas al desmontar componentes.

### Diseño Responsivo Multi-Resolución
Como arquitecto, el sistema garantiza una visualización perfecta en:
- **Tablet & Mobile:** Interfaz táctil optimizada (iPad/Tablet LAN).
- **Estaciones 2K:** Aprovechamiento de espacio para análisis multiactivo.
- **Resoluciones 1280x1024:** Adaptabilidad a monitores de trading clásicos.

## Diario de Actualizaciones (Agent Log)
- **2026-02-28 (01:52):** Implementación del **Contador de Sesiones de Mercado** con countdown, popup T-5min con precios de activos, campana de apertura, y horarios configurables desde Settings.
- **2026-02-28 (02:20):** Implementación de **Multi-Cuenta MT5** — Trade Copier entre terminales con comparación de posiciones, copy trade, mapeo de símbolos entre brokers, y pestaña Cuentas activable desde Configuraciones.
- **2026-02-28 (02:09):** Corrección definitiva de **Out of Memory** — loop infinito en useEffect (dependencia `notifications.length`), AudioContext leaks en notificaciones y campana de mercado.
- **2026-02-28 (02:05):** Relojes digitales (hora local + servidor MT5) con zona horaria configurable desde Settings.
- **2026-02-28 (01:52):** Implementación del **Contador de Sesiones de Mercado** con countdown, popup T-5min con precios de activos, campana de apertura, y horarios configurables desde Settings.
- **2026-02-28 (01:28):** Corrección crítica de **Out of Memory** (límite de señales a 50/grupo, equidad a 500 puntos) y **responsividad vertical** (flex-wrap en navegación, botones adaptados, Online visible en mobile).
- **2026-02-28 (01:23):** Creación de la skill `log-error-validator` para asegurar entregas limpias de errores en logs de front y back.
- **2026-02-28 (01:21):** Creación de la skill `startup-script-validator` para asegurar la integridad de archivos de inicio.
- **2026-02-28 (01:20):** Evolución del agente a **Especialista en Diseño Responsivo Multi-Resolución**.
- **2026-02-28 (01:17):** Implementación de estado dinámico para el indicador "Online/Offline" en el frontend y creación de la skill `online-status-monitor`.
- **2026-02-28 (01:15):** Creación de la skill `frontend-resource-optimizer` y actualización de estándares de gestión de memoria para el manejo de data en tiempo real.
- **2026-02-28 (01:10):** Creación de la skill `connection-checker` para diagnóstico automático LAN/Local.
- **2026-02-27 (23:37):** Reparación técnica del backend y eliminación del módulo de psicología.
