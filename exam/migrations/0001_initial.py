# Generated by Django 4.2.6 on 2023-10-13 01:46

import auto_prefetch
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.db.models.manager
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('pesakit', '0001_initial'),
        ('wad', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Daftar',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tarikh', models.DateTimeField(default=django.utils.timezone.now)),
                ('no_resit', models.CharField(blank=True, max_length=50, null=True)),
                ('lmp', models.DateField(blank=True, null=True)),
                ('ambulatori', models.CharField(choices=[('Berjalan', 'Berjalan'), ('Kerusi Roda', 'Kerusi Roda'), ('Troli', 'Troli')], default='Berjalan Kaki', max_length=15)),
                ('pemohon', models.CharField(blank=True, max_length=30, null=True)),
                ('filem', models.PositiveSmallIntegerField(default=0)),
                ('cd', models.PositiveSmallIntegerField(default=0)),
                ('dcatatan', models.CharField(blank=True, max_length=20, null=True, verbose_name='Catatan')),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('jxr', auto_prefetch.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='bcs_jxr', to=settings.AUTH_USER_MODEL)),
                ('pesakit', auto_prefetch.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='pesakit.pesakit')),
                ('rujukan', auto_prefetch.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='wad.ward')),
            ],
            options={
                'verbose_name_plural': 'Pendaftaran Radiologi',
                'ordering': ['tarikh', 'pesakit'],
                'abstract': False,
                'base_manager_name': 'prefetch_manager',
            },
            managers=[
                ('objects', django.db.models.manager.Manager()),
                ('prefetch_manager', django.db.models.manager.Manager()),
            ],
        ),
        migrations.CreateModel(
            name='Exam',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('exam', models.CharField(max_length=50)),
                ('exam_code', models.CharField(blank=True, max_length=15, null=True)),
                ('catatan', models.CharField(blank=True, max_length=200, null=True)),
                ('short_desc', models.CharField(blank=True, max_length=50, null=True)),
                ('contrast', models.BooleanField(default=False)),
                ('status_ca', models.CharField(choices=[('ENABLE', 'Enable'), ('DISABLE', 'Disable')], default='ENABLE', max_length=10)),
            ],
            options={
                'verbose_name_plural': 'Pemeriksaan',
                'ordering': ['modaliti', 'part', 'exam'],
                'abstract': False,
                'base_manager_name': 'prefetch_manager',
            },
            managers=[
                ('objects', django.db.models.manager.Manager()),
                ('prefetch_manager', django.db.models.manager.Manager()),
            ],
        ),
        migrations.CreateModel(
            name='Modaliti',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nama', models.CharField(max_length=150, verbose_name='Modaliti')),
                ('singkatan', models.CharField(blank=True, max_length=50, null=True, verbose_name='Singkatan')),
                ('detail', models.CharField(blank=True, max_length=250, null=True, verbose_name='Keterangan')),
            ],
            options={
                'verbose_name': 'Modaliti',
                'verbose_name_plural': 'Modaliti',
                'ordering': ['nama'],
            },
        ),
        migrations.CreateModel(
            name='Part',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('part', models.CharField(max_length=100)),
            ],
        ),
        migrations.CreateModel(
            name='Region',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.PositiveIntegerField(db_index=True, editable=False, verbose_name='order')),
                ('jenis', models.CharField(blank=True, help_text='Modaliti untuk Statistik', max_length=50, null=True)),
                ('bahagian', models.CharField(blank=True, help_text='Bahagian untuk Statistik', max_length=50, null=True)),
            ],
            options={
                'verbose_name_plural': 'Statistik Region',
                'ordering': ['order'],
                'unique_together': {('jenis', 'bahagian')},
            },
        ),
        migrations.CreateModel(
            name='Pemeriksaan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('no_xray', models.CharField(blank=True, max_length=20, null=True, verbose_name='No. X-Ray')),
                ('laterality', models.CharField(blank=True, choices=[('Left', 'Left'), ('Right', 'Right')], max_length=10, null=True)),
                ('created', models.DateTimeField(auto_now_add=True)),
                ('modified', models.DateTimeField(auto_now=True)),
                ('daftar', auto_prefetch.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='exam.daftar')),
                ('exam', auto_prefetch.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='exam.exam')),
                ('jxr', auto_prefetch.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='exam_jxr', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name_plural': 'Pemeriksaan',
                'ordering': ['daftar', 'no_xray'],
                'abstract': False,
                'base_manager_name': 'prefetch_manager',
            },
            managers=[
                ('objects', django.db.models.manager.Manager()),
                ('prefetch_manager', django.db.models.manager.Manager()),
            ],
        ),
        migrations.AddField(
            model_name='exam',
            name='modaliti',
            field=auto_prefetch.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='exam.modaliti'),
        ),
        migrations.AddField(
            model_name='exam',
            name='part',
            field=auto_prefetch.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='exam.part'),
        ),
        migrations.AddField(
            model_name='exam',
            name='statistik',
            field=auto_prefetch.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='exam.region'),
        ),
        migrations.AlterUniqueTogether(
            name='exam',
            unique_together={('exam', 'part', 'modaliti')},
        ),
    ]
