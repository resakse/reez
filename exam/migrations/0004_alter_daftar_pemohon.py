# Generated by Django 4.2.6 on 2023-10-15 23:23

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('exam', '0003_daftar_performed_daftar_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='daftar',
            name='pemohon',
            field=models.CharField(max_length=30, null=True),
        ),
    ]
