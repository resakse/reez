from rest_framework import permissions


class IsAnnotationOwnerOrReadOnly(permissions.BasePermission):
    """
    Custom permission to only allow owners of an annotation to edit/delete it.
    All authenticated users can view annotations, but only owners can modify them.
    """

    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed for all authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write permissions are only allowed to the owner of the annotation
        return obj.user == request.user


class IsAnnotationOwner(permissions.BasePermission):
    """
    Custom permission to only allow owners of an annotation to access it.
    Stricter than IsAnnotationOwnerOrReadOnly - only owners can view/edit/delete.
    """

    def has_object_permission(self, request, view, obj):
        # All permissions are only allowed to the owner of the annotation
        return obj.user == request.user


class CanCreateAnnotations(permissions.BasePermission):
    """
    Permission to check if user can create annotations.
    Currently allows all authenticated users, but can be extended
    to check for specific roles or permissions.
    """

    def has_permission(self, request, view):
        # For now, allow all authenticated users to create annotations
        return request.user and request.user.is_authenticated
        
        # Future enhancement: Check for specific permissions
        # return request.user.has_perm('annotations.add_dicomannotation')


class CanViewAnnotations(permissions.BasePermission):
    """
    Permission to check if user can view annotations.
    Currently allows all authenticated users, but can be extended
    to implement role-based access control.
    """

    def has_permission(self, request, view):
        # For now, allow all authenticated users to view annotations
        return request.user and request.user.is_authenticated
        
        # Future enhancement: Check for specific roles
        # return (request.user.is_authenticated and 
        #         (request.user.jawatan in ['Pegawai Perubatan', 'Juru X-Ray']))


class CanDeleteOwnAnnotations(permissions.BasePermission):
    """
    Permission specifically for deletion operations.
    Ensures users can only delete their own annotations.
    """

    def has_object_permission(self, request, view, obj):
        # Only allow deletion if user owns the annotation
        if request.method == 'DELETE':
            return obj.user == request.user
        return True


class CanBulkDeleteAnnotations(permissions.BasePermission):
    """
    Permission for bulk deletion operations.
    Allows users to bulk delete only their own annotations.
    """

    def has_permission(self, request, view):
        # Allow bulk delete for authenticated users
        # (individual ownership will be checked in the view)
        return request.user and request.user.is_authenticated