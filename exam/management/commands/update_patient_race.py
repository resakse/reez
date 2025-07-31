"""
Management command to update patient race information based on name inference
Usage: python manage.py update_patient_race [--force] [--dry-run]
"""

from django.core.management.base import BaseCommand
from django.db import models
from pesakit.models import Pesakit
from exam.utils import infer_race_from_name


class Command(BaseCommand):
    help = 'Update patient race information based on name inference'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Update race even if already set',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be updated without making changes',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Limit number of patients to process',
        )

    def handle(self, *args, **options):
        force = options['force']
        dry_run = options['dry_run']
        limit = options['limit']

        # Get patients to update
        if force:
            queryset = Pesakit.objects.all()
            self.stdout.write("Processing ALL patients (--force mode)")
        else:
            queryset = Pesakit.objects.filter(
                models.Q(bangsa__isnull=True) | models.Q(bangsa='')
            )
            self.stdout.write("Processing patients without race information")

        if limit:
            queryset = queryset[:limit]
            self.stdout.write(f"Limited to {limit} patients")

        total_patients = queryset.count()
        self.stdout.write(f"Found {total_patients} patients to process")

        if total_patients == 0:
            self.stdout.write(
                self.style.WARNING("No patients found to update")
            )
            return

        updated_count = 0
        skipped_count = 0

        for i, patient in enumerate(queryset, 1):
            if i % 100 == 0:
                self.stdout.write(f"Processed {i}/{total_patients} patients...")

            if not patient.nama:
                skipped_count += 1
                continue

            # Get current and inferred race
            current_race = patient.bangsa or ''
            inferred_race = infer_race_from_name(patient.nama)

            # Skip if inference didn't find anything useful
            if inferred_race == 'OTHER':
                skipped_count += 1
                continue

            # Skip if already has race and not forcing
            if current_race and not force:
                skipped_count += 1
                continue

            # Update or show what would be updated
            if dry_run:
                self.stdout.write(
                    f"DRY RUN: Would update {patient.nama} "
                    f"({current_race or 'EMPTY'} -> {inferred_race})"
                )
                updated_count += 1
            else:
                old_race = patient.bangsa
                patient.bangsa = inferred_race
                patient.save(update_fields=['bangsa'])
                
                self.stdout.write(
                    f"Updated: {patient.nama} "
                    f"({old_race or 'EMPTY'} -> {inferred_race})"
                )
                updated_count += 1

        # Summary
        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f"DRY RUN COMPLETE: Would update {updated_count} patients, "
                    f"skipped {skipped_count}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"UPDATE COMPLETE: Updated {updated_count} patients, "
                    f"skipped {skipped_count}"
                )
            )

        # Show sample results
        if not dry_run and updated_count > 0:
            self.stdout.write("\nSample results:")
            sample_patients = Pesakit.objects.filter(
                bangsa__isnull=False
            ).exclude(bangsa='')[:5]
            
            for patient in sample_patients:
                inferred = infer_race_from_name(patient.nama)
                match_status = "✓" if patient.bangsa == inferred else "?"
                self.stdout.write(
                    f"  {match_status} {patient.nama:<35} -> {patient.bangsa}"
                )