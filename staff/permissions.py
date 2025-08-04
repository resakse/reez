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


class IsRadiologist(BasePermission):
    """
    Allows access only to radiologists (doctors and medical officers).
    """
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Check if user is a radiologist based on job position (jawatan)
        radiologist_positions = ['Pegawai Perubatan', 'Penolong Pegawai Perubatan']
        return request.user.jawatan in radiologist_positions or request.user.is_superuser


class IsTechnologist(BasePermission):
    """
    Allows access only to radiologic technologists.
    """
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Check if user is a technologist based on job position (jawatan)
        technologist_positions = ['Juru X-Ray']
        return request.user.jawatan in technologist_positions or request.user.is_superuser


class IsRadiologistOrTechnologist(BasePermission):
    """
    Allows access to both radiologists and technologists.
    """
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Check if user is either a radiologist or technologist
        medical_positions = ['Pegawai Perubatan', 'Penolong Pegawai Perubatan', 'Juru X-Ray']
        return request.user.jawatan in medical_positions or request.user.is_superuser