# Generated by Django 4.1.2 on 2023-01-28 16:32

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('exam', '0009_alter_bcs_pemohon_alter_bcs_ward'),
    ]

    operations = [
        migrations.AddField(
            model_name='exam',
            name='statistik',
            field=models.CharField(blank=True, help_text='Region/Bahagian untuk Statistik', max_length=50, null=True),
        ),
    ]
