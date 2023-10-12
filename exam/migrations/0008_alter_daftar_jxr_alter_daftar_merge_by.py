# Generated by Django 4.1.2 on 2023-01-24 12:40

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('exam', '0007_exam_exam_code'),
    ]

    operations = [
        migrations.AlterField(
            model_name='daftar',
            name='jxr',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='bcs_jxr', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='daftar',
            name='merge_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='bcs_merge', to=settings.AUTH_USER_MODEL),
        ),
    ]
