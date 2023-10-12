from django.contrib.auth.decorators import login_required
from django.http import JsonResponse

from exam.models import Modaliti, Exam
from itertools import groupby


@login_required
def modalitiApi(request):
    try:
        search = request.GET['q']
        modal = Modaliti.objects.filter(nama__icontains=search).values('id','nama')
    except:
        modal = Modaliti.objects.all().values('id', 'nama')
    senarai = []
    senarai.append({'id':'','text': 'Semua Modaliti'})
    for a in modal:
        senarai.append({'id': a['id'], 'text': a['nama']})
    return JsonResponse({'results': senarai}, safe=False)


@login_required
def examlistApi(request):
    try:
        search = request.GET['q']
        elist = list(Exam.objects.filter(exam__icontains=search).select_related('modaliti').values_list('id', 'exam', 'modaliti__nama'))
    except:
        elist = list(Exam.objects.all().select_related('modaliti').values_list('id', 'exam', 'modaliti__nama'))
    tlist = []
    for k, v in groupby(elist, key=lambda x: x[2]):
        tlist.append({'text': k, 'children': list({'id': int(i[0]), 'text': i[1]} for i in list(v))})
    return JsonResponse({'results': tlist}, safe=False)

