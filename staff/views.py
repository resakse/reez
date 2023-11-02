import json

from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse

from reez import settings
from .models import Staff
from .forms import StaffForm, StaffEdit, TukarPassForm, StaffTukar
# Create your views here.
from django_htmx.http import retarget

@login_required
def stafflist(request):
    staff = Staff.objects.all()

    data = {
        'staff': staff,
        'tajuk': 'Senarai Staff'
    }
    template = 'staff/userlist.html'
    if request.htmx:
        template = 'staff/userlist-partial.html'
    return render(request, template, context=data)


def staff_tambah(request):
    form = StaffForm(request.POST or None)
    form.helper.attrs = {
        "hx-post": reverse("staff:staff-tambah"),
        'hx-target': '#modal-dialog'
    }
    data = {
        'form': form,
        'tajuk': 'Tambah Staff'

    }
    if request.method == 'POST':
        if form.is_valid():
            staff = form.save(commit=False)
            staff.kemaskini = request.user.username
            staff.save()
            response = HttpResponse(status=202)
            response["HX-Trigger"] = json.dumps(
                {
                    "tableChanged": {
                        "msg": f"Staff {staff.first_name} berjaya di tambah.",
                        "kelas": "success",
                    },
                }
            )
            return response
    return render(request, 'staff/tambahstaff.html', context=data)


def staff_edit(request, pk=None):
    staff = get_object_or_404(Staff,pk=pk)
    form = StaffEdit(request.POST or None, instance=staff)
    form.helper.attrs = {
        "hx-post": reverse("staff:staff-edit",args=[pk]),
        'hx-target': '#modal-dialog'
    }
    data = {
        'form': form,
        'tajuk': f'Kemaskini {staff.first_name}'
    }
    if request.method == "POST":
        if form.is_valid():
            print('form valid')
            staff = form.save(commit=False)
            staff.kemaskini = request.user.username
            staff.save()
            data['item'] = staff
            data['single'] = True
            response = render(request, 'staff/userlist-partial.html', context=data)
            response["HX-Trigger"] = json.dumps(
                {
                    "notis": {
                        "msg": f"Staff {staff.first_name} berjaya di kemaskini.",
                        "kelas": "success",
                    },
                }
            )
            response["HX-Retarget"] = f"#item-{staff.id}"
            return response
            # return retarget(response, f"#item-{staff.id}")
        else:
            print('form tak valid')
    return render(request, 'staff/tambahstaff.html', context=data)


def useractive(request, pk=None):
    staff = get_object_or_404(Staff,id=pk)
    if staff.is_active:
        staff.is_active = False
        status = 'Tidak Aktif'
        kelas = 'warning'
    else:
        staff.is_active = True
        status = 'Aktif'
        kelas = 'info'
    staff.save()
    response = HttpResponse(status=200)
    response["HX-Trigger"] = json.dumps(
        {
            "notis": {
                "msg": f"Status bagi staff {staff.first_name} di tukar kepada {status}.",
                "kelas": kelas,
            },
        }
    )
    return response

def staff_passwd(request, pk=None):
    staff = get_object_or_404(Staff,id=pk)
    form = TukarPassForm(request.POST)
    form.helper.attrs = {
        "hx-post": reverse("staff:staff-pass",args=[pk]),
        'hx-target': '#modal-dialog'

    }

    data = {
        'form': form,
        'tajuk': 'Tukar Kata Laluan'
    }
    if request.method == 'POST':
        if form.is_valid():
            passwd = form.cleaned_data['password']
            staff.set_password(passwd)
            staff.save()
            kelas='success'
            response = HttpResponse(status=200)
            response["HX-Trigger"] = json.dumps(
                {
                    "notis": {
                        "msg": f"Kata laluan staff {staff.first_name} berjaya di tukar.",
                        "kelas": kelas,
                    },
                }
            )
            return response
    return render(request, 'staff/tukarpass.html', context=data)


def login_user(request):
    next = request.GET.get('next')

    if request.POST:
        username = request.POST['username']
        password = request.POST['password']
        user = authenticate(request,username=username, password=password)
        if user is not None:
            login(request, user)
            if not next:
                return HttpResponseRedirect('/')
            else:
                return HttpResponseRedirect(next)
        else:
            messages.info(request, f'Maaf, Username atau Kata Laluan tidak tepat')
    return render(request, 'staff/login.html', context={'next': next})


def logout_view(request):
    logout(request)
    return redirect(f"{settings.LOGIN_URL}")


def tukar_laluan(request):
    staff = request.user
    form = StaffTukar(staff, request.POST)
    form.helper.attrs = {
        "hx-post": reverse("staff:staff-tukar"),
        'hx-target': '#modal-dialog'
    }
    data = {
        'form': form,
        'tajuk': 'Tukar Kata Laluan'
    }

    if form.is_valid():
        form.save()
        response = HttpResponse(status=200)
        response["HX-Trigger"] = json.dumps(
            {
                "notis": {
                    "msg": f"Kata laluan staff {staff.first_name} berjaya di tukar.",
                    "kelas": 'success',
                },
            }
        )
        return response
    return render(request, 'staff/tambahstaff.html', context=data)
