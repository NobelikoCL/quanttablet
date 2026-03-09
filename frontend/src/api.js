// Detecta automáticamente la IP del host para conectar la Tablet vía LAN
// En producción, la Tablet accede mediante la IP local de la PC (ej: 192.168.x.x:8000)
const API_BASE = `http://${window.location.hostname}:8000`;

export default API_BASE;
