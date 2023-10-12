
from django import forms

from wad.models import Ward, Disiplin
from crispy_forms.helper import FormHelper
from crispy_forms.layout import Layout, Column, Row, Field, Div


class WardForm(forms.ModelForm):

    class Meta:
        model = Ward
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super(WardForm, self).__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.form_tag = False
        self.helper.form_show_labels = False
        self.helper.layout = Layout(
                Field('wad', placeholder='Wad', wrapper_class='m-0'),
                Field('disiplin', placeholder='Disiplin', wrapper_class='m-0')
        )


class DispForm(forms.ModelForm):

    class Meta:
        model = Disiplin
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super(DispForm, self).__init__(*args, **kwargs)
        self.helper = FormHelper()
        self.helper.form_tag = False
        self.helper.form_show_labels = False

        self.helper.layout = Layout(
                Field('disiplin', placeholder='Disiplin', wrapper_class='m-0')
        )
