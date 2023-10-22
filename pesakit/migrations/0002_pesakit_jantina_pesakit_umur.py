# Generated by Django 4.2.6 on 2023-10-22 09:39

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pesakit', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='pesakit',
            name='jantina',
            field=models.CharField(choices=[('L', 'Lelaki'), ('P', 'Perempuan')], default='L', max_length=2),
        ),
        migrations.AddField(
            model_name='pesakit',
            name='umur',
            field=models.CharField(blank=True, max_length=10, null=True),
        ),
    ]