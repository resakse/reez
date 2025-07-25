# Generated by Django 4.2.6 on 2025-07-25 15:14

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('exam', '0013_pacsconfig'),
    ]

    operations = [
        migrations.AddField(
            model_name='daftar',
            name='accession_number',
            field=models.CharField(blank=True, help_text="Hospital's unique identifier for the study", max_length=16, null=True),
        ),
        migrations.AddField(
            model_name='daftar',
            name='modality',
            field=models.CharField(blank=True, help_text='Modality type (CR, DX, etc.)', max_length=10, null=True),
        ),
        migrations.AddField(
            model_name='daftar',
            name='patient_position',
            field=models.CharField(blank=True, choices=[('HFS', 'Head First-Supine'), ('HFP', 'Head First-Prone'), ('HFDR', 'Head First-Decubitus Right'), ('HFDL', 'Head First-Decubitus Left'), ('FFS', 'Feet First-Supine'), ('FFP', 'Feet First-Prone'), ('FFDR', 'Feet First-Decubitus Right'), ('FFDL', 'Feet First-Decubitus Left')], help_text='Patient position for the examination', max_length=4, null=True),
        ),
        migrations.AddField(
            model_name='daftar',
            name='requested_procedure_description',
            field=models.CharField(blank=True, help_text='Description of the requested procedure', max_length=200, null=True),
        ),
        migrations.AddField(
            model_name='daftar',
            name='scheduled_datetime',
            field=models.DateTimeField(blank=True, help_text='Scheduled date and time for the examination', null=True),
        ),
        migrations.AddField(
            model_name='daftar',
            name='study_comments',
            field=models.TextField(blank=True, help_text='Additional comments for the study', null=True),
        ),
        migrations.AddField(
            model_name='daftar',
            name='study_instance_uid',
            field=models.CharField(blank=True, help_text='Unique identifier for DICOM study', max_length=64, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='daftar',
            name='study_priority',
            field=models.CharField(choices=[('STAT', 'STAT'), ('HIGH', 'High'), ('MEDIUM', 'Medium'), ('LOW', 'Low')], default='MEDIUM', help_text='Priority level for the study', max_length=10),
        ),
    ]
