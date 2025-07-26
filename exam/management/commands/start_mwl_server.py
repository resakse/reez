"""
Django management command to start the DICOM MWL server

Usage:
    python manage.py start_mwl_server [--port 11112] [--debug]
"""

import logging
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings

class Command(BaseCommand):
    help = 'Start the DICOM Modality Worklist (MWL) server'

    def add_arguments(self, parser):
        parser.add_argument(
            '--port',
            type=int,
            default=11112,
            help='Port number for the MWL server (default: 11112)'
        )
        parser.add_argument(
            '--debug',
            action='store_true',
            help='Enable debug logging'
        )
        parser.add_argument(
            '--ae-title',
            type=str,
            default='RIS_MWL_SCP',
            help='Application Entity title (default: RIS_MWL_SCP)'
        )

    def handle(self, *args, **options):
        port = options['port']
        debug = options['debug']
        ae_title = options['ae_title']
        
        # Configure logging
        if debug:
            logging.basicConfig(level=logging.DEBUG)
            # Enable pynetdicom debug logging
            from pynetdicom import debug_logger
            debug_logger()
        else:
            logging.basicConfig(level=logging.INFO)
        
        logger = logging.getLogger(__name__)
        
        try:
            # Import and start MWL service
            from exam.dicom_mwl import mwl_service
            
            # Update AE title if provided
            mwl_service.ae.ae_title = ae_title
            
            self.stdout.write(
                self.style.SUCCESS(f'Starting DICOM MWL server on port {port}...')
            )
            self.stdout.write(f'AE Title: {ae_title}')
            self.stdout.write('Press Ctrl+C to stop the server')
            
            # Start the server (this will block)
            mwl_service.start_mwl_server(port)
            
        except KeyboardInterrupt:
            self.stdout.write(
                self.style.SUCCESS('\nMWL server stopped by user')
            )
        except Exception as e:
            logger.error(f"Failed to start MWL server: {e}")
            raise CommandError(f'Failed to start MWL server: {e}')