from crispy_forms.bootstrap import FormActions
from crispy_forms.helper import FormHelper
from crispy_forms.layout import (
    Layout,
    Row,
    Column,
    HTML, Field, Submit, Button, Div,
)
from django import forms
from django.contrib.auth import password_validation
from django.contrib.auth.forms import UserCreationForm, UserChangeForm, PasswordChangeForm
from .models import Staff


class StaffForm(UserCreationForm):
    password1 = forms.CharField(label='Kata Laluan', widget=forms.PasswordInput)
    password2 = forms.CharField(label='Ulang Kata Laluan', widget=forms.PasswordInput)

    class Meta:
        model = Staff
        fields = ('username', 'first_name', 'last_name', 'jawatan', 'password1', 'password2', 'komen',)

    def __init__(self, *args, **kwargs):
        super(StaffForm, self).__init__(*args, **kwargs)
        self.fields['username'].label = 'Username'
        self.fields['first_name'].label = 'Nama Staff'
        self.fields['last_name'].label = 'Nama Keluarga'
        self.helper = FormHelper()
        self.helper.layout = Layout(
            Div(
                Row(
                    Column("username", css_class="form-group col-md-6 mb-0"),
                    Column("jawatan", css_class="form-group col-md-6 mb-0"),
                    css_class="form-row",
                ),
                Row(
                    Column("first_name", css_class="form-group col-md-6 mb-0"),
                    Column("last_name", css_class="form-group col-md-6 mb-0"),
                    css_class="form-row",
                ),
                Row(
                    Column("password1", css_class="form-group col-md-6 mb-0"),
                    Column("password2", css_class="form-group col-md-6 mb-0"),
                    css_class="form-row",
                ),
                Row(
                    Column('komen', css_class='form-group col-md-12 mb-0'),
                ),
                css_class='modal-body'
            ),

            Div(
                Submit("submit", "Hantar", css_class="hantar rounded"),
                Button(
                    "cancel",
                    "Kembali",
                    data_dismiss="modal",
                    css_class="btn btn-secondary",
                    css_id="kensel",
                ),
                css_class="modal-footer",
            ),
        )


class StaffEdit(UserChangeForm):
    class Meta:
        model = Staff
        fields = ('username', 'first_name', 'last_name', 'jawatan', 'komen',)

    def __init__(self, *args, **kwargs):
        super(StaffEdit, self).__init__(*args, **kwargs)
        self.fields['username'].label = 'Username'
        self.fields['first_name'].label = 'Nama Staff'
        self.fields['last_name'].label = 'Nama Keluarga'
        self.helper = FormHelper()
        self.helper.layout = Layout(
            Div(
                Row(
                    Column("username", css_class="form-group col-md-6 mb-0"),
                    Column("jawatan", css_class="form-group col-md-6 mb-0"),
                    css_class="form-row",
                ),
                Row(
                    Column("first_name", css_class="form-group col-md-6 mb-0"),
                    Column("last_name", css_class="form-group col-md-6 mb-0"),
                    css_class="form-row"),
                Row(
                    Column('komen', css_class='form-group col-md-12 mb-0'),
                ), css_class='modal-body'
            ),
            Div(
                Submit("submit", "Hantar", css_class="hantar rounded"),
                Button(
                    "cancel",
                    "Kembali",
                    data_dismiss="modal",
                    css_class="btn btn-secondary",
                    css_id="kensel",
                ),
                css_class="modal-footer",
            ),
        )


class TukarPassForm(forms.Form):
    password = forms.CharField(strip=False, label='Kata Laluan Baru', widget=forms.PasswordInput(attrs={'autocomplete': 'new-password'}))

    def __init__(self, *args, **kwargs):
        super(TukarPassForm, self).__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.layout = Layout(
            Row(
                Column('password', css_class="form-group col-md-12 mb-0"),
            ),
            Div(
                Submit("submit", "Hantar", css_class="hantar rounded"),
                Button(
                    "cancel",
                    "Kembali",
                    data_dismiss="modal",
                    css_class="btn btn-secondary",
                    css_id="kensel",
                ),
                css_class="modal-footer",
            ),
        )


class StaffTukar(PasswordChangeForm):
    old_password = forms.CharField(label='Kata Laluan Lama',
                                   strip=False,
                                   widget=forms.PasswordInput(
                                       attrs={'autocomplete': 'new-password', 'autofocus': True,
                                              'class': 'form-control',
                                              'placeholder': 'Kata Laluan Lama'}),
                                   )
    new_password1 = forms.CharField(label='Kata Laluan Baru',
        widget=forms.PasswordInput(attrs = {'autocomplete': 'new-password', 'class': 'form-control', 'placeholder': 'Kata Laluan Baru'}),
        strip = False, help_text = password_validation.password_validators_help_text_html(),)
    new_password2 = forms.CharField(label='Ulang Kata Laluan Baru', strip=False, widget=forms.PasswordInput(
        attrs = {'autocomplete': 'new-password', 'class': 'form-control', 'placeholder': 'Ulang Kata Laluan Baru'}),
    )

    def __init__(self, *args, **kwargs):
        super(StaffTukar, self).__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.layout = Layout(
            Row(
                Column('old_password', css_class="form-group col-md-12 mb-0"),
                Column('new_password1', css_class="form-group col-md-12 mb-0"),
                Column('new_password2', css_class="form-group col-md-12 mb-0"),
            css_class='modal-body'),
            Div(
                Submit("submit", "Hantar", css_class="hantar rounded"),
                Button(
                    "cancel",
                    "Kembali",
                    data_dismiss="modal",
                    css_class="btn btn-secondary",
                    css_id="kensel",
                ),
                css_class="modal-footer",
            ),
        )
