# Generated by Django 4.2.6 on 2023-11-03 07:34

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('exam', '0009_pemeriksaan_kv_pemeriksaan_mas'),
    ]

    operations = [
        migrations.AddField(
            model_name='pemeriksaan',
            name='mgy',
            field=models.PositiveSmallIntegerField(blank=True, null=True, verbose_name='mGy'),
        ),
    ]
