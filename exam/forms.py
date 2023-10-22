from crispy_forms.bootstrap import Tab, TabHolder, InlineRadios
from crispy_forms.helper import FormHelper
from crispy_forms.layout import (
    Layout,
    Row,
    Column,
    HTML, Field, Submit
)
from django import forms
from django.urls import reverse
from django.utils import timezone

from pesakit.models import jantina_list, bangsa_list
from .models import Pemeriksaan, Daftar, Region, Exam


class iRadio(Field):
    template = 'custom-form/iradio.html'


class BcsForm(forms.ModelForm):
    jantina = forms.ChoiceField(choices=jantina_list, initial='L', widget=forms.RadioSelect)
    lmp = forms.DateField(label='LMP', required=False)
    bangsa = forms.ChoiceField(choices=bangsa_list, widget=forms.RadioSelect, initial='Melayu')
    umur = forms.CharField(max_length=10)
    nama = forms.CharField(max_length=50)
    nric = forms.CharField(label='NRIC / Passport', max_length=50)
    mrn = forms.CharField(label='MRN', max_length=10, required=False)

    class Meta:
        model = Daftar
        fields = (
            "tarikh",
            "rujukan",
            "pemohon",
            "dcatatan",
            'no_resit',
            'lmp',
            'ambulatori',
            'filem',
            'cd',
            'status',
            'performed',
            'jxr'
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.layout = Layout(
            Row(
                Column("tarikh", css_class="form-group col-md-4 mb-0"),
                Column(
                    Field("mrn", hx_get=f"{reverse('bcs:checkam')}", hx_trigger="change", hx_target="#mrnstatus",
                          hx_include="[name='mrn']"), css_class="form-group col-md-4 mb-0"
                ),
                Column(
                    Field("nric", hx_get=f"{reverse('bcs:checkam')}", hx_trigger="change", hx_target="#mrnstatus",
                          hx_include="[name='nric']"), css_class="form-group col-md-4 mb-0"
                ),
                css_class="form-row",
            ),
            Row(
                Column("no_resit", css_class="form-group col-md-4 mb-0"),
                Column("nama", css_class="form-group col-md-4 mb-0"),
                Column(
                    InlineRadios("bangsa"), css_class="form-group col-md-4 mb-0"),
                css_class="form-row",
            ),
            Row(
                Column("umur", css_class="form-group col-md-4 mb-0"),
                Column("lmp", css_class="form-group col-md-4 mb-0"),
                Column(InlineRadios("jantina"),
                css_class="form-group col-md-4 mb-0",
        ),
        css_class = "form-row",
        ),
        Row(
            Column("ambulatori", css_class="form-group col-md-4 mb-0"),
            Column("pemohon", css_class="form-group col-md-4 mb-0"),
            Column("rujukan", css_class="form-group col-md-4 mb-0"),
            css_class="form-row",
        ),

    HTML('<hr>'),
    Row(
        Column("filem", css_class="form-group col-md-4 mb-0"),
        Column("cd", css_class="form-group col-md-4 mb-0"),
        Column("status", css_class="form-group col-md-4 mb-0"),
        css_class="form-row",
    ),
    Row(
        Column("jxr", css_class="form-group col-md-4 mb-0"),
        Column("performed", css_class="form-group col-md-4 mb-0"),
        Column("dcatatan", css_class="form-group col-md-4 mb-0"),
        css_class="form-row",
    ),


HTML(
    "<script>$(function(){$('#id_rujukan').select2();$('#id_tarikh').flatpickr({enableTime: true,dateFormat: 'Y-m-d H:i',locale: 'ms'});});</script>"
),
# $('#id_mrn').inputmask('\\\AM99999999');
# FormActions(
#     Button("submit", "Hantar", css_class="btn btn-outline-primary rounded"),
#     Button(
#         "cancel",
#         "Kembali",
#         css_class="btn btn-outline-secondary rounded",
#         css_id="kensel",
#     ),
#     css_class="modal-footer",
# ),
)
# self.fields['mrn'].attrs.update('hx_get="/bcs/checkam" hx_include="[name=\"mrn\"]"')


class DaftarForm(forms.ModelForm):
    # exam = forms.ModelChoiceField(label="Pemeriksaan", queryset=Exam.objects.all(), widget=forms.CharField())

    class Meta:
        model = Pemeriksaan
        fields = ("no_xray", "exam", "laterality")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.layout = Layout(
            Row(
                Column("no_xray", css_class="form-group col-md-4 mb-0"),
                Column("exam", css_class="form-group col-md-4 mb-0"),
                Column("laterality", css_class="form-group col-md-4 mb-0"),

            ),
            #         HTML(
            #             "<script>$('#id_exam').select2({minimumInputLength: 3,ajax: {url: '/bcs/api/exam',dataType: 'json'}});</script>")
        )
        self.fields["no_xray"].disabled = True


class KomenForm(forms.ModelForm):
    dcatatan = forms.CharField(widget=forms.Textarea, required=False, label="Catatan")

    class Meta:
        model = Daftar
        fields = (
            "id",
            "dcatatan",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        # self.fields["id"].widget = forms.HiddenInput()


class RegionForm(forms.ModelForm):
    class Meta:
        model = Region
        fields = ('jenis', 'bahagian',)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.add_input(Submit('submit', 'Hantar', css_class='rounded pull-right'))


class ExamForm(forms.ModelForm):
    class Meta:
        model = Exam
        fields = ['exam', 'exam_code', 'part', 'statistik', 'modaliti', 'catatan', 'contrast']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.layout = Layout(
            Row(
                Column("modaliti", css_class="form-group col-md-6 mb-0"),
                Column("part", css_class="form-group col-md-6 mb-0"),
            ),
            Row(
                Column("statistik", css_class="form-group col-md-6 mb-0"),
                Column("exam_code", css_class="form-group col-md-6 mb-0"),
            ),
            Row(
                Column("exam", css_class="form-group col-md-10 mb-0"),
                Column("contrast", css_class="form-group col-md-2 mb-0"),
            ),
            Row(
                Column("catatan", css_class="form-group col-md-12 mb-0"),
            )
        )
        self.helper.add_input(Submit('submit', 'Hantar', css_class='rounded pull-right'))
        self.helper.form_id = 'configexam'
