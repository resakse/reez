# Generated by Django 4.2.6 on 2023-11-01 03:10

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pesakit', '0007_remove_pesakit_jantan'),
    ]

    operations = [
        migrations.AddField(
            model_name='pesakit',
            name='jantina',
            field=models.CharField(choices=[('L', 'Lelaki'), ('P', 'Perempuan')], default='L', max_length=2),
        ),
    ]
