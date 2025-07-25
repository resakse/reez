from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import Ward, Disiplin
from .serializers import WardSerializer, DisiplinSerializer

# REST API ViewSets
class WardViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows wards to be viewed or edited.
    """
    queryset = Ward.objects.all().order_by('wad')
    serializer_class = WardSerializer
    permission_classes = [IsAuthenticated]

class DisiplinViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows disciplines to be viewed or edited.
    """
    queryset = Disiplin.objects.all().order_by('disiplin')
    serializer_class = DisiplinSerializer
    permission_classes = [IsAuthenticated]

# Traditional views for wad management
@login_required
def ward_list(request):
    wards = Ward.objects.all().order_by('wad')
    return render(request, 'wad/ward_list.html', {'wards': wards})

@login_required
def wad_tambah(request):
    if request.method == 'POST':
        wad = request.POST.get('wad')
        singkatan = request.POST.get('singkatan')
        disiplin_id = request.POST.get('disiplin')
        
        if wad and disiplin_id:
            disiplin = get_object_or_404(Disiplin, id=disiplin_id)
            Ward.objects.create(wad=wad, singkatan=singkatan, disiplin=disiplin)
            messages.success(request, 'Ward berjaya ditambah')
            return redirect('wad:wad-list')
    
    disiplins = Disiplin.objects.all()
    return render(request, 'wad/wad_form.html', {'disiplins': disiplins})

@login_required
def wad_kemaskini(request, id):
    ward = get_object_or_404(Ward, id=id)
    if request.method == 'POST':
        ward.wad = request.POST.get('wad', ward.wad)
        ward.singkatan = request.POST.get('singkatan', ward.singkatan)
        disiplin_id = request.POST.get('disiplin')
        if disiplin_id:
            ward.disiplin = get_object_or_404(Disiplin, id=disiplin_id)
        ward.save()
        messages.success(request, 'Ward berjaya dikemaskini')
        return redirect('wad:wad-list')
    
    disiplins = Disiplin.objects.all()
    return render(request, 'wad/wad_form.html', {'ward': ward, 'disiplins': disiplins})

@login_required
def wad_delete(request, id):
    ward = get_object_or_404(Ward, id=id)
    if request.method == 'POST':
        ward.delete()
        messages.success(request, 'Ward berjaya dipadam')
    return redirect('wad:wad-list')

# Traditional views for disiplin management
@login_required
def disiplin_list(request):
    disiplins = Disiplin.objects.all().order_by('disiplin')
    return render(request, 'wad/disiplin_list.html', {'disiplins': disiplins})

@login_required
def disiplin_tambah(request):
    if request.method == 'POST':
        disiplin = request.POST.get('disiplin')
        if disiplin:
            Disiplin.objects.create(disiplin=disiplin)
            messages.success(request, 'Disiplin berjaya ditambah')
            return redirect('wad:disiplin-list')
    return render(request, 'wad/disiplin_form.html')

@login_required
def disiplin_update(request, id):
    disiplin = get_object_or_404(Disiplin, id=id)
    if request.method == 'POST':
        disiplin.disiplin = request.POST.get('disiplin', disiplin.disiplin)
        disiplin.save()
        messages.success(request, 'Disiplin berjaya dikemaskini')
        return redirect('wad:disiplin-list')
    return render(request, 'wad/disiplin_form.html', {'disiplin': disiplin})

@login_required
def disiplin_delete(request, id):
    disiplin = get_object_or_404(Disiplin, id=id)
    if request.method == 'POST':
        disiplin.delete()
        messages.success(request, 'Disiplin berjaya dipadam')
    return redirect('wad:disiplin-list')