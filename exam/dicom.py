import requests

from exam.models import PacsExam, Exam, Pemeriksaan

url = 'http://localhost:8042/tools/find'


# curl --request POST --url http://localhost:8042/tools/find   --data '{
#        "Level":"Study","Expand":true,"Limit":101,"Query":{"StudyDate":"","AccessionNumber":"1477"}}'
def get_dicom(noxray):
    exam = Pemeriksaan.objects.get(no_xray=noxray)
    try:
        pacsitem = PacsExam.objects.get(exam=exam)
        data = {
            'orthanc_id': pacsitem.orthanc_id,
            'study_id': pacsitem.study_id,
            'study_instance': pacsitem.study_instance
        }
    except PacsExam.DoesNotExist:
        predataa = {
            "Level": "Study",
            "Expand": True,
            "Limit": 101,
            "Query": {"StudyDate": "", "AccessionNumber": str(noxray)}
        }
        r = requests.post(url, json=predataa)
        response = r.json()
        if response:
            data = {
                'orthanc_id': response[0]['ID'],
                'study_id': response[0]['MainDicomTags']['StudyID'],
                'study_instance': response[0]['MainDicomTags']['StudyInstanceUID']
            }
            PacsExam.objects.create(exam=exam, orthanc_id=data['orthanc_id'],
                                    study_id=data['study_id'], study_instance=data['study_instance'])
        else:
            return 'Tiada Data'
    return data
