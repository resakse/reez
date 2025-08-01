from rest_framework.permissions import BasePermission


class IsSuperUser(BasePermission):
    """
    Allows access only to superusers.
    """
    
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class IsStaff(BasePermission):
    """
    Allows access only to staff users.
    """
    
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


class IsStaffOrReadOnly(BasePermission):
    """
    Custom permission to only allow staff users to edit objects.
    Read permissions are granted to any authenticated user.
    """
    
    def has_permission(self, request, view):
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return request.user and request.user.is_authenticated
        return request.user and request.user.is_authenticated and request.user.is_staff