"""
Management command for migrating historical reject analysis data.

This command helps migrate existing reject analysis data from legacy systems
or spreadsheets into the new structured reject analysis system. It can also
be used to update existing data with new QAP codes or severity levels.

Usage:
    python manage.py migrate_reject_data --source csv --file /path/to/data.csv
    python manage.py migrate_reject_data --source legacy --update-qap-codes
    python manage.py migrate_reject_data --backup --output /path/to/backup.json
"""

import json
import csv
import os
from datetime import datetime, date
from decimal import Decimal
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.contrib.auth import get_user_model
from django.core.serializers import serialize
from exam.models import (
    RejectCategory, RejectReason, RejectAnalysis, RejectIncident,
    Modaliti, Pemeriksaan
)

User = get_user_model()


class Command(BaseCommand):
    help = 'Migrate historical reject analysis data from various sources'

    def add_arguments(self, parser):
        parser.add_argument(
            '--source',
            type=str,
            choices=['csv', 'json', 'legacy', 'excel'],
            help='Source data format for migration',
        )
        parser.add_argument(
            '--file',
            type=str,
            help='Path to source data file',
        )
        parser.add_argument(
            '--backup',
            action='store_true',
            help='Create backup of existing reject data before migration',
        )
        parser.add_argument(
            '--output',
            type=str,
            default='reject_data_backup.json',
            help='Output file for backup (default: reject_data_backup.json)',
        )
        parser.add_argument(
            '--update-qap-codes',
            action='store_true',
            help='Update existing reasons with Malaysian QAP codes',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be migrated without actually migrating',
        )
        parser.add_argument(
            '--mapping-file',
            type=str,
            help='JSON file containing mapping rules for data transformation',
        )

    def handle(self, *args, **options):
        source = options.get('source')
        file_path = options.get('file')
        backup = options['backup']
        output_file = options['output']
        update_qap = options['update_qap_codes']
        dry_run = options['dry_run']
        mapping_file = options.get('mapping_file')

        if dry_run:
            self.stdout.write(
                self.style.WARNING('DRY RUN MODE - No data will be modified')
            )

        try:
            # Create backup if requested
            if backup:
                self._create_backup(output_file, dry_run)

            # Update QAP codes if requested
            if update_qap:
                self._update_qap_codes(dry_run)

            # Migrate data based on source
            if source and file_path:
                mapping = self._load_mapping(mapping_file) if mapping_file else {}
                
                if source == 'csv':
                    self._migrate_from_csv(file_path, mapping, dry_run)
                elif source == 'json':
                    self._migrate_from_json(file_path, mapping, dry_run)
                elif source == 'excel':
                    self._migrate_from_excel(file_path, mapping, dry_run)
                elif source == 'legacy':
                    self._migrate_from_legacy_system(file_path, mapping, dry_run)

            if not any([backup, update_qap, source]):
                self.stdout.write(
                    self.style.WARNING(
                        'No migration action specified. Use --help for options.'
                    )
                )

        except Exception as e:
            raise CommandError(f'Migration failed: {str(e)}')

    def _create_backup(self, output_file, dry_run=False):
        """Create a backup of existing reject analysis data"""
        self.stdout.write('Creating backup of existing reject data...')
        
        if dry_run:
            self.stdout.write(f'Would create backup at: {output_file}')
            return

        # Serialize all reject-related data
        data = {
            'categories': json.loads(serialize('json', RejectCategory.objects.all())),
            'reasons': json.loads(serialize('json', RejectReason.objects.all())),
            'analyses': json.loads(serialize('json', RejectAnalysis.objects.all())),
            'incidents': json.loads(serialize('json', RejectIncident.objects.all())),
            'backup_date': datetime.now().isoformat(),
            'backup_note': 'Backup created before data migration'
        }

        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2, default=str)

        self.stdout.write(
            self.style.SUCCESS(f'Backup created: {output_file}')
        )

    def _update_qap_codes(self, dry_run=False):
        """Update existing reject reasons with Malaysian QAP codes"""
        self.stdout.write('Updating QAP codes for existing reasons...')

        # Mapping of reason names to QAP codes
        qap_mapping = {
            'Over Exposure / High Index': 'HF-EXP-01',
            'Under Exposure / Low Index': 'HF-EXP-02',
            'Anatomy Cutoff': 'HF-POS-01',
            'Patient Motion': 'HF-MOT-01',
            'Incorrect Positioning': 'HF-POS-02',
            'Collimation Error': 'HF-COL-01',
            'Wrong Patient Identification': 'HF-ID-01',
            'Missing Patient Markers': 'HF-ID-02',
            'X-Ray Tube Malfunction': 'EQ-TUBE-01',
            'Generator Malfunction': 'EQ-GEN-01',
            'Detector Malfunction': 'EQ-DET-01',
            'Cassette / CR Plate Issue': 'EQ-CAS-01',
            'kVp Calibration Error': 'EQ-CAL-01',
            'Timer Accuracy Issue': 'EQ-CAL-02',
            'AEC Calibration Error': 'EQ-CAL-03',
            'Grid Cutoff': 'EQ-GRID-01',
            'Grid Artifact': 'EQ-GRID-02',
            'Light Field Misalignment': 'EQ-COL-01',
            'Image Processing Error': 'PR-SOFT-01',
            'Incorrect Algorithm Selection': 'PR-SOFT-02',
            'Software Crash': 'PR-SOFT-03',
            'PACS Network Failure': 'PR-NET-01',
            'DICOM Transfer Error': 'PR-NET-02',
            'Server Connectivity Issue': 'PR-NET-03',
            'Image Corruption': 'PR-STOR-01',
            'Storage Media Failure': 'PR-STOR-02',
            'Patient Movement': 'OT-PAT-01',
            'Patient Cooperation Issues': 'OT-PAT-02',
            'Physical Limitations': 'OT-PAT-03',
            'Respiratory Motion': 'OT-PAT-04',
            'Power Supply Fluctuation': 'OT-ENV-01',
            'Temperature Variation': 'OT-ENV-02',
            'Humidity Issues': 'OT-ENV-03',
            'Emergency Situation': 'OT-URG-01',
            'Time Constraints': 'OT-URG-02',
            'Trauma Protocol': 'OT-URG-03',
        }

        updated_count = 0
        for reason in RejectReason.objects.all():
            if reason.reason in qap_mapping and not reason.qap_code:
                if dry_run:
                    self.stdout.write(
                        f'Would update {reason.reason} with QAP code: {qap_mapping[reason.reason]}'
                    )
                    updated_count += 1
                else:
                    reason.qap_code = qap_mapping[reason.reason]
                    reason.save()
                    self.stdout.write(
                        f'Updated {reason.reason} with QAP code: {reason.qap_code}'
                    )
                    updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(f'Updated {updated_count} reasons with QAP codes')
        )

    def _load_mapping(self, mapping_file):
        """Load field mapping configuration from JSON file"""
        try:
            with open(mapping_file, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            raise CommandError(f'Mapping file not found: {mapping_file}')
        except json.JSONDecodeError:
            raise CommandError(f'Invalid JSON in mapping file: {mapping_file}')

    def _migrate_from_csv(self, file_path, mapping, dry_run=False):
        """Migrate reject analysis data from CSV file"""
        self.stdout.write(f'Migrating data from CSV: {file_path}')

        if not os.path.exists(file_path):
            raise CommandError(f'CSV file not found: {file_path}')

        migrated_count = 0
        with open(file_path, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            
            for row in reader:
                if dry_run:
                    self.stdout.write(f'Would migrate row: {row}')
                    migrated_count += 1
                else:
                    try:
                        self._process_csv_row(row, mapping)
                        migrated_count += 1
                    except Exception as e:
                        self.stdout.write(
                            self.style.ERROR(f'Error processing row {row}: {str(e)}')
                        )

        self.stdout.write(
            self.style.SUCCESS(f'Migrated {migrated_count} records from CSV')
        )

    def _process_csv_row(self, row, mapping):
        """Process a single CSV row and create/update reject data"""
        # This is a template - actual implementation would depend on CSV structure
        # Example mapping:
        # {
        #   "analysis_date": "date_column",
        #   "modality": "modality_column",
        #   "total_examinations": "exam_count_column",
        #   "total_retakes": "retake_count_column"
        # }
        
        # Apply field mapping
        mapped_data = {}
        for model_field, csv_field in mapping.items():
            if csv_field in row:
                mapped_data[model_field] = row[csv_field]

        # Convert and validate data types
        if 'analysis_date' in mapped_data:
            mapped_data['analysis_date'] = datetime.strptime(
                mapped_data['analysis_date'], '%Y-%m-%d'
            ).date()

        # Create or update analysis record
        # This would need to be customized based on actual data structure
        pass

    def _migrate_from_json(self, file_path, mapping, dry_run=False):
        """Migrate reject analysis data from JSON file"""
        self.stdout.write(f'Migrating data from JSON: {file_path}')

        if not os.path.exists(file_path):
            raise CommandError(f'JSON file not found: {file_path}')

        with open(file_path, 'r') as f:
            data = json.load(f)

        # Process JSON data based on structure
        if dry_run:
            self.stdout.write(f'Would migrate {len(data)} records from JSON')
        else:
            # Implement JSON migration logic
            pass

    def _migrate_from_excel(self, file_path, mapping, dry_run=False):
        """Migrate reject analysis data from Excel file"""
        try:
            import pandas as pd
        except ImportError:
            raise CommandError('pandas is required for Excel migration. Install with: pip install pandas openpyxl')

        self.stdout.write(f'Migrating data from Excel: {file_path}')

        if not os.path.exists(file_path):
            raise CommandError(f'Excel file not found: {file_path}')

        # Read Excel file
        df = pd.read_excel(file_path)

        if dry_run:
            self.stdout.write(f'Would migrate {len(df)} records from Excel')
        else:
            # Process DataFrame and create reject data
            # Implementation would depend on Excel structure
            pass

    def _migrate_from_legacy_system(self, file_path, mapping, dry_run=False):
        """Migrate data from legacy system export"""
        self.stdout.write(f'Migrating data from legacy system: {file_path}')

        # This would be customized based on the legacy system format
        # Could be XML, custom format, database export, etc.
        
        if dry_run:
            self.stdout.write('Would migrate legacy system data')
        else:
            # Implement legacy system migration logic
            pass

    def _validate_migrated_data(self):
        """Validate the integrity of migrated data"""
        self.stdout.write('Validating migrated data...')

        # Check for data consistency
        analyses = RejectAnalysis.objects.all()
        for analysis in analyses:
            # Validate reject rate calculations
            if analysis.total_images > 0:
                calculated_rate = (analysis.total_retakes / analysis.total_images) * 100
                if abs(calculated_rate - float(analysis.reject_rate)) > 0.01:
                    self.stdout.write(
                        self.style.WARNING(
                            f'Reject rate mismatch in analysis {analysis.id}: '
                            f'calculated {calculated_rate:.2f}%, stored {analysis.reject_rate}%'
                        )
                    )

        self.stdout.write(
            self.style.SUCCESS('Data validation completed')
        )