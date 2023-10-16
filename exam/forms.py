from crispy_forms.helper import FormHelper
from crispy_forms.layout import (
    Layout,
    Row,
    Column,
    HTML, Field, Submit,
)
from django import forms

from .models import Pemeriksaan, Daftar, Region, Exam


class BcsForm(forms.ModelForm):
    class Meta:
        model = Daftar
        fields = (
            "tarikh",
            "pesakit",
            "rujukan",
            "pemohon",
            "dcatatan",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.layout = Layout(
            Row(
                Column("tarikh", css_class="form-group col-md-6 mb-0"),
                Column(
                    Field("mrn", hx_get="/bcs/checkam", hx_trigger="change", hx_target="#mrnstatus",
                          hx_include="[name='mrn']"), css_class="form-group col-md-6 mb-0"
                ),
                css_class="form-row",
            ),
            Row(
                Column("nric", css_class="form-group col-md-6 mb-0"),
                Column("nama", css_class="form-group col-md-6 mb-0"),
                css_class="form-row",
            ),
            Row(
                Column("ward", css_class="form-group col-md-6 mb-0"),
                Column("pemohon", css_class="form-group col-md-6 mb-0"),
                css_class="form-row",
            ),
            Row(
                Column("mo", css_class="form-group col-md-6 mb-0"),
                Column("radiologist", css_class="form-group col-md-6 mb-0"),
                css_class="form-row",
            ),
            "catatan",
            HTML(
                "<script>$(function(){$('#id_ward').select2();$('#id_tarikh').flatpickr({enableTime: true,dateFormat: 'Y-m-d H:i',locale: 'ms'});});</script>"
            ),  # $('#id_mrn').inputmask('\\\AM99999999');
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
                Column("nobcs", css_class="form-group col-md-2 mb-0"),
                Column("exam", css_class="form-group col-md-4 mb-0"),
                Column("laterality", css_class="form-group col-md-1 mb-0"),
                Column("dcatatan", css_class="form-group col-md-4 mb-0"),

            ),
            HTML(
                "<script>$('#id_exam').select2({minimumInputLength: 3,ajax: {url: '/bcs/api/exam',dataType: 'json'}});</script>")
        )
        self.fields["nobcs"].disabled = True


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
        fields = ('jenis','bahagian',)

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
