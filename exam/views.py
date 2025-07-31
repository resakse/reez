import json
import logging
from datetime import datetime, timedelta

from django.contrib.auth.decorators import login_required
from django.utils import timezone

logger = logging.getLogger(__name__)
from django.core.paginator import Paginator, PageNotAnInteger, EmptyPage
from django.db.models import Q, Count
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.http import require_POST
from django_htmx.http import trigger_client_event, push_url

from exam.models import Pemeriksaan, Daftar, Exam, Modaliti, Part, Region, generate_exam_accession
from pesakit.models import Pesakit
from exam.models import PacsConfig, DashboardConfig
from .filters import DaftarFilter
from .forms import BcsForm, DaftarForm, RegionForm, ExamForm, PacsConfigForm

from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FileUploadParser
from rest_framework.renderers import JSONRenderer
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from .serializers import (
    ModalitiSerializer, PartSerializer, ExamSerializer, 
    DaftarSerializer, PemeriksaanSerializer, 
    RegistrationWorkflowSerializer, MWLWorklistSerializer,
    GroupedExaminationSerializer, GroupedMWLWorklistSerializer,
    PositionChoicesSerializer, PacsConfigSerializer
)
import os
import tempfile
import pydicom
from django.core.files.storage import default_storage
from django.conf import settings
import requests

from .dicom_mwl import mwl_service
from pesakit.serializers import PesakitSerializer

class ModalitiViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows modalities to be viewed or edited.
    """
    queryset = Modaliti.objects.all().order_by('nama')
    serializer_class = ModalitiSerializer
    permission_classes = [IsAuthenticated]

class PartViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows body parts to be viewed or edited.
    """
    queryset = Part.objects.all().order_by('part')
    serializer_class = PartSerializer
    permission_classes = [IsAuthenticated]

class ExamViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows examination types to be viewed or edited.
    """
    queryset = Exam.objects.all().order_by('modaliti', 'part', 'exam')
    serializer_class = ExamSerializer
    permission_classes = [IsAuthenticated]


class DaftarViewSet(viewsets.ModelViewSet):
    """
    API endpoint for registration management (Daftar - Pendaftaran Radiologi)
    """
    queryset = Daftar.objects.all().select_related('pesakit', 'rujukan', 'jxr').prefetch_related('pemeriksaan', 'pemeriksaan__exam', 'pemeriksaan__exam__modaliti', 'pemeriksaan__jxr').order_by('-tarikh')
    serializer_class = DaftarSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by patient
        patient_id = self.request.query_params.get('patient_id')
        if patient_id:
            queryset = queryset.filter(pesakit_id=patient_id)
        
        # Filter by patient (alternative parameter)
        pesakit_id = self.request.query_params.get('pesakit')
        if pesakit_id:
            queryset = queryset.filter(pesakit_id=pesakit_id)
        
        # Filter by ward
        ward_id = self.request.query_params.get('ward_id')
        if ward_id:
            queryset = queryset.filter(rujukan_id=ward_id)
        
        # Filter by status
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        # Filter by date range
        from_date = self.request.query_params.get('from_date')
        to_date = self.request.query_params.get('to_date')
        if from_date:
            queryset = queryset.filter(tarikh__date__gte=from_date)
        if to_date:
            queryset = queryset.filter(tarikh__date__lte=to_date)
        
        # Filter by study instance UID
        study_instance_uid = self.request.query_params.get('study_instance_uid')
        if study_instance_uid:
            queryset = queryset.filter(study_instance_uid=study_instance_uid)
        
        return queryset

    @action(detail=True, methods=['get', 'post'])
    def examinations(self, request, pk=None):
        """Get or add examinations for a registration"""
        registration = self.get_object()
        
        if request.method == 'GET':
            examinations = Pemeriksaan.objects.filter(daftar=registration)
            serializer = PemeriksaanSerializer(examinations, many=True)
            return Response(serializer.data)
        
        elif request.method == 'POST':
            data = request.data.copy()
            data['daftar_id'] = registration.id
            serializer = PemeriksaanSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='batch-check')
    def batch_check_import_status(self, request):
        """
        Batch check import status for multiple study instance UIDs
        """
        study_instance_uids = request.data.get('study_instance_uids', [])
        
        if not study_instance_uids:
            return Response({'error': 'study_instance_uids is required'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Query registrations that match any of the study instance UIDs
        imported_registrations = Daftar.objects.filter(
            study_instance_uid__in=study_instance_uids
        ).values('study_instance_uid', 'id')
        
        # Create mapping of study_instance_uid -> registration_id
        imported_studies = {}
        for reg in imported_registrations:
            if reg['study_instance_uid']:
                imported_studies[reg['study_instance_uid']] = reg['id']
        
        return Response({
            'success': True,
            'imported_studies': imported_studies
        })


class PemeriksaanViewSet(viewsets.ModelViewSet):
    """
    API endpoint for examination details (Pemeriksaan)
    """
    queryset = Pemeriksaan.objects.all().select_related('daftar', 'exam', 'daftar__pesakit', 'exam__modaliti', 'daftar__rujukan', 'daftar__jxr', 'jxr')
    serializer_class = PemeriksaanSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['no_xray', 'daftar__pesakit__nama', 'daftar__pemohon', 'exam__exam']
    ordering_fields = ['no_xray', 'created', 'daftar__tarikh']
    ordering = ['-no_xray']  # Default ordering by X-ray number descending

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by registration
        registration_id = self.request.query_params.get('registration_id')
        if registration_id:
            queryset = queryset.filter(daftar_id=registration_id)
        
        # Filter by exam type
        exam_id = self.request.query_params.get('exam_id')
        if exam_id:
            queryset = queryset.filter(exam_id=exam_id)
        
        return queryset


class RegistrationWorkflowView(APIView):
    """
    API endpoint for complete registration workflow
    Combines patient creation, registration, and examinations in a single transaction
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = RegistrationWorkflowSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            result = serializer.save()
            return Response({
                'patient': PesakitSerializer(result['patient']).data,
                'registration': DaftarSerializer(result['registration']).data,
                'examinations': PemeriksaanSerializer(result['examinations'], many=True).data
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MWLWorklistView(APIView):
    """
    API endpoint for MWL (Modality Worklist) data
    Provides worklist data for CR machine integration
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Get registrations with status 'Registered' or 'Performed'
        registrations = Daftar.objects.filter(
            status__in=['Registered', 'Performed']
        ).select_related('pesakit').prefetch_related('pemeriksaan')
        
        # Filter by date if provided
        date_filter = request.query_params.get('date')
        if date_filter:
            registrations = registrations.filter(tarikh__date=date_filter)
        
        serializer = MWLWorklistSerializer(registrations, many=True)
        return Response(serializer.data)


class GroupedExaminationView(APIView):
    """
    API endpoint for creating grouped examinations under a single study
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = GroupedExaminationSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            result = serializer.save()
            
            # Return structured response
            return Response({
                'study': DaftarSerializer(result['study']).data,
                'examinations': PemeriksaanSerializer(result['examinations'], many=True).data,
                'message': f"Created study {result['study'].parent_accession_number} with {len(result['examinations'])} examinations"
            }, status=status.HTTP_201_CREATED)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class GroupedMWLView(APIView):
    """
    Enhanced MWL API endpoint showing parent-child study relationships
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Get studies with scheduled status
        studies = Daftar.objects.filter(
            study_status__in=['SCHEDULED', 'IN_PROGRESS']
        ).select_related('pesakit').prefetch_related('pemeriksaan__exam__part')
        
        # Filter by date if provided
        date_filter = request.query_params.get('date')
        if date_filter:
            studies = studies.filter(tarikh__date=date_filter)
        
        # Filter by modality if provided
        modality_filter = request.query_params.get('modality')
        if modality_filter:
            studies = studies.filter(modality=modality_filter)
        
        # Filter by priority if provided
        priority_filter = request.query_params.get('priority')
        if priority_filter:
            studies = studies.filter(study_priority=priority_filter)
        
        serializer = GroupedMWLWorklistSerializer(studies, many=True)
        return Response({
            'count': studies.count(),
            'results': serializer.data
        })


class PositionChoicesView(APIView):
    """
    API endpoint for position choices used in examinations
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        serializer = PositionChoicesSerializer({})
        return Response(serializer.data)


class DicomWorklistExportView(APIView):
    """
    API endpoint for DICOM Modality Worklist export
    
    Provides worklist data in various formats for CR/DR machine integration:
    - JSON format for API consumption
    - DICOM C-FIND compatible format
    - CSV export for machine import
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Get query parameters
        format_type = request.query_params.get('format', 'json')
        date_filter = request.query_params.get('date')
        modality_filter = request.query_params.get('modality')
        priority_filter = request.query_params.get('priority')
        accession_filter = request.query_params.get('accession')
        patient_filter = request.query_params.get('patient_id')
        
        # Build query parameters
        query_params = {}
        if accession_filter:
            query_params['AccessionNumber'] = accession_filter
        if patient_filter:
            query_params['PatientID'] = patient_filter
        if date_filter:
            query_params['StudyDate'] = date_filter.replace('-', '')  # Convert to DICOM format
        if modality_filter:
            query_params['Modality'] = modality_filter
        
        try:
            # Get worklist items from MWL service
            worklist_items = mwl_service.get_worklist_items(query_params)
            
            if format_type == 'json':
                return Response({
                    'count': len(worklist_items),
                    'worklist_items': worklist_items
                })
            
            elif format_type == 'dicom_datasets':
                # Return DICOM datasets as JSON (for debugging/testing)
                datasets = []
                for item in worklist_items:
                    ds = mwl_service.create_dicom_dataset(item)
                    # Convert dataset to JSON-serializable format
                    dataset_dict = {}
                    for elem in ds:
                        if elem.VR in ['PN', 'LO', 'SH', 'UI', 'DA', 'TM', 'CS']:
                            dataset_dict[elem.keyword] = str(elem.value)
                        elif elem.VR == 'SQ':  # Sequence
                            dataset_dict[elem.keyword] = []
                            for seq_item in elem.value:
                                seq_dict = {}
                                for seq_elem in seq_item:
                                    if seq_elem.VR in ['PN', 'LO', 'SH', 'UI', 'DA', 'TM', 'CS']:
                                        seq_dict[seq_elem.keyword] = str(seq_elem.value)
                                dataset_dict[elem.keyword].append(seq_dict)
                    datasets.append(dataset_dict)
                
                return Response({
                    'count': len(datasets),
                    'dicom_datasets': datasets
                })
            
            elif format_type == 'csv':
                # Export as CSV for CR machine import
                import csv
                from io import StringIO
                
                output = StringIO()
                writer = csv.writer(output)
                
                # CSV Headers
                headers = [
                    'PatientName', 'PatientID', 'PatientSex', 'PatientBirthDate',
                    'StudyInstanceUID', 'AccessionNumber', 'StudyDescription',
                    'ScheduledProcedureStepID', 'ScheduledProcedureStepDescription',
                    'Modality', 'ScheduledStationAETitle', 'StudyDate', 'StudyTime',
                    'PatientPosition', 'ReferringPhysicianName', 'StudyPriority'
                ]
                writer.writerow(headers)
                
                # Write data rows
                for item in worklist_items:
                    row = [
                        item.get('PatientName', ''),
                        item.get('PatientID', ''),
                        item.get('PatientSex', ''),
                        item.get('PatientBirthDate', ''),
                        item.get('StudyInstanceUID', ''),
                        item.get('AccessionNumber', ''),
                        item.get('StudyDescription', ''),
                        item.get('ScheduledProcedureStepID', ''),
                        item.get('ScheduledProcedureStepDescription', ''),
                        item.get('Modality', ''),
                        item.get('ScheduledStationAETitle', ''),
                        item.get('StudyDate', ''),
                        item.get('StudyTime', ''),
                        item.get('PatientPosition', ''),
                        item.get('ReferringPhysicianName', ''),
                        item.get('StudyPriority', ''),
                    ]
                    writer.writerow(row)
                
                # Return CSV response
                from django.http import HttpResponse
                response = HttpResponse(output.getvalue(), content_type='text/csv')
                response['Content-Disposition'] = f'attachment; filename="mwl_export_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'
                return response
            
            else:
                return Response(
                    {'error': f'Unsupported format: {format_type}. Supported formats: json, dicom_datasets, csv'},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        except Exception as e:
            logger.error(f"Error exporting DICOM worklist: {e}")
            return Response(
                {'error': 'Failed to export worklist data'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# Create your views here.
@login_required
def senarai_bcs(request):
    param = request.GET.copy()
    parameter = param.pop("page", True) and param.urlencode()  # buang page dari url
    daftar = DaftarFilter(
        request.GET,
        queryset=Daftar.objects.all()
        .select_related("pesakit",'rujukan')
        .order_by("-tarikh"),
    )
    print(request.GET)
    # daftar = Daftar.objects.all()
    page = request.GET.get("page", 1)
    paginator = Paginator(daftar.qs, 10)  # Show 25 contacts per page.
    print(f'jumlah rekod = {paginator.count}')
    try:
        page_obj = paginator.page(page)
    except PageNotAnInteger:
        page_obj = paginator.page(1)
    except EmptyPage:
        page_obj = paginator.page(paginator.num_pages)

    data = {"daftar": daftar, "page_obj": page_obj, "param": parameter, 'paginator': paginator}
    template = "exam/senarai.html"
    if request.htmx:
        template = "exam/senarai-partial.html"
    return render(request, template, data)


@login_required
def tambah_bcs(request):
    tajuk = 'Daftar Pemeriksaan'
    form = BcsForm(request.POST or None, initial={'jxr': request.user})
    noxraybaru = generate_exam_accession()
    examform = DaftarForm(request.POST or None, initial={'no_xray': noxraybaru})
    hantar_url = reverse("bcs:bcs-tambah")
    data = {
        'tajuk': tajuk,
        "form": form,
        "examform": examform,
        "hantar_url": hantar_url,
    }
    template = "exam/bcs_tambah.html"
    if request.htmx:
        template = "exam/bcs_tambah-partia.html"

    response = render(request, template, data)

    if request.method == "POST":

        if form.is_valid() and examform.is_valid():
            print('form valid')
            nric = form.cleaned_data['nric']
            mrn = form.cleaned_data['mrn']
            nama = form.cleaned_data['nama']
            umur = form.cleaned_data['umur']
            bangsa = form.cleaned_data['bangsa']
            jantina = form.cleaned_data['jantina']
            print(f'nama : {nama}, nric : {nric}, mrn : {mrn}')
            try:
                pesakit = Pesakit.objects.get(Q(nric=nric) | Q(mrn=mrn))
            except Pesakit.DoesNotExist:
                pesakit = Pesakit.objects.create(nric=nric,mrn=mrn,nama=nama,umur=umur,bangsa=bangsa,jantina=jantina)
            daftar = form.save(commit=False)
            print(pesakit)
            pesakit.mrn = mrn
            pesakit.nric = nric
            pesakit.save()
            daftar.jxr = request.user
            daftar.pesakit = pesakit
            daftar.save()
            form = BcsForm(request.POST, instance=daftar)
            if examform.is_valid():
                exam = examform.save(commit=False)
                exam.daftar = daftar
                exam.jxr = request.user
                exam.save()
                exams = Pemeriksaan.objects.filter(daftar=daftar)
                examform = DaftarForm(None)
                hantar_url = reverse("bcs:bcs-edit", args=[exam.pk])

                data = {
                    'tajuk': tajuk,
                    "form": form,
                    "examform": examform,
                    "exams": exams,
                    "hantar_url": hantar_url,
                    "bcs_id": daftar.pk,
                }
                temp_response = render(request, template, data)
                response = push_url(
                    temp_response, reverse("bcs:bcs-edit", args=[daftar.pk])
                )
                response["HX-Trigger"] = json.dumps(
                    {
                        "htmxSuccess": f"Pemeriksaan {exam.exam} Berjaya di tambah.",
                    }
                )

            else:
                print("form tak valid")
        else:
            print("form tak valid")

    return response


@login_required
def edit_bcs(request, pk=None):
    bcs = Daftar.objects.get(pk=pk)
    pesakit = bcs.pesakit
    tajuk = f'Kemaskini Pendaftaran - {bcs.pesakit.nama}'
    form = BcsForm(request.POST or None, instance=bcs, initial={'nama': pesakit.nama,'nric': pesakit.nric,'mrn': pesakit.mrn,'jantina': pesakit.jantina,'umur': pesakit.umur})
    exams = Pemeriksaan.objects.filter(daftar=pk)
    hantar_url = reverse("bcs:bcs-edit", args=[bcs.pk])
    data = {
        'tajuk': tajuk,
        "form": form,
        "exams": exams,
        "hantar_url": hantar_url,
        "bcs_id": pk,
    }
    template = "exam/bcs_tambah.html"
    if request.htmx:
        template = "exam/bcs_tambah-partia.html"

    response = render(request, template, data)

    if request.method == "POST":
        if form.is_valid():
            nric = form.cleaned_data['nric']
            mrn = form.cleaned_data['mrn']
            nama = form.cleaned_data['nama']
            umur = form.cleaned_data['umur']
            bangsa = form.cleaned_data['bangsa']
            jantina = form.cleaned_data['jantina']
            bcs = form.save(commit=False)
            bcs.jxr = request.user
            pesakit = bcs.pesakit
            Pesakit.objects.filter(pk=pesakit.id).update(mrn=mrn,nama=nama,umur=umur,bangsa=bangsa,jantina=jantina,nric=nric)
            bcs.save()
            data = {
                'tajuk': tajuk,
                "form": form,
                "exams": exams,
                "hantar_url": hantar_url,
                "bcs_id": pk,
            }
            response = render(request, template, data)
            response["HX-Trigger"] = json.dumps(
                {
                    "htmxSuccess": f"Pemeriksaan Berjaya di Kemaskini.",
                }
            )
        else:
            print("form tak valid")

    return response


@login_required
def list_exam(request, pk=None):
    exam = Pemeriksaan.objects.filter(daftar_id=pk)
    data = {"exams": exam, "bcs_id": pk}
    return render(request, "exam/bcs_item-partial.html", data)


@login_required
def del_exam(request, pk=None):
    exam = get_object_or_404(Pemeriksaan, pk=pk)
    bcs = exam.daftar
    exam.delete()
    exams = Pemeriksaan.objects.filter(daftar=bcs)
    data = {"exams": exams, "bcs_id": bcs.id}
    return render(request, "exam/bcs_item-partial.html", data)


@login_required
def tambah_exam(request, pk=None):
    noxraybaru = generate_exam_accession()
    examform = DaftarForm(request.POST or None, initial={'no_xray': noxraybaru})
    bcs = Daftar.objects.get(pk=pk)
    if request.method == "POST":
        print('tambah exam', request.POST)
        if examform.is_valid():
            print('exam valid')
            exam = examform.save(commit=False)
            exam.daftar = bcs
            exam.jxr = request.user
            exam.save()
            exams = Pemeriksaan.objects.filter(daftar=pk)
            return render(
                request,
                "exam/bcs_item-partial.html",
                context={"exams": exams, "bcs_id": bcs.id  },
            )
        print('exam not valid')
    data = {"examform": examform, "bcs_id": bcs.id}
    return render(request, "exam/exam-tambah.html", data)


@login_required
def edit_exam(request, pk=None):
    exam = get_object_or_404(Pemeriksaan, pk=pk)
    examform = DaftarForm(request.POST or None, instance=exam)
    data = {"examform": examform, "exam": exam}
    if request.method == "POST":

        if examform.is_valid():
            exam = examform.save(commit=False)
            exam.jxr = request.user
            exam.save()
            response = render(request, "exam/exam-item.html", context={"item": exam})
            response["HX-Trigger"] = json.dumps(
                {"htmxSuccess": f"BCS Berjaya di Kemaskini."}
            )
            return response

    return render(request, "exam/exam-tambah.html", data)


@login_required
def get_exam(request, pk=None):
    exam = get_object_or_404(Pemeriksaan, pk=pk)

    return render(
        request, "exam/exam-item.html", context={"item": exam, "bcs_id": exam.daftar.id}
    )


@login_required
def get_click(request, pk=None):
    return render(request, "exam/get_form.html", context={'bcs_id': pk})


@require_POST
def merged(request, pk=None):
    exam = get_object_or_404(Daftar, pk=pk)
    exam.merge_by = request.user
    mergedurl = reverse("bcs:bcs-merge", args=[exam.pk])
    if exam.merged:
        exam.merged = False
        exam.save()

        response = HttpResponse(
            f'<input id="merged" type="checkbox" name="merged" hx-post="{mergedurl}" hx-swap="outerHTML" hx-target="this"/>')
    else:
        exam.merged = True
        exam.save()
        response = HttpResponse(
            f'<input id="merged" type="checkbox" checked name="merged" hx-post="{mergedurl}" hx-swap="outerHTML" hx-target="this"/>'
        )

    return trigger_client_event(
        response, "msg", {"merged": f"{exam.noxray} berjaya di kemaskini"}, after="swap"
    )


@login_required
def get_detail(request, pk=None):
    exam = get_object_or_404(Daftar, pk=pk)
    data = {"exam": exam}
    return render(request, "exam/exam_detail.html", data)


from .forms import KomenForm


@login_required
def edit_comment(request, pk=None):
    exam = get_object_or_404(Daftar, pk=pk)
    form = KomenForm(request.POST or None, instance=exam)
    data = {"exam": exam, "form": form}
    if request.method == "POST":
        if form.is_valid():
            komen = form.save(commit=False)
            komen.jxr = request.user
            komen.save()
            # response = redirect("bcs:bcs-list")
            response = render(request, 'exam/bcs-list-item.html', {'item': komen})
            return trigger_client_event(
                response, "msg", {"merged": f"{exam.nobcs} berjaya di kemaskini"}, after="swap"
            )

    return render(request, "exam/catatan.html", data)


@login_required
def checkAM(request):
    am = request.GET.get('mrn')
    nric = request.GET.get('nric')
    print(f'am = {am} - nric = {nric}')
    pesakit = None
    nama = None
    rekod = None
    if am:
        print('cek am')
        pesakit = Pesakit.objects.filter(mrn=am.upper()).first()
    if nric:
        print('cek pesakit')
        pesakit = Pesakit.objects.filter(nric=nric.upper()).first()

    if pesakit:
        nama = pesakit.nama
        nric = pesakit.nric
        mrn = pesakit.mrn
        bangsa = pesakit.bangsa
        jantina = pesakit.jantina
    if not pesakit:
        return HttpResponse(f'<div id="pesakitada" data-mrn="tiada" class="alert alert-primary w-100">Pesakit baru</div>')

    response = HttpResponse(f'<div id="pesakitada" class="alert alert-success w-100">Rekod Pesakit {nama} telah wujud</div>')
    return trigger_client_event(response, "pesakitada", {"nama": nama, "nric": nric, "bangsa": bangsa,'jantina': jantina, 'mrn': mrn})


def configList(request):
    exam = Exam.objects.all().select_related('modaliti', 'part', 'statistik')
    modaliti = Modaliti.objects.all()
    context = {'exam': exam,
               'modaliti': modaliti}
    return render(request, 'exam/config/exam_config.html', context)


def staticList(request):
    regionform = RegionForm(request.POST or None)
    formurl = reverse('bcs:config-stat-list')
    regionform.helper.attrs = {'hx-post': formurl, 'hx-target': '#stat-list', 'hx-swap': 'outerHTML'}
    if request.method == "POST":
        print(request.POST)
        if regionform.is_valid():
            print('form valid')
            regionform.save()
    stat = Region.objects.all()
    data = {
        'stat': stat,
        'regionform': regionform
    }
    return render(request, 'exam/config/stat_list.html', data)


def examList(request):
    examform = ExamForm(request.POST or None)
    formurl = reverse('bcs:config-exam-list')
    examform.helper.attrs = {'hx-post': formurl, 'hx-target': '#stat-list', 'hx-swap': 'outerHTML'}
    if request.method == "POST":
        print(request.POST)
        if examform.is_valid():
            print('form valid')
            examform.save()
    exam = Exam.objects.all()
    data = {
        'exam': exam,
        'examform': examform
    }
    return render(request, 'exam/config/exam_list.html', data)


def examUpdate(request, pk=None):
    exam = get_object_or_404(Pemeriksaan, id=pk)
    examform = ExamForm(request.POST or None, instance=exam)
    formurl = reverse('bcs:config-exam-update', args=[pk])
    examform.helper.attrs = {'hx-post': formurl, 'hx-target': '#exam-list', 'hx-swap': 'outerHTML'}
    data = {
        'exam': exam,
        'examform': examform
    }
    response = render(request, 'exam/config/borang.html', data)
    if request.method == "POST":
        examform = ExamForm(request.POST, instance=exam)
        print(request.POST)
        if examform.is_valid():
            print('form valid')
            examform.save() 
            data['exam'] = Exam.objects.all()
            response = render(request, 'exam/config/exam_list.html', data)
            return trigger_client_event(response, "msg", {"msg": f'{exam.exam} Berjaya di Kemaskini'})
    #
    return response


def examDelete(request, pk=None):
    exam = get_object_or_404(Pemeriksaan, id=pk)
    exam.delete()

    all_exam = Pemeriksaan.objects.all()
    examform = ExamForm()
    data = {
        'exam': all_exam,
        'examform': examform
    }
    response = render(request, 'exam/config/exam_list.html', data)
    return trigger_client_event(response, "msg", {"msg": f'{exam.exam} Berjaya di Padam'})


def pemeriksaan_list(request):
    exam = Pemeriksaan.objects.all()
    data = {
        'exam': exam
    }
    return render(request, 'exam/pemeriksaan_list.html', context=data)

@login_required
def pacs_config(request):
    try:
        config = PacsConfig.objects.first()
    except PacsConfig.DoesNotExist:
        config = None

    form = PacsConfigForm(request.POST or None, instance=config)

    if request.method == "POST" and form.is_valid():
        form.save()
        response = render(request, "exam/orthanc_form.html", {"form": form})
        response["HX-Trigger"] = json.dumps(
            {"htmxSuccess": "PACS Configuration saved successfully."}
        )
        return response

    return render(request, "exam/orthanc_form.html", {"form": form, 'base_template': 'index.html'})


def exam_view(request, pk=None):
    exam = get_object_or_404(Pemeriksaan, id=pk)
    uid = '1.2.392.200036.9107.307.24301.112430124031509247'
    data = {
        'exam': exam,
        'uid': uid
    }
    return render(request, 'exam/view_exam.html', context=data)


# import requests
# from django.core import serializers
# from .models import Pemeriksaan

# def send_to_orthanc(request):
#     exam = Pemeriksaan.objects.all()
    
#     # Serialize the queryset to JSON data
#     json_data = serializers.serialize('json', exam)

#     # Define the URL of Orthanc's MWL
#     url = "http://your-orthanc-url/mwl"

#     # Make a POST request with the JSON data as payload
#     response = requests.post(url, json=json_data)
    
#     if response.status_code == 200:
#         print('Data sent successfully')
#     else:
#         print('Failed to send data', response.text)
# orthancurl = "http://192.168.20.172:8042/tools/find"
# viewerurl='http://172.25.96.1:8043/osimis-viewer/app/index.html?study='
# viewerurl='http://172.25.96.1:8043/tools/find'
# orthancurl = viewerurl
import requests
import json

def orthanc_list(request):
    config = PacsConfig.objects.first()
    orthancurl = config.orthancurl if config else "http://localhost:8042"  # Default URL if no config
    viewerurl = config.viewrurl if config else "http://localhost:8080/viewer" # Default viewer URL if no config
    opt = {"Level": "Patient", "Expand": True, "Limit": 100,"Query":{}}
    list = requests.post(f'{orthancurl}/tools/find',json=opt) # Corrected URL path
    data = list.json()
    senarai=[]
    for a in data:
        study = {
            'id': a['ID'],
            'nama': (a['MainDicomTags']['PatientName']).replace('^', ' '),
            'ptid': a['MainDicomTags']['PatientID'],
            # 'noxray': a['MainDicomTags']['AccessionNumber'],
            # 'klinik': a['MainDicomTags']['InstitutionName'],
        }
        senarai.append(study)
    return HttpResponse(json.dumps(senarai))



def orthanc_study(request):
    config = PacsConfig.objects.first()
    orthancurl = config.orthancurl if config else "http://172.25.96.1:8043" # Default URL if no config
    viewerurl = config.viewrurl if config else "http://172.25.96.1:8043/ohif/viewer?url=../studies/" # Default viewer URL if no config

    dari = request.GET.get('dari')
    hingga = request.GET.get('hingga')
    patientid = request.GET.get('nric')
    nama = request.GET.get('nama')
    syarat = {}
    if not dari:
        dari = '01/01/2000'
        if not hingga:
            hingga = datetime.today().strftime('%d/%m/%Y')
    if not hingga:
        hingga = dari
    if dari or hingga:
        dari = datetime.strptime(dari,'%d/%m/%Y').strftime('%Y%m%d')
        hingga = datetime.strptime(hingga,'%d/%m/%Y').strftime('%Y%m%d')
        syarat['StudyDate'] = f'{dari}-{hingga}'
    if patientid:
        syarat['PatientID']=f'*{patientid}*'
    if nama:
        syarat['PatientName']=f'*{nama}*'

    opt = {"Level": "Studies", "Expand": True, "Limit": 25,"Query":syarat}
    list = requests.post(f'{orthancurl}/tools/find',json=opt) # Corrected URL path
    data = list.json()
    senarai=[]
    for a in data:
        try:
            examdesc = a['MainDicomTags']['StudyDescription']
        except KeyError:
            examdesc = ''
        texam = f"{a['MainDicomTags']['StudyDate']} {int(float(a['MainDicomTags']['StudyTime']))}"
        mexam = datetime.strptime(texam,'%Y%m%d %H%M%S')
        study = {
            'id': a['ID'],
            'tarikh': mexam,
            'nama': (a['PatientMainDicomTags']['PatientName']).replace('^', ' '),
            'ptid': a['PatientMainDicomTags']['PatientID'],
            'noxray': a['MainDicomTags']['AccessionNumber'],
            'exam': examdesc,
            'klinik': a['MainDicomTags']['InstitutionName'],
            'jimej': len(a['Series'])
        }

        senarai.append(study)
    susun=senarai
    if senarai:
        susun = sorted(senarai, key=lambda k: k['tarikh'], reverse=True)

    template = 'exam/dicom/dicom_study-list.html'
    if request.htmx:
        template = 'exam/dicom/dicom_study-partial.html'
    return render(request, template, context={'exam': susun, 'viewerurl': viewerurl})
# http://localhost:8043/dicom-web/studies?limit=2&includefield=00081030,00080060&00100020=561008065053


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FileUploadParser])
def upload_dicom_files(request):
    """
    Upload DICOM files and register them in the RIS system.
    Accepts multiple DICOM files and automatically:
    1. Validates DICOM format
    2. Extracts patient information 
    3. Creates/links patient record
    4. Creates study registration
    5. Stores files in Orthanc PACS
    """
    try:
        # Get uploaded files
        uploaded_files = request.FILES.getlist('dicom_files')
        if not uploaded_files:
            return Response({
                'success': False,
                'error': 'No DICOM files uploaded',
                'message': 'Please select DICOM files to upload'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get optional registration data
        registration_data = {
            'patient_id': request.data.get('patient_id'),  # Link to existing patient
            'modality': request.data.get('modality', 'OT'),  # Default to Other
            'study_description': request.data.get('study_description', 'Uploaded Study'),
            'referring_physician': request.data.get('referring_physician', ''),
            'ward_id': request.data.get('ward_id'),
        }
        
        processed_files = []
        patient_info = None
        study_instance_uid = None
        
        # Process each uploaded file
        for uploaded_file in uploaded_files:
            try:
                # Validate DICOM file
                with tempfile.NamedTemporaryFile(delete=False) as temp_file:
                    for chunk in uploaded_file.chunks():
                        temp_file.write(chunk)
                    temp_file_path = temp_file.name
                
                # Parse DICOM metadata
                try:
                    dcm = pydicom.dcmread(temp_file_path)
                except Exception as e:
                    os.unlink(temp_file_path)
                    return Response({
                        'success': False,
                        'error': f'Invalid DICOM file: {uploaded_file.name}',
                        'message': f'File format error: {str(e)}'
                    }, status=status.HTTP_400_BAD_REQUEST)
                
                # Extract patient information from first file
                if patient_info is None:
                    patient_info = {
                        'patient_id': getattr(dcm, 'PatientID', ''),
                        'patient_name': str(getattr(dcm, 'PatientName', '')).replace('^', ' '),
                        'patient_birth_date': getattr(dcm, 'PatientBirthDate', ''),
                        'patient_sex': getattr(dcm, 'PatientSex', ''),
                    }
                    study_instance_uid = getattr(dcm, 'StudyInstanceUID', '')
                
                # Extract comprehensive DICOM metadata (same approach as PACS Browser import)
                patient_name = str(getattr(dcm, 'PatientName', 'Unknown')).replace('^', ' ')
                patient_id = getattr(dcm, 'PatientID', '')
                patient_birth_date = getattr(dcm, 'PatientBirthDate', '')  # YYYYMMDD format
                patient_sex = getattr(dcm, 'PatientSex', '')  # M/F
                patient_age = getattr(dcm, 'PatientAge', '')  # e.g., "034Y"
                study_description = getattr(dcm, 'StudyDescription', '')
                referring_physician = str(getattr(dcm, 'ReferringPhysicianName', '')).replace('^', ' ')
                accession_number = getattr(dcm, 'AccessionNumber', '')
                modality = getattr(dcm, 'Modality', 'OT')
                
                # Extract additional tags for custom accession generation
                requesting_service = getattr(dcm, 'RequestingService', '')
                study_date = getattr(dcm, 'StudyDate', '')
                
                # Extract examination-specific DICOM tags
                body_part_examined = getattr(dcm, 'BodyPartExamined', '')
                acquisition_device_processing_description = getattr(dcm, 'AcquisitionDeviceProcessingDescription', '')
                operators_name = str(getattr(dcm, 'OperatorsName', '')).replace('^', ' ')
                patient_position = getattr(dcm, 'PatientPosition', '')
                view_position = getattr(dcm, 'ViewPosition', '')
                series_description = getattr(dcm, 'SeriesDescription', '')
                laterality = getattr(dcm, 'Laterality', '')  # L/R
                
                # Store metadata for processing
                file_metadata = {
                    'filename': uploaded_file.name,
                    'temp_path': temp_file_path,
                    'patient_name': patient_name,
                    'patient_id': patient_id,
                    'patient_birth_date': patient_birth_date,
                    'patient_sex': patient_sex,
                    'patient_age': patient_age,
                    'study_instance_uid': getattr(dcm, 'StudyInstanceUID', ''),
                    'series_instance_uid': getattr(dcm, 'SeriesInstanceUID', ''),
                    'sop_instance_uid': getattr(dcm, 'SOPInstanceUID', ''),
                    'modality': modality,
                    'study_date': getattr(dcm, 'StudyDate', ''),
                    'study_time': getattr(dcm, 'StudyTime', ''),
                    'study_description': study_description,
                    'series_description': series_description,
                    'referring_physician': referring_physician,
                    'accession_number': accession_number,
                    'requesting_service': requesting_service,
                    'study_date': study_date,
                    'instance_number': getattr(dcm, 'InstanceNumber', 1),
                    # Examination-specific metadata
                    'body_part_examined': body_part_examined,
                    'acquisition_device_processing_description': acquisition_device_processing_description,
                    'operators_name': operators_name,
                    'patient_position': patient_position,
                    'view_position': view_position,
                    'laterality': laterality,
                }
                processed_files.append(file_metadata)
                
            except Exception as e:
                # Clean up temp file on error
                if 'temp_file_path' in locals():
                    try:
                        os.unlink(temp_file_path)
                    except:
                        pass
                return Response({
                    'success': False,
                    'error': f'Error processing {uploaded_file.name}',
                    'message': str(e)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Import shared utilities
        from .utils import (
            generate_custom_accession,
            find_or_create_patient,
            create_daftar_for_study,
            create_pemeriksaan_from_dicom
        )
        
        # Use shared patient creation function with manual override support
        def find_or_create_patient_with_override(file_metadata):
            """Wrapper for shared function with manual patient ID override"""
            manual_patient_id = registration_data.get('patient_id')
            return find_or_create_patient(file_metadata, manual_patient_id)

        # Process each file individually to ensure separate patients get separate daftars
        all_results = {
            'patients': {},
            'daftars': {},
            'examinations': []
        }
        
        try:
            for file_metadata in processed_files:
                # Get patient for this specific file  
                patient = find_or_create_patient_with_override(file_metadata)
                patient_key = f"{patient.nric}_{patient.nama}"
                all_results['patients'][patient_key] = patient
                
                # Generate accession for this file
                accession_number = generate_custom_accession(file_metadata)
                
                # Create or find Daftar for this patient/study
                study_instance_uid = file_metadata.get('study_instance_uid', '')
                daftar_key = f"{patient.id}_{study_instance_uid or accession_number}"
                
                print(f"DEBUG: Daftar key: {daftar_key}")
                print(f"DEBUG: Study UID: '{study_instance_uid}', Accession: '{accession_number}'")
                
                if daftar_key in all_results['daftars']:
                    daftar = all_results['daftars'][daftar_key]
                    print(f"DEBUG: Using existing daftar: {daftar.id}")
                else:
                    print(f"DEBUG: Creating new daftar for patient {patient.id}")
                    # Create new daftar for this patient/study
                    modality_name = registration_data.get('modality') or file_metadata.get('modality', 'OT')
                    referring_physician = (registration_data.get('referring_physician') or 
                                         file_metadata.get('referring_physician') or 'Upload')
                    study_description = (registration_data.get('study_description') or 
                                       file_metadata.get('study_description') or 'Uploaded Study')
                    
                    print(f"DEBUG: About to create daftar with pesakit={patient.id}, modality='{modality_name}', study_uid='{study_instance_uid}', accession='{accession_number}'")
                    daftar = Daftar.objects.create(
                        pesakit=patient,
                        pemohon=referring_physician,
                        study_description=study_description,
                        modality=modality_name,
                        study_instance_uid=study_instance_uid,
                        parent_accession_number=accession_number or None,
                        accession_number=accession_number or None,
                        jxr=request.user,
                        study_status='COMPLETED',
                        tarikh=timezone.now()
                    )
                    print(f"DEBUG: Created daftar ID {daftar.id} for patient {patient.id} with accession '{daftar.parent_accession_number}'")
                    
                    # Add ward if specified
                    if registration_data.get('ward_id'):
                        try:
                            from wad.models import Ward
                            ward = Ward.objects.get(id=registration_data['ward_id'])
                            daftar.rujukan = ward
                            daftar.save()
                        except Ward.DoesNotExist:
                            pass
                    
                    all_results['daftars'][daftar_key] = daftar
            
            # Create examination records (Pemeriksaan) - parse DICOM metadata like PACS Browser import
            created_examinations = []
            from exam.models import Exam, Part, Pemeriksaan
            
            # Helper function to parse examination details from DICOM metadata
            def parse_dicom_examination_details(file_metadata):
                body_part = file_metadata.get('body_part_examined', '').upper()
                acquisition_desc = file_metadata.get('acquisition_device_processing_description', '')
                modality = file_metadata.get('modality', 'OT')
                
                # Parse exam type and position from AcquisitionDeviceProcessingDescription
                # e.g., "CHEST,ERECT P->A" -> exam_type="CHEST", position="PA ERECT"
                exam_type = body_part or modality  # Default to body part or modality
                position = file_metadata.get('patient_position', '')
                
                if acquisition_desc:
                    # Parse acquisition description (e.g., "CHEST,ERECT P->A")
                    parts = acquisition_desc.split(',')
                    if len(parts) >= 1:
                        exam_type = parts[0].strip().upper()
                    if len(parts) >= 2:
                        pos_desc = parts[1].strip()
                        # Parse position description (e.g., "ERECT P->A" -> "PA ERECT")
                        if 'P->A' in pos_desc or 'P-A' in pos_desc:
                            position = f"PA {pos_desc.replace('P->A', '').replace('P-A', '').strip()}"
                        elif 'A->P' in pos_desc or 'A-P' in pos_desc:
                            position = f"AP {pos_desc.replace('A->P', '').replace('A-P', '').strip()}"
                        elif 'LAT' in pos_desc.upper():
                            position = f"LAT {pos_desc.replace('LAT', '').strip()}"
                        else:
                            position = pos_desc
                
                # Get radiographer name
                radiographer_name = file_metadata.get('operators_name', '').strip()
                
                # Get laterality (L/R)
                laterality = file_metadata.get('laterality', '').upper()
                
                return {
                    'exam_type': (exam_type or f"{modality} Study").strip(),
                    'body_part': body_part.strip() if body_part else '',
                    'position': position.strip() if position else '',
                    'laterality': laterality.strip() if laterality else '',
                    'radiographer_name': radiographer_name.strip() if radiographer_name else '',
                    'modality': modality.strip() if modality else 'OT'
                }
            
            # Now create examination for each file and daftar
            for file_metadata in processed_files:
                # Get the daftar for this file
                patient = find_or_create_patient(file_metadata)
                study_instance_uid = file_metadata.get('study_instance_uid', '')
                accession_number = generate_custom_accession(file_metadata)
                daftar_key = f"{patient.id}_{study_instance_uid or accession_number}"
                daftar = all_results['daftars'][daftar_key]
                print(f"DEBUG: Processing file: {file_metadata['filename']}")
                exam_details = parse_dicom_examination_details(file_metadata)
                print(f"DEBUG: Parsed exam details: {exam_details}")
                
                # Find or create modality (ensure it exists)
                file_modality_name = exam_details['modality']
                file_modality, _ = Modaliti.objects.get_or_create(
                    nama=file_modality_name,
                    defaults={'singkatan': file_modality_name[:5]}
                )
                
                # Find or create body part
                part = None
                if exam_details['body_part']:
                    part, _ = Part.objects.get_or_create(
                        part=exam_details['body_part']
                    )
                
                # Find or create exam type - handle constraint with atomic transaction
                from django.db import transaction
                
                try:
                    with transaction.atomic():
                        exam, created = Exam.objects.get_or_create(
                            exam=exam_details['exam_type'],
                            modaliti=file_modality,
                            part=part,
                            defaults={'catatan': 'Created from DICOM upload'}
                        )
                        print(f"DEBUG: Exam {'created' if created else 'found'}: {exam.id} - {exam.exam}/{exam.modaliti.nama}/{exam.part.part if exam.part else None}")
                except Exception as e:
                    print(f"DEBUG: Exam creation failed: {e}")
                    print(f"DEBUG: Trying to find existing exam: {exam_details['exam_type']}/{file_modality.nama}/{part.part if part else None}")
                    
                    # Debug: Check what exams exist with similar names
                    similar_exams = Exam.objects.filter(exam__icontains='CHEST')
                    print(f"DEBUG: Found {similar_exams.count()} exams containing 'CHEST':")
                    for se in similar_exams[:5]:  # Show first 5
                        print(f"  - ID:{se.id} '{se.exam}' | Modality:{se.modaliti.nama}({se.modaliti.id}) | Part:{se.part.part if se.part else None}({se.part.id if se.part else None})")
                    
                    # Check modality and part values
                    print(f"DEBUG: Our values - Modality:{file_modality.nama}({file_modality.id}) | Part:{part.part if part else None}({part.id if part else None})")
                    
                    # Try exact match with different queries
                    exam = Exam.objects.filter(
                        exam=exam_details['exam_type'],
                        modaliti=file_modality,
                        part=part
                    ).first()
                    
                    if exam:
                        print(f"DEBUG: Found existing exam after error: {exam.id}")
                    else:
                        # Try without part filter in case part is the issue
                        exam_no_part = Exam.objects.filter(
                            exam=exam_details['exam_type'],
                            modaliti=file_modality,
                            part__isnull=True
                        ).first()
                        
                        if exam_no_part:
                            print(f"DEBUG: Found exam without part: {exam_no_part.id}")
                            exam = exam_no_part
                        else:
                            print(f"DEBUG: Still no exam found, this is definitely a database issue")
                            # Just use any CHEST exam with same modality as fallback
                            fallback_exam = Exam.objects.filter(
                                exam__iexact='CHEST',
                                modaliti=file_modality
                            ).first()
                            
                            if fallback_exam:
                                print(f"DEBUG: Using fallback exam: {fallback_exam.id}")
                                exam = fallback_exam
                            else:
                                raise Exception(f"Cannot create or find any suitable exam for: {exam_details['exam_type']}/{file_modality.nama}/{part.part if part else None}")
                
                # Map position to patient_position
                patient_position_mapped = None
                if exam_details['position']:
                    pos = exam_details['position'].upper()
                    position_map = {
                        'AP': 'AP',
                        'PA': 'PA', 
                        'LAT': 'LAT',
                        'LATERAL': 'LAT',
                        'LEFT': 'LATERAL_LEFT',
                        'RIGHT': 'LATERAL_RIGHT',
                        'OBL': 'OBLIQUE',
                        'OBLIQUE': 'OBLIQUE'
                    }
                    for key, value in position_map.items():
                        if key in pos:
                            patient_position_mapped = value
                            break
                    if not patient_position_mapped:
                        patient_position_mapped = exam_details['position']
                
                # Find radiographer user
                radiographer = request.user  # Default to uploading user
                if exam_details['radiographer_name']:
                    try:
                        from django.contrib.auth import get_user_model
                        User = get_user_model()
                        # Try to find user by name parts
                        name_parts = exam_details['radiographer_name'].split()
                        if len(name_parts) >= 1:
                            radiographer = User.objects.filter(
                                first_name__icontains=name_parts[0]
                            ).first() or request.user
                    except:
                        pass
                
                # Build comprehensive notes from DICOM metadata
                notes_parts = [f"File: {file_metadata['filename']}"]
                if file_metadata.get('series_description'):
                    notes_parts.append(f"Series: {file_metadata['series_description']}")
                if exam_details['laterality']:
                    notes_parts.append(f"Laterality: {exam_details['laterality']}")
                if file_metadata.get('acquisition_device_processing_description'):
                    notes_parts.append(f"Acquisition: {file_metadata['acquisition_device_processing_description']}")
                if exam_details['radiographer_name']:
                    notes_parts.append(f"Operator: {exam_details['radiographer_name']}")
                
                # Create examination record
                print(f"DEBUG: About to create Pemeriksaan for daftar {daftar.id}, exam {exam.id}")
                pemeriksaan = Pemeriksaan.objects.create(
                    daftar=daftar,
                    exam=exam,
                    accession_number=accession_number or None,
                    no_xray=accession_number or f"UPL{timezone.now().strftime('%Y%m%d%H%M%S')}_{len(all_results['examinations'])+1}",
                    patient_position=patient_position_mapped,
                    catatan=", ".join(notes_parts),
                    jxr=radiographer,
                    exam_status='COMPLETED'
                )
                print(f"DEBUG: Created Pemeriksaan ID {pemeriksaan.id} with accession '{pemeriksaan.accession_number}'")
                all_results['examinations'].append(pemeriksaan)
            
        except Exception as e:
            # Clean up temp files on error
            for file_data in processed_files:
                try:
                    os.unlink(file_data['temp_path'])
                except:
                    pass
            return Response({
                'success': False,
                'error': 'Failed to create study registration',
                'message': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Upload files to Orthanc PACS
        uploaded_instances = []
        try:
            # Get PACS configuration
            pacs_config = PacsConfig.objects.first()
            if not pacs_config:
                raise Exception("PACS server not configured")
            
            orthanc_url = pacs_config.orthancurl.rstrip('/')
            
            for file_data in processed_files:
                try:
                    # Upload to Orthanc
                    with open(file_data['temp_path'], 'rb') as dicom_file:
                        response = requests.post(
                            f"{orthanc_url}/instances",
                            files={'file': dicom_file},
                            timeout=30
                        )
                        
                        if response.status_code == 200:
                            result = response.json()
                            uploaded_instances.append({
                                'filename': file_data['filename'],
                                'orthanc_id': result.get('ID'),
                                'status': 'uploaded'
                            })
                        else:
                            uploaded_instances.append({
                                'filename': file_data['filename'],
                                'status': 'failed',
                                'error': f'HTTP {response.status_code}'
                            })
                            
                except Exception as upload_error:
                    uploaded_instances.append({
                        'filename': file_data['filename'],
                        'status': 'failed',
                        'error': str(upload_error)
                    })
                
        except Exception as e:
            # PACS upload failed, but registration was successful
            pass
        
        # Link to PACS study (same as PACS Browser import)
        if created_examinations and uploaded_instances:
            try:
                from exam.models import PacsExam
                # Create PacsExam link for the first examination
                first_uploaded = next((i for i in uploaded_instances if i['status'] == 'uploaded'), None)
                if first_uploaded:
                    PacsExam.objects.create(
                        exam=created_examinations[0],  # OneToOneField to first Pemeriksaan
                        orthanc_id=first_uploaded.get('orthanc_id', ''),
                        study_id=study_instance_uid,
                        study_instance=study_instance_uid
                    )
            except Exception as pacs_link_error:
                # Non-critical error - continue
                logger.warning(f"Failed to create PACS link: {pacs_link_error}")
        
        # Clean up temporary files
        for file_data in processed_files:
            try:
                os.unlink(file_data['temp_path'])
            except:
                pass
        
        # Prepare response
        success_count = len([i for i in uploaded_instances if i['status'] == 'uploaded'])
        total_count = len(uploaded_instances)
        
        return Response({
            'success': True,
            'message': f'Successfully processed {success_count}/{total_count} DICOM files for {len(all_results["patients"])} patients',
            'data': {
                'patients_created': len(all_results["patients"]),
                'patients': [
                    {
                        'id': patient.id,
                        'name': patient.nama,
                        'nric': patient.nric,
                        'mrn': patient.mrn
                    } for patient in all_results["patients"].values()
                ],
                'daftars_created': len(all_results["daftars"]),
                'daftars': [
                    {
                        'id': daftar.id,
                        'patient_id': daftar.pesakit.id,
                        'accession_number': daftar.parent_accession_number,
                        'study_instance_uid': daftar.study_instance_uid
                    } for daftar in all_results["daftars"].values()
                ],
                'examination_ids': [exam.id for exam in all_results["examinations"]],
                'examination_count': len(all_results["examinations"]),
                'uploaded_files': uploaded_instances,
                'pacs_status': 'uploaded' if success_count > 0 else 'failed'
            }
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        logger.error(f"DICOM upload error: {str(e)}")
        return Response({
            'success': False,
            'error': 'Upload failed',
            'message': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Dashboard API Views
class DashboardStatsAPIView(APIView):
    """
    API endpoint for dashboard statistics
    Provides aggregate statistics by time periods (today/week/month/year/all)
    """
    permission_classes = []  # Temporarily allow unauthenticated access for testing
    renderer_classes = [JSONRenderer]
    
    def get(self, request):
        from django.db.models import Count
        from datetime import datetime, timedelta
        
        # Get current time
        now = timezone.now()
        today = now.date()
        
        # Define time periods
        periods = {
            'today': {
                'start': timezone.make_aware(datetime.combine(today, datetime.min.time())),
                'end': timezone.make_aware(datetime.combine(today, datetime.max.time()))
            },
            'week': {
                'start': now - timedelta(days=7),
                'end': now
            },
            'month': {
                'start': now - timedelta(days=30),
                'end': now
            },
            'year': {
                'start': now - timedelta(days=365),
                'end': now
            }
        }
        
        stats = {}
        
        for period_name, period_range in periods.items():
            # Patient count
            patients_count = Pesakit.objects.filter(
                created__range=[period_range['start'], period_range['end']]
            ).count()
            
            # Registration count
            registrations_count = Daftar.objects.filter(
                created__range=[period_range['start'], period_range['end']]
            ).count()
            
            # Examination count
            examinations_count = Pemeriksaan.objects.filter(
                created__range=[period_range['start'], period_range['end']]
            ).count()
            
            # Completed studies count
            completed_studies = Daftar.objects.filter(
                created__range=[period_range['start'], period_range['end']],
                study_status='COMPLETED'
            ).count()
            
            # Calculate cases per day - use actual days in period
            if period_name == 'today':
                days_in_period = 1
            elif period_name == 'week':
                days_in_period = 7
            elif period_name == 'month':
                days_in_period = 30
            elif period_name == 'year':
                days_in_period = 365
            
            cases_per_day = round(examinations_count / days_in_period, 1) if days_in_period > 0 else 0
            
            stats[period_name] = {
                'patients': patients_count,
                'registrations': registrations_count,
                'examinations': examinations_count,
                'studies_completed': completed_studies,
                'cases_per_day': cases_per_day
            }
        
        # All time stats
        all_examinations = Pemeriksaan.objects.count()
        # Calculate all-time cases per day based on data span
        first_exam = Pemeriksaan.objects.order_by('created').first()
        if first_exam:
            total_days = (now - first_exam.created).days or 1
            all_time_cases_per_day = round(all_examinations / total_days, 1)
        else:
            all_time_cases_per_day = 0
        
        stats['all_time'] = {
            'patients': Pesakit.objects.count(),
            'registrations': Daftar.objects.count(),
            'examinations': all_examinations,
            'studies_completed': Daftar.objects.filter(study_status='COMPLETED').count(),
            'cases_per_day': all_time_cases_per_day
        }
        
        return Response(stats)


class DashboardDemographicsAPIView(APIView):
    """
    API endpoint for patient demographics
    Provides age, gender, and race distribution by time periods
    """
    permission_classes = []  # Temporarily allow unauthenticated access for testing
    renderer_classes = [JSONRenderer]
    
    def get(self, request):
        from datetime import datetime, timedelta
        
        # Get current time
        now = timezone.now()
        today = now.date()
        
        # Define time periods
        periods = {
            'today': {
                'start': timezone.make_aware(datetime.combine(today, datetime.min.time())),
                'end': timezone.make_aware(datetime.combine(today, datetime.max.time()))
            },
            'week': {
                'start': now - timedelta(days=7),
                'end': now
            },
            'month': {
                'start': now - timedelta(days=30),
                'end': now
            },
            'year': {
                'start': now - timedelta(days=365),
                'end': now
            }
        }
        
        demographics = {'by_period': {}}
        
        for period_name, period_range in periods.items():
            # Get patients in this period
            patients = Pesakit.objects.filter(
                created__range=[period_range['start'], period_range['end']]
            )
            
            total_patients = patients.count()
            
            if total_patients == 0:
                demographics['by_period'][period_name] = {
                    'age_groups': [],
                    'gender': [],
                    'race': []
                }
                continue
            
            # Age groups calculation
            age_groups = {'0-17': 0, '18-65': 0, '65+': 0}
            
            for patient in patients:
                if patient.t_lahir:  # If we can calculate age from NRIC
                    age = patient.kira_umur
                    if age < 18:
                        age_groups['0-17'] += 1
                    elif age <= 65:
                        age_groups['18-65'] += 1
                    else:
                        age_groups['65+'] += 1
                else:
                    # If no birth date, try to parse umur field
                    if patient.umur:
                        try:
                            age_str = patient.umur.replace('Y', '').replace('y', '').strip()
                            age = int(age_str)
                            if age < 18:
                                age_groups['0-17'] += 1
                            elif age <= 65:
                                age_groups['18-65'] += 1
                            else:
                                age_groups['65+'] += 1
                        except (ValueError, AttributeError):
                            # Default to adult if we can't determine age
                            age_groups['18-65'] += 1
            
            age_groups_list = [
                {
                    'range': age_range,
                    'count': count,
                    'percentage': round((count / total_patients) * 100, 1) if total_patients > 0 else 0
                }
                for age_range, count in age_groups.items()
            ]
            
            # Gender distribution
            gender_stats = patients.values('jantina').annotate(count=Count('jantina'))
            gender_list = []
            for gender_stat in gender_stats:
                gender_display = 'M' if gender_stat['jantina'] == 'L' else 'F'
                gender_list.append({
                    'gender': gender_display,
                    'count': gender_stat['count'],
                    'percentage': round((gender_stat['count'] / total_patients) * 100, 1)
                })
            
            # Race distribution
            race_stats = patients.values('bangsa').annotate(count=Count('bangsa'))
            race_list = [
                {
                    'race': race_stat['bangsa'],
                    'count': race_stat['count'],
                    'percentage': round((race_stat['count'] / total_patients) * 100, 1)
                }
                for race_stat in race_stats
            ]
            
            demographics['by_period'][period_name] = {
                'age_groups': age_groups_list,
                'gender': gender_list,
                'race': race_list
            }
        
        # Add all_time demographics
        all_patients = Pesakit.objects.all()
        total_all_patients = all_patients.count()
        
        if total_all_patients > 0:
            # Age groups calculation for all time
            age_groups_all = {'0-17': 0, '18-65': 0, '65+': 0}
            
            for patient in all_patients:
                if patient.t_lahir:  # If we can calculate age from NRIC
                    age = patient.kira_umur
                    if age < 18:
                        age_groups_all['0-17'] += 1
                    elif age <= 65:
                        age_groups_all['18-65'] += 1
                    else:
                        age_groups_all['65+'] += 1
                else:
                    # If no birth date, try to parse umur field
                    if patient.umur:
                        try:
                            age_str = patient.umur.replace('Y', '').replace('y', '').strip()
                            age = int(age_str)
                            if age < 18:
                                age_groups_all['0-17'] += 1
                            elif age <= 65:
                                age_groups_all['18-65'] += 1
                            else:
                                age_groups_all['65+'] += 1
                        except (ValueError, AttributeError):
                            # Default to adult if we can't determine age
                            age_groups_all['18-65'] += 1
            
            age_groups_all_list = [
                {
                    'range': age_range,
                    'count': count,
                    'percentage': round((count / total_all_patients) * 100, 1) if total_all_patients > 0 else 0
                }
                for age_range, count in age_groups_all.items()
            ]
            
            # Gender distribution for all time
            gender_stats_all = all_patients.values('jantina').annotate(count=Count('jantina'))
            gender_all_list = []
            for gender_stat in gender_stats_all:
                gender_display = 'M' if gender_stat['jantina'] == 'L' else 'F'
                gender_all_list.append({
                    'gender': gender_display,
                    'count': gender_stat['count'],
                    'percentage': round((gender_stat['count'] / total_all_patients) * 100, 1)
                })
            
            # Race distribution for all time
            race_stats_all = all_patients.values('bangsa').annotate(count=Count('bangsa'))
            race_all_list = [
                {
                    'race': race_stat['bangsa'],
                    'count': race_stat['count'],
                    'percentage': round((race_stat['count'] / total_all_patients) * 100, 1)
                }
                for race_stat in race_stats_all
            ]
            
            demographics['by_period']['all_time'] = {
                'age_groups': age_groups_all_list,
                'gender': gender_all_list,
                'race': race_all_list
            }
        else:
            demographics['by_period']['all_time'] = {
                'age_groups': [],
                'gender': [],
                'race': []
            }
        
        return Response(demographics)


class DashboardModalityStatsAPIView(APIView):
    """
    API endpoint for modality distribution statistics
    """
    permission_classes = []  # Temporarily allow unauthenticated access for testing
    renderer_classes = [JSONRenderer]
    
    def get(self, request):
        from datetime import datetime, timedelta
        
        # Get current time
        now = timezone.now()
        today = now.date()
        
        # Define time periods
        periods = {
            'today': {
                'start': timezone.make_aware(datetime.combine(today, datetime.min.time())),
                'end': timezone.make_aware(datetime.combine(today, datetime.max.time()))
            },
            'week': {
                'start': now - timedelta(days=7),
                'end': now
            },
            'month': {
                'start': now - timedelta(days=30),
                'end': now
            },
            'year': {
                'start': now - timedelta(days=365),
                'end': now
            }
        }
        
        modality_stats = {'by_period': {}}
        
        for period_name, period_range in periods.items():
            # Get examinations in this period with modality info
            examinations = Pemeriksaan.objects.filter(
                created__range=[period_range['start'], period_range['end']]
            ).select_related('exam__modaliti')
            
            total_exams = examinations.count()
            
            if total_exams == 0:
                modality_stats['by_period'][period_name] = []
                continue
            
            # Group by modality
            modality_counts = examinations.values('exam__modaliti__nama').annotate(
                count=Count('exam__modaliti__nama')
            ).order_by('-count')
            
            modality_list = [
                {
                    'modality': modality['exam__modaliti__nama'],
                    'count': modality['count'],
                    'percentage': round((modality['count'] / total_exams) * 100, 1)
                }
                for modality in modality_counts
            ]
            
            modality_stats['by_period'][period_name] = modality_list
        
        # Add all_time modality stats
        all_examinations = Pemeriksaan.objects.all().select_related('exam__modaliti')
        total_all_exams = all_examinations.count()
        
        if total_all_exams > 0:
            # Group by modality for all time
            all_modality_counts = all_examinations.values('exam__modaliti__nama').annotate(
                count=Count('exam__modaliti__nama')
            ).order_by('-count')
            
            all_modality_list = [
                {
                    'modality': modality['exam__modaliti__nama'],
                    'count': modality['count'],
                    'percentage': round((modality['count'] / total_all_exams) * 100, 1)
                }
                for modality in all_modality_counts
            ]
            
            modality_stats['by_period']['all_time'] = all_modality_list
        else:
            modality_stats['by_period']['all_time'] = []
        
        return Response(modality_stats)


class DashboardStorageAPIView(APIView):
    """
    API endpoint for storage management and capacity planning
    """
    permission_classes = []  # Temporarily allow unauthenticated access for testing
    renderer_classes = [JSONRenderer]
    
    def get(self, request):
        import os
        import shutil
        import psutil
        from django.conf import settings
        
        try:
            # Get dashboard configuration for storage paths
            dashboard_config = DashboardConfig.objects.first()
            
            # Get storage paths from configuration or use defaults
            if dashboard_config and dashboard_config.storage_root_paths:
                configured_paths = dashboard_config.storage_root_paths
            else:
                # Default storage paths
                configured_paths = [
                    '/var/lib/orthanc/db',
                    '/data/orthanc',
                    '/opt/orthanc/data',
                    settings.MEDIA_ROOT,  # Django media folder as fallback
                ]
            
            # Filter to only existing paths
            storage_paths = []
            for path in configured_paths:
                if os.path.exists(path):
                    storage_paths.append(path)
            
            # If no paths found, use current directory as fallback
            if not storage_paths:
                storage_paths = [os.getcwd()]
            
            storage_info = []
            total_used = 0
            total_capacity = 0
            
            for path in storage_paths:
                try:
                    # Get disk usage for this path
                    total, used, free = shutil.disk_usage(path)
                    
                    # Convert bytes to GB
                    total_gb = total / (1024**3)
                    used_gb = used / (1024**3)
                    free_gb = free / (1024**3)
                    usage_percentage = (used / total) * 100 if total > 0 else 0
                    
                    storage_info.append({
                        'path': path,
                        'total_gb': round(total_gb, 2),
                        'used_gb': round(used_gb, 2),
                        'free_gb': round(free_gb, 2),
                        'usage_percentage': round(usage_percentage, 1)
                    })
                    
                    total_used += used_gb
                    total_capacity += total_gb
                    
                except (OSError, PermissionError):
                    # Skip paths we can't access
                    continue
            
            # Calculate growth analysis
            # Get examination count for last 30 days to estimate daily growth
            thirty_days_ago = timezone.now() - timedelta(days=30)
            recent_exams = Pemeriksaan.objects.filter(
                created__gte=thirty_days_ago
            ).count()
            
            # Get average exam size from configuration or use default
            if dashboard_config and dashboard_config.modality_size_estimates:
                # Calculate weighted average based on modality distribution
                modality_counts = Pemeriksaan.objects.values('exam__modaliti__nama').annotate(
                    count=Count('exam__modaliti__nama')
                )
                total_exams = sum(m['count'] for m in modality_counts)
                weighted_size = 0
                
                if total_exams > 0:
                    for modality in modality_counts:
                        modality_name = modality['exam__modaliti__nama'].upper()
                        size_estimate = dashboard_config.modality_size_estimates.get(modality_name, 0.05)
                        weight = modality['count'] / total_exams
                        weighted_size += size_estimate * weight
                    avg_exam_size_gb = weighted_size
                else:
                    avg_exam_size_gb = 0.05  # Default 50MB
            else:
                avg_exam_size_gb = 0.05  # Default 50MB
            
            daily_exam_count = recent_exams / 30 if recent_exams > 0 else 1
            daily_growth_gb = daily_exam_count * avg_exam_size_gb
            monthly_growth_gb = daily_growth_gb * 30
            
            # Calculate time until full
            if total_capacity > total_used and daily_growth_gb > 0:
                free_space_gb = total_capacity - total_used
                days_until_full = free_space_gb / daily_growth_gb
                months_until_full = days_until_full / 30
            else:
                days_until_full = 0
                months_until_full = 0
            
            # Modality storage breakdown (estimated)
            modality_breakdown = []
            total_examinations = Pemeriksaan.objects.count()
            
            if total_examinations > 0:
                modality_counts = Pemeriksaan.objects.values('exam__modaliti__nama').annotate(
                    count=Count('exam__modaliti__nama')
                ).order_by('-count')
                
                # Get modality size estimates from configuration
                if dashboard_config and dashboard_config.modality_size_estimates:
                    modality_size_estimates = dashboard_config.modality_size_estimates
                else:
                    # Default estimates
                    modality_size_estimates = {
                        'X-RAY': 0.03,  # 30MB average
                        'CR': 0.03,     # 30MB average
                        'DX': 0.03,     # 30MB average
                        'CT': 0.3,      # 300MB average
                        'MRI': 0.5,     # 500MB average
                        'US': 0.1,      # 100MB average
                    }
                
                for modality in modality_counts:
                    modality_name = modality['exam__modaliti__nama']
                    exam_count = modality['count']
                    
                    # Get estimated size per exam for this modality
                    size_per_exam = modality_size_estimates.get(modality_name.upper(), 0.05)  # Default 50MB
                    estimated_size_gb = exam_count * size_per_exam
                    
                    modality_breakdown.append({
                        'modality': modality_name,
                        'size_gb': round(estimated_size_gb, 2),
                        'percentage': round((estimated_size_gb / total_used) * 100, 1) if total_used > 0 else 0
                    })
            
            # Get system resources (CPU and RAM)
            try:
                cpu_percent = psutil.cpu_percent(interval=1)
                memory = psutil.virtual_memory()
                disk_io = psutil.disk_io_counters()
                
                system_resources = {
                    'cpu_usage_percent': round(cpu_percent, 1),
                    'ram_total_gb': round(memory.total / (1024**3), 2),
                    'ram_used_gb': round(memory.used / (1024**3), 2),
                    'ram_available_gb': round(memory.available / (1024**3), 2),
                    'ram_usage_percent': round(memory.percent, 1),
                    'disk_read_mb': round(disk_io.read_bytes / (1024**2), 2) if disk_io else 0,
                    'disk_write_mb': round(disk_io.write_bytes / (1024**2), 2) if disk_io else 0
                }
            except (ImportError, AttributeError):
                # psutil might not be available or some functions might not work
                system_resources = {
                    'cpu_usage_percent': 0,
                    'ram_total_gb': 0,
                    'ram_used_gb': 0,
                    'ram_available_gb': 0,
                    'ram_usage_percent': 0,
                    'disk_read_mb': 0,
                    'disk_write_mb': 0
                }
            
            return Response({
                'storage_paths': storage_info,
                'primary_storage': {
                    'total_gb': round(total_capacity, 2),
                    'used_gb': round(total_used, 2),
                    'free_gb': round(total_capacity - total_used, 2),
                    'usage_percentage': round((total_used / total_capacity) * 100, 1) if total_capacity > 0 else 0
                },
                'growth_analysis': {
                    'daily_growth_gb': round(daily_growth_gb, 2),
                    'monthly_growth_gb': round(monthly_growth_gb, 2),
                    'days_until_full': int(days_until_full),
                    'months_until_full': round(months_until_full, 1),
                    'daily_exam_count': round(daily_exam_count, 1)
                },
                'by_modality': modality_breakdown,
                'system_resources': system_resources
            })
            
        except Exception as e:
            return Response({
                'error': f'Storage analysis failed: {str(e)}',
                'storage_paths': [],
                'primary_storage': {
                    'total_gb': 0,
                    'used_gb': 0,
                    'free_gb': 0,
                    'usage_percentage': 0
                },
                'growth_analysis': {
                    'daily_growth_gb': 0,
                    'monthly_growth_gb': 0,
                    'days_until_full': 0,
                    'months_until_full': 0,
                    'daily_exam_count': 0
                },
                'by_modality': []
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DashboardConfigAPIView(APIView):
    """
    API endpoint for dashboard configuration management
    """
    permission_classes = []  # Temporarily allow unauthenticated access for testing
    renderer_classes = [JSONRenderer]
    
    def get(self, request):
        """Get current dashboard configuration"""
        try:
            config = DashboardConfig.objects.first()
            if not config:
                # Create default config if none exists
                config = DashboardConfig.objects.create()
            
            return Response({
                'id': config.id,
                'storage_root_paths': config.storage_root_paths,
                'storage_warning_threshold': config.storage_warning_threshold,
                'storage_critical_threshold': config.storage_critical_threshold,
                'target_turnaround_time': config.target_turnaround_time,
                'target_daily_throughput': config.target_daily_throughput,
                'target_equipment_utilization': config.target_equipment_utilization,
                'modality_size_estimates': config.modality_size_estimates,
                'auto_refresh_interval': config.auto_refresh_interval,
                'email_notifications': config.email_notifications,
                'notification_emails': config.notification_emails,
                'modified': config.modified
            })
            
        except Exception as e:
            return Response({
                'error': f'Failed to fetch configuration: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def post(self, request):
        """Update dashboard configuration"""
        try:
            config = DashboardConfig.objects.first()
            if not config:
                config = DashboardConfig.objects.create()
            
            # Update configuration fields
            if 'storage_root_paths' in request.data:
                config.storage_root_paths = request.data['storage_root_paths']
            if 'storage_warning_threshold' in request.data:
                config.storage_warning_threshold = request.data['storage_warning_threshold']
            if 'storage_critical_threshold' in request.data:
                config.storage_critical_threshold = request.data['storage_critical_threshold']
            if 'target_turnaround_time' in request.data:
                config.target_turnaround_time = request.data['target_turnaround_time']
            if 'target_daily_throughput' in request.data:
                config.target_daily_throughput = request.data['target_daily_throughput']
            if 'target_equipment_utilization' in request.data:
                config.target_equipment_utilization = request.data['target_equipment_utilization']
            if 'modality_size_estimates' in request.data:
                config.modality_size_estimates = request.data['modality_size_estimates']
            if 'auto_refresh_interval' in request.data:
                config.auto_refresh_interval = request.data['auto_refresh_interval']
            if 'email_notifications' in request.data:
                config.email_notifications = request.data['email_notifications']
            if 'notification_emails' in request.data:
                config.notification_emails = request.data['notification_emails']
            
            config.save()
            
            return Response({
                'success': True,
                'message': 'Configuration updated successfully',
                'config': {
                    'id': config.id,
                    'storage_root_paths': config.storage_root_paths,
                    'storage_warning_threshold': config.storage_warning_threshold,
                    'storage_critical_threshold': config.storage_critical_threshold,
                    'modality_size_estimates': config.modality_size_estimates,
                    'modified': config.modified
                }
            })
            
        except Exception as e:
            return Response({
                'error': f'Failed to update configuration: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DashboardBodypartsExamTypesAPIView(APIView):
    """
    API endpoint for bodyparts and exam types distribution
    Provides breakdown of examinations by body parts and exam types by time periods
    """
    permission_classes = []  # Temporarily allow unauthenticated access for testing
    renderer_classes = [JSONRenderer]
    
    def get(self, request):
        from datetime import datetime, timedelta
        from django.db.models import Count
        
        # Get current time
        now = timezone.now()
        today = now.date()
        
        # Define time periods
        periods = {
            'today': {
                'start': timezone.make_aware(datetime.combine(today, datetime.min.time())),
                'end': timezone.make_aware(datetime.combine(today, datetime.max.time()))
            },
            'week': {
                'start': now - timedelta(days=7),
                'end': now
            },
            'month': {
                'start': now - timedelta(days=30),
                'end': now
            },
            'year': {
                'start': now - timedelta(days=365),
                'end': now
            }
        }
        
        bodyparts_exam_stats = {'by_period': {}}
        
        for period_name, period_range in periods.items():
            # Get examinations in this period
            examinations = Pemeriksaan.objects.filter(
                created__range=[period_range['start'], period_range['end']]
            )
            
            total_examinations = examinations.count()
            
            if total_examinations == 0:
                bodyparts_exam_stats['by_period'][period_name] = {
                    'bodyparts': [],
                    'exam_types': []
                }
                continue
            
            # Body parts distribution (using Part model through Exam)
            bodyparts_stats = examinations.values('exam__part__part').annotate(
                count=Count('exam__part__part')
            ).order_by('-count')
            
            bodyparts_list = []
            for bodypart_stat in bodyparts_stats:
                bodypart_name = bodypart_stat['exam__part__part'] or 'Unknown'
                count = bodypart_stat['count']
                percentage = round((count / total_examinations) * 100, 1)
                
                bodyparts_list.append({
                    'bodypart': bodypart_name,
                    'count': count,
                    'percentage': percentage
                })
            
            # Exam types distribution (using Exam model)
            exam_types_stats = examinations.values('exam__exam').annotate(
                count=Count('exam__exam')
            ).order_by('-count')
            
            exam_types_list = []
            for exam_type_stat in exam_types_stats:
                exam_name = exam_type_stat['exam__exam'] or 'Unknown'
                count = exam_type_stat['count']
                percentage = round((count / total_examinations) * 100, 1)
                
                exam_types_list.append({
                    'exam_type': exam_name,
                    'count': count,
                    'percentage': percentage
                })
            
            bodyparts_exam_stats['by_period'][period_name] = {
                'bodyparts': bodyparts_list,
                'exam_types': exam_types_list
            }
        
        # Add all_time stats
        all_examinations = Pemeriksaan.objects.all()
        total_all_examinations = all_examinations.count()
        
        if total_all_examinations > 0:
            # All time body parts
            all_bodyparts_stats = all_examinations.values('exam__part__part').annotate(
                count=Count('exam__part__part')
            ).order_by('-count')
            
            all_bodyparts_list = []
            for bodypart_stat in all_bodyparts_stats:
                bodypart_name = bodypart_stat['exam__part__part'] or 'Unknown'
                count = bodypart_stat['count']
                percentage = round((count / total_all_examinations) * 100, 1)
                
                all_bodyparts_list.append({
                    'bodypart': bodypart_name,
                    'count': count,
                    'percentage': percentage
                })
            
            # All time exam types
            all_exam_types_stats = all_examinations.values('exam__exam').annotate(
                count=Count('exam__exam')
            ).order_by('-count')
            
            all_exam_types_list = []
            for exam_type_stat in all_exam_types_stats:
                exam_name = exam_type_stat['exam__exam'] or 'Unknown'
                count = exam_type_stat['count']
                percentage = round((count / total_all_examinations) * 100, 1)
                
                all_exam_types_list.append({
                    'exam_type': exam_name,
                    'count': count,
                    'percentage': percentage
                })
            
            bodyparts_exam_stats['by_period']['all_time'] = {
                'bodyparts': all_bodyparts_list,
                'exam_types': all_exam_types_list
            }
        else:
            bodyparts_exam_stats['by_period']['all_time'] = {
                'bodyparts': [],
                'exam_types': []
            }
        
        return Response(bodyparts_exam_stats)
