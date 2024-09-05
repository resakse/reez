import json
from datetime import datetime

from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator, PageNotAnInteger, EmptyPage
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.http import require_POST
from django_htmx.http import trigger_client_event, push_url

from exam.models import Pemeriksaan, Daftar, Exam, Modaliti, Region, kiraxray
from pesakit.models import Pesakit
from .filters import DaftarFilter
from .forms import BcsForm, DaftarForm, RegionForm, ExamForm


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
    noxraybaru = kiraxray()
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
    noxraybaru = kiraxray()
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

orthancurl = "http://172.25.96.1:8043/tools/find"
orthancurl = "http://192.168.20.172:8042/tools/find"
viewerurl='http://172.25.96.1:8043/osimis-viewer/app/index.html?study='
viewerurl='http://localhost:8043/ohif/viewer?url=../studies/'
import requests
import json
def orthanc_list(request):
    opt = {"Level": "Patient", "Expand": True, "Limit": 100,"Query":{}}
    # list = requests.get(f'{orthancurl}/studies?expand')
    list = requests.post(f'{orthancurl}',json=opt)
    data =list.json()
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
    # list = requests.get(f'{orthancurl}/studies?expand')
    list = requests.post(f'{orthancurl}',json=opt)
    data =list.json()
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