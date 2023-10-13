# Generated by Django 4.2.6 on 2023-10-13 01:46

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Pesakit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('mrn', models.CharField(blank=True, max_length=15, null=True, verbose_name='MRN')),
                ('nric', models.CharField(blank=True, help_text='NRIC / Passport', max_length=25, null=True, verbose_name='NRIC')),
                ('nama', models.CharField(max_length=50, null=True)),
                ('bangsa', models.CharField(choices=[('Melayu', 'Melayu'), ('Cina', 'Cina'), ('India', 'India'), ('Lain-Lain', 'Lain-Lain'), ('Warga Asing', 'Warga Asing')], default='Melayu', max_length=15)),
                ('catatan', models.TextField(blank=True, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('jxr', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name_plural': 'Pesakit',
                'ordering': ['mrn', 'nric'],
                'unique_together': {('mrn', 'nric')},
            },
        ),
    ]