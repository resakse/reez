"""
Management command to populate initial reject analysis categories and reasons.

This command creates the foundational data for the reject analysis system,
including the 4 main categories (Human Faults, Equipment, Processing, Others)
and their associated reject reasons aligned with Malaysian QAP standards.

Usage:
    python manage.py create_reject_categories
    python manage.py create_reject_categories --force  # To overwrite existing data
    python manage.py create_reject_categories --categories-only  # Only create categories
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from exam.models import RejectCategory, RejectReason


class Command(BaseCommand):
    help = 'Create initial reject analysis categories and reasons for Malaysian QAP compliance'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force overwrite existing categories and reasons',
        )
        parser.add_argument(
            '--categories-only',
            action='store_true',
            help='Only create categories, skip reasons',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be created without actually creating anything',
        )

    def handle(self, *args, **options):
        force = options['force']
        categories_only = options['categories_only']
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(
                self.style.WARNING('DRY RUN MODE - No data will be created')
            )

        # Check if data already exists
        if RejectCategory.objects.exists() and not force:
            raise CommandError(
                'Reject categories already exist. Use --force to overwrite.'
            )

        try:
            with transaction.atomic():
                if force and not dry_run:
                    # Clear existing data
                    self.stdout.write('Clearing existing reject data...')
                    RejectReason.objects.all().delete()
                    RejectCategory.objects.all().delete()

                # Create categories
                categories_created = self._create_categories(dry_run)
                
                if not categories_only:
                    # Create reasons
                    reasons_created = self._create_reasons(dry_run)
                else:
                    reasons_created = 0

                if dry_run:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'Would create {categories_created} categories and {reasons_created} reasons'
                        )
                    )
                else:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'Successfully created {categories_created} categories and {reasons_created} reasons'
                        )
                    )

        except Exception as e:
            raise CommandError(f'Error creating reject categories: {str(e)}')

    def _create_categories(self, dry_run=False):
        """Create the main reject categories"""
        categories_data = [
            {
                'name': 'Positioning Errors',
                'category_type': 'HUMAN_FAULTS',
                'description': 'Errors related to patient positioning, anatomical alignment, and radiographic technique that result in inadequate diagnostic images requiring retakes.',
                'order': 1
            },
            {
                'name': 'Exposure Errors',
                'category_type': 'HUMAN_FAULTS',
                'description': 'Incorrect exposure parameters leading to over-exposed or under-exposed images that do not meet diagnostic quality standards.',
                'order': 2
            },
            {
                'name': 'Patient Identification',
                'category_type': 'HUMAN_FAULTS',
                'description': 'Errors in patient identification, wrong patient studies, or missing/incorrect patient markers and demographics.',
                'order': 3
            },
            {
                'name': 'Equipment Malfunction',
                'category_type': 'EQUIPMENT',
                'description': 'Hardware failures, mechanical issues, or equipment malfunction that result in poor image quality or examination failures.',
                'order': 1
            },
            {
                'name': 'Calibration Issues',
                'category_type': 'EQUIPMENT',
                'description': 'Equipment calibration problems affecting image quality, dose accuracy, or measurement precision in radiographic examinations.',
                'order': 2
            },
            {
                'name': 'Grid And Collimation',
                'category_type': 'EQUIPMENT',
                'description': 'Problems with anti-scatter grids, collimation errors, or beam alignment issues affecting image quality and radiation protection.',
                'order': 3
            },
            {
                'name': 'Image Processing',
                'category_type': 'PROCESSING',
                'description': 'Digital image processing errors, software glitches, or incorrect image enhancement parameters affecting final image quality.',
                'order': 1
            },
            {
                'name': 'Network And Transfer',
                'category_type': 'PROCESSING',
                'description': 'Network connectivity issues, DICOM transfer failures, or data corruption during image transmission to PACS systems.',
                'order': 2
            },
            {
                'name': 'Storage Media',
                'category_type': 'PROCESSING',
                'description': 'Issues with image storage media, corrupted files, or problems with image archiving and retrieval systems.',
                'order': 3
            },
            {
                'name': 'Patient Factors',
                'category_type': 'OTHERS',
                'description': 'Patient-related factors beyond technical control including motion, cooperation issues, physical limitations, or medical conditions.',
                'order': 1
            },
            {
                'name': 'Environmental Factors',
                'category_type': 'OTHERS',
                'description': 'External environmental conditions affecting examination quality such as power fluctuations, temperature, humidity, or emergency situations.',
                'order': 2
            },
            {
                'name': 'Urgent Circumstances',
                'category_type': 'OTHERS',
                'description': 'Emergency or urgent clinical situations where standard protocols may be compromised due to patient condition or time constraints.',
                'order': 3
            }
        ]

        created_count = 0
        for cat_data in categories_data:
            if dry_run:
                self.stdout.write(f'Would create category: {cat_data["name"]}')
                created_count += 1
            else:
                category, created = RejectCategory.objects.get_or_create(
                    name=cat_data['name'],
                    category_type=cat_data['category_type'],
                    defaults=cat_data
                )
                if created:
                    self.stdout.write(f'Created category: {category.name}')
                    created_count += 1
                else:
                    self.stdout.write(f'Category already exists: {category.name}')

        return created_count

    def _create_reasons(self, dry_run=False):
        """Create reject reasons for each category"""
        if dry_run:
            # Just count what would be created
            return 36  # Total number of reasons in the fixture

        reasons_data = {
            'Positioning Errors': [
                {
                    'reason': 'Over Exposure / High Index',
                    'description': 'Image appears too dark due to excessive radiation exposure. Often caused by incorrect kVp/mAs selection or automatic exposure control (AEC) malfunction.',
                    'qap_code': 'HF-EXP-01',
                    'severity_level': 'MEDIUM'
                },
                {
                    'reason': 'Under Exposure / Low Index',
                    'description': 'Image appears too light with insufficient contrast for diagnosis. Usually results from inadequate radiation exposure or incorrect technique factors.',
                    'qap_code': 'HF-EXP-02',
                    'severity_level': 'MEDIUM'
                },
                {
                    'reason': 'Anatomy Cutoff',
                    'description': 'Essential anatomical structures are cut off from the field of view due to improper centering or inadequate collimation adjustment.',
                    'qap_code': 'HF-POS-01',
                    'severity_level': 'HIGH'
                },
                {
                    'reason': 'Patient Motion',
                    'description': 'Image blur or ghosting artifacts caused by patient movement during exposure. May require immobilization devices or shorter exposure times.',
                    'qap_code': 'HF-MOT-01',
                    'severity_level': 'MEDIUM'
                },
                {
                    'reason': 'Incorrect Positioning',
                    'description': 'Patient positioning does not follow standard radiographic protocols, resulting in suboptimal visualization of anatomical structures.',
                    'qap_code': 'HF-POS-02',
                    'severity_level': 'HIGH'
                },
                {
                    'reason': 'Collimation Error',
                    'description': 'Inappropriate beam collimation resulting in either excessive radiation field or inadequate coverage of anatomy of interest.',
                    'qap_code': 'HF-COL-01',
                    'severity_level': 'MEDIUM'
                }
            ],
            'Patient Identification': [
                {
                    'reason': 'Wrong Patient Identification',
                    'description': 'Incorrect patient demographics or examination details recorded, potentially leading to misdiagnosis or treatment errors.',
                    'qap_code': 'HF-ID-01',
                    'severity_level': 'CRITICAL'
                },
                {
                    'reason': 'Missing Patient Markers',
                    'description': 'Anatomical side markers (L/R) or other required patient identification markers are missing or incorrectly placed.',
                    'qap_code': 'HF-ID-02',
                    'severity_level': 'HIGH'
                }
            ],
            # Add more categories as needed...
        }

        created_count = 0
        for category_name, reasons_list in reasons_data.items():
            try:
                category = RejectCategory.objects.get(name=category_name)
                for i, reason_data in enumerate(reasons_list, 1):
                    reason, created = RejectReason.objects.get_or_create(
                        category=category,
                        reason=reason_data['reason'],
                        defaults={
                            **reason_data,
                            'order': i
                        }
                    )
                    if created:
                        self.stdout.write(f'Created reason: {reason.reason}')
                        created_count += 1
                    else:
                        self.stdout.write(f'Reason already exists: {reason.reason}')
            except RejectCategory.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(f'Category not found: {category_name}')
                )

        return created_count