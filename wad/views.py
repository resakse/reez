import json

from django.shortcuts import render, redirect

from wad.forms import WardForm, DispForm
from wad.models import Ward, Disiplin
from django.core.paginator import Paginator
from django.http import HttpResponse
from django.contrib.admin.views.decorators import staff_member_required

# Create your views her
@staff_member_required
def ward_list(request):
    page = request.GET.get('page', 1)
    get_dis = request.GET.get('disiplin', None)
    ward = Ward.objects.all()
    if get_dis:
        disiplin = Disiplin.objects.get(id=get_dis)
        ward = Ward.objects.filter(disiplin=disiplin)
    dis = Disiplin.objects.all()
    form = WardForm()
    paginator = Paginator(ward, per_page=10)
    page_object = paginator.get_page(page)
    page_range = paginator.get_elided_page_range(number=page, on_each_side=1, on_ends=1)

    data = {
        'ward': page_object,
        'disiplin': dis,
        'form': form,
        'page_range': page_range,
    }
    if request.htmx:
        if get_dis:
            data['pilih']=True
        response = render(request,'wad/war-partial.html', context=data)
        response['HX-Trigger'] = json.dumps({"disip": get_dis})
    else:
        response = render(request, 'wad/wad_list.html', context=data)

    return response
    # return render(request, template, context=data)

@staff_member_required
def disiplin_list(request):
    disp = Disiplin.objects.all()
    return  render(request, 'wad/disp-list.html', context={'disiplin': disp})


@staff_member_required
def disiplin_tambah(request):
    form = DispForm()
    tajuk = 'Tambah Disiplin'
    disp = Disiplin.objects.all()
    data = {
        'form': form,
        'tajuk': tajuk,
        'htarget': '#disiplin',
        'disiplin': disp,
    }

    if request.method=="POST":
        form = DispForm(request.POST)
        if form.is_valid():
            newdisp = form.save(commit=False)
            newdisp.disiplin = newdisp.disiplin.upper()
            disp = Disiplin.objects.all()

            data = {
                'disiplin': disp,
                'htarget': '#disiplin'

            }
            temp = render(request, 'wad/disp-list.html', context=data)
            temp['HX-Trigger'] = json.dumps({
                    "showMessage":f"Disiplin {newdisp.disiplin} berjaya di Tambah"})
            return temp
        data["form"]=form
    return render(request, 'wad/tambah-disiplin.html', context=data)



@staff_member_required
def disiplin_update(request, id=None):
    disiplin = Disiplin.objects.get(id=id)
    form = DispForm(request.POST or None, instance=disiplin)
    data = {
        "form": form,
        'disiplin': disiplin,
     }

    if request.method=="POST":
        if form.is_valid():
            disp_edit = form.save(commit=False)
            disp_edit.disiplin = disp_edit.disiplin.upper()
            disp_edit.save()
            response = render(request, "wad/disp-detail.html", context={'d': disiplin})
            response['HX-Trigger'] = json.dumps({"showMessage": f"{disp_edit} Berjaya di Kemaskini"})
            return response

    response = render(request, 'wad/tambah-disiplin.html', context=data)

    return response


@staff_member_required
def disiplin_delete(request, id=None):
    mydisp = Disiplin.objects.get(id=id)
    nama = mydisp.disiplin
    mydisp.delete()
    disp = Disiplin.objects.all()
    data = {
        'disiplin': disp
    }
    response = render(request, 'wad/disp-list.html', context=data)
    response['HX-Trigger'] = json.dumps({"showMessage": f"{nama} Berjaya di Padam"})

    return response


@staff_member_required
def wad_tambah(request):
    form = WardForm(request.POST or None)
    data = {
        'form': form,
        'nopage': True
    }

    if request.method=="POST":
        disp = Ward.objects.all()
        data = {
            'ward': disp,
            'form': form
        }
        if form.is_valid():
            newdisp = form.save(commit=False)
            newdisp.wad = newdisp.wad.upper()
            newdisp.save()
            temp = redirect('wad:wad-list')
            temp['HX-Trigger'] = json.dumps({
                    "showMessage":f"Wad {newdisp.wad} berjaya di Tambah"})
            return temp

    return render(request, 'wad/tambah-wad.html', context=data)


@staff_member_required
def wad_kemaskini(request, id=None):
    wad = Ward.objects.get(id=id)
    form = WardForm(request.POST or None, instance=wad)
    data = {
        "form": form,
        'w': wad,
     }

    if request.method=="POST":
        if form.is_valid():
            wad_edit = form.save()
            response = render(request, "wad/wad-detail.html", context={'w': wad})
            response['HX-Trigger'] = json.dumps({"showMessage": f"{wad_edit} Berjaya di Kemaskini"})
            return response

    response = render(request, 'wad/tambah-wad.html', context=data)

    return response


@staff_member_required
def wad_delete(request, id=None):
    mydisp = Ward.objects.get(id=id)
    nama = mydisp.wad
    mydisp.delete()
    response = HttpResponse("")
    response['HX-Trigger'] = json.dumps({"showMessage": f"{nama} Berjaya di Padam"})

    return response