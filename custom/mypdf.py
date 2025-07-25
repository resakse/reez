from reportlab.platypus import Table, TableStyle, Paragraph


def Bold(ayat):
    if ayat == None:
        ayat = ''
    return Paragraph(f'<b>{ayat}</b>')