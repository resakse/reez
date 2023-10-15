import json

from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator, PageNotAnInteger, EmptyPage
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.http import require_POST
from django_htmx.http import trigger_client_event, push_url

from exam.models import Pemeriksaan, Daftar, Exam, Modaliti, Region
from pesakit.models import Pesakit
# from .filters import DaftarFilter
from .forms import BcsForm, DaftarForm, RegionForm, ExamForm


# Create your views here.
@login_required
def senarai_bcs(request):
    param = request.GET.copy()
    parameter = param.pop("page", True) and param.urlencode()  # buang page dari url
    # daftar = DaftarFilter(
    #     request.GET,
    #     queryset=Pemeriksaan.objects.all()
    #     .select_related("daftar__rujukan", "exam__modaliti")
    #     .order_by("-tarikh"),
    # )
    daftar = Daftar.objects.all()
    page = request.GET.get("page", 1)
    paginator = Paginator(daftar, 10)  # Show 25 contacts per page.
    try:
        page_obj = paginator.page(page)
    except PageNotAnInteger:
        page_obj = paginator.page(1)
    except EmptyPage:
        page_obj = paginator.page(paginator.num_pages)

    data = {"daftar": daftar, "page_obj": page_obj, "param": parameter}
    template = "exam/senarai.html"
    if request.htmx:
        template = "exam/senarai-partial.html"
    return render(request, template, data)


@login_required
def tambah_bcs(request):
    tajuk = 'Tambah BCS'
    form = BcsForm(request.POST or None)
    examform = DaftarForm(request.POST or None)
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
        print(request.POST)
        if form.is_valid() and examform.is_valid():
            bcs = form.save(commit=False)
            bcs.jxr = request.user
            bcs.save()
            form = BcsForm(instance=bcs)
            if examform.is_valid():
                exam = examform.save(commit=False)
                exam.bcs = bcs
                exam.jxr = request.user
                exam.save()
                exams = Daftar.objects.filter(bcs=bcs)
                examform = DaftarForm(None)
                hantar_url = reverse("bcs:bcs-edit", args=[bcs.pk])

                data = {
                    'tajuk': tajuk,
                    "form": form,
                    "examform": examform,
                    "exams": exams,
                    "hantar_url": hantar_url,
                    "bcs_id": bcs.pk,
                }
                temp_response = render(request, template, data)
                response = push_url(
                    temp_response, reverse("bcs:bcs-edit", args=[bcs.pk])
                )
                response["HX-Trigger"] = json.dumps(
                    {
                        "htmxSuccess": f"BCS Berjaya di tambah.",
                    }
                )

            else:
                print("form tak valid")

    return response


@login_required
def edit_bcs(request, pk=None):
    bcs = Daftar.objects.get(pk=pk)
    tajuk = f'Kemaskini BCS - {bcs.nama}'
    form = BcsForm(request.POST or None, instance=bcs)
    exams = Pemeriksaan.objects.filter(bcs=pk)
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
            bcs = form.save(commit=False)
            bcs.jxr = request.user
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
                    "htmxSuccess": f"BCS Berjaya di Kemaskini.",
                }
            )
        else:
            print("form tak valid")

    return response


@login_required
def list_exam(request, pk=None):
    exam = Daftar.objects.filter(bcs_id=pk)
    data = {"exams": exam, "bcs_id": pk}
    return render(request, "exam/bcs_item-partial.html", data)


@login_required
def del_exam(request, pk=None):
    exam = get_object_or_404(Daftar, pk=pk)
    bcs = exam.bcs
    exam.delete()
    exams = Daftar.objects.filter(bcs=bcs)
    data = {"exams": exams, "bcs_id": bcs.id}
    return render(request, "exam/bcs_item-partial.html", data)


@login_required
def tambah_exam(request, pk=None):
    examform = DaftarForm(request.POST or None)
    bcs = Daftar.objects.get(pk=pk)
    if request.method == "POST":
        print('tambah exam', request.POST)
        if examform.is_valid():
            print('exam valid')
            exam = examform.save(commit=False)
            exam.bcs = bcs
            exam.jxr = request.user
            exam.save()
            exams = Daftar.objects.filter(bcs_id=pk)
            return render(
                request,
                "exam/bcs_item-partial.html",
                context={"exams": exams, "bcs_id": exam.bcs_id},
            )
        print('exam not valid')
    data = {"examform": examform, "bcs_id": pk}
    return render(request, "exam/exam-tambah.html", data)


@login_required
def edit_exam(request, pk=None):
    exam = get_object_or_404(Daftar, pk=pk)
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
    exam = get_object_or_404(Daftar, pk=pk)

    return render(
        request, "exam/exam-item.html", context={"item": exam, "bcs_id": exam.bcs_id}
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
        response, "msg", {"merged": f"{exam.nobcs} berjaya di kemaskini"}, after="swap"
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
    am = request.GET['mrn']
    pesakit = None
    nama = None
    nric = None
    rekod = None
    pesakit = Pesakit.objects.filter(mrn=am.upper()).first()
    if pesakit:
        nama = pesakit.nama
        nric = pesakit.nric
        rekod = f"[BCS {pesakit.tarikh}]"
    if not pesakit:
        return HttpResponse(f'<span id="pesakitada" data-mrn="tiada" class="alert alert-primary">Pesakit baru</span>')

    response = HttpResponse(f'<span id="pesakitada" class="alert alert-success">Rekod Pesakit Wujud {rekod}</span>')
    return trigger_client_event(response, "pesakitada", {"nama": nama, "nric": nric})


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
    exam = get_object_or_404(Exam, id=pk)
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

    return response


def examDelete(request, pk=None):
    exam = get_object_or_404(Exam, id=pk)
    exam.delete()

    all_exam = Exam.objects.all()
    examform = ExamForm()
    data = {
        'exam': all_exam,
        'examform': examform
    }
    response = render(request, 'exam/config/exam_list.html', data)
    return trigger_client_event(response, "msg", {"msg": f'{exam.exam} Berjaya di Padam'})

