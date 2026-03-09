from rest_framework.permissions import BasePermission
from django.conf import settings

class HasValidAPIKey(BasePermission):
    """
    Permite el acceso solo a peticiones que traigan el header X-API-KEY
    con el valor exacto definido en el settings (y .env).
    """
    def has_permission(self, request, view):
        # Permitir conexiones locale desde la misma maquina si están por DEBUG
        # Pero por seguridad, todas requeriran llave
        api_key = request.headers.get('X-API-KEY')
        if not api_key:
            # Alternativa por query param para llamadas directas como el navegador o webhook simple
            api_key = request.GET.get('api_key')
            
        return api_key == settings.API_SECRET_KEY
