from django.apps import AppConfig


class AuditConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'audit'
    verbose_name = 'Audit Trail System'
    
    def ready(self):
        """
        Initialize the audit system when Django starts up
        
        This method is called once Django has loaded all models and is ready.
        We use it to register our signal handlers for automatic audit logging.
        """
        try:
            # Import signal handlers to register them
            from . import signals
            
            # Log that audit system is ready
            import logging
            logger = logging.getLogger(__name__)
            logger.info("Audit Trail System initialized - Signal handlers registered")
            
        except ImportError as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to initialize audit system: {e}")
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Unexpected error initializing audit system: {e}")