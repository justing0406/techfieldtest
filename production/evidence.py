"""Create and verify a synthetic PDF experiment. No private data is used."""
import argparse
import json
from pathlib import Path
import fitz
from reportlab.pdfgen import canvas
from pypdf import PdfReader


def produce(work: Path):
    assets = work / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    original = assets / 'original.pdf'
    c = canvas.Canvas(str(original), pagesize=(600, 650))
    c.setTitle('TechFieldTest synthetic PDF experiment')
    c.setFillColorRGB(.055, .075, .12)
    c.setFont('Helvetica-Bold', 15)
    c.drawString(44, 606, 'TECHFIELDTEST / TEST 001')
    c.setFillColorRGB(.4, .44, .5)
    c.setFont('Helvetica', 12)
    c.drawString(44, 578, 'FAKE DATA. REAL PDF TEST.')
    c.setFillColorRGB(.055, .075, .12)
    c.setFont('Helvetica-Bold', 36)
    c.drawString(44, 505, 'CONFIDENTIAL')
    c.setStrokeColorRGB(.85, .88, .9)
    c.line(44, 478, 556, 478)
    c.setFont('Helvetica', 18)
    c.drawString(44, 423, 'DEMO ACCESS PIN')
    c.setFont('Helvetica-Bold', 70)
    c.drawString(44, 324, '4827')
    c.setFillColorRGB(.4, .44, .5)
    c.setFont('Helvetica', 17)
    c.drawString(44, 234, 'Only the PIN is being tested.')
    c.drawString(44, 202, 'All names and numbers are fictional.')
    c.setFont('Helvetica', 13)
    c.drawString(44, 50, 'No real credentials or personal information.')
    c.save()

    doc = fitz.open(original)
    target = doc[0].search_for('4827')[0] + (-8, -3, 8, 3)
    doc[0].draw_rect(target, color=(0, 0, 0), fill=(0, 0, 0), overlay=True)
    doc.save(assets / 'overlay.pdf', garbage=4, deflate=True)
    doc.close()

    doc = fitz.open(original)
    doc[0].add_redact_annot(target, fill=(0, 0, 0))
    doc[0].apply_redactions()
    doc.save(assets / 'redacted.pdf', garbage=4, deflate=True)
    doc.close()

    results = {}
    for variant in ['original', 'overlay', 'redacted']:
        pdf = assets / f'{variant}.pdf'
        with fitz.open(pdf) as doc:
            mupdf_text = doc[0].get_text()
            doc[0].get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False).save(assets / f'{variant}.png')
        pypdf_text = PdfReader(pdf).pages[0].extract_text()
        (assets / f'{variant}-extracted.txt').write_text(mupdf_text)
        results[variant] = {'pinFoundByMuPDF': '4827' in mupdf_text,
                            'pinFoundByPyPDF': '4827' in pypdf_text,
                            'extractedText': mupdf_text}
    assert results['overlay']['pinFoundByMuPDF'] and results['overlay']['pinFoundByPyPDF']
    assert not results['redacted']['pinFoundByMuPDF'] and not results['redacted']['pinFoundByPyPDF']
    (work / 'evidence.json').write_text(json.dumps(results, indent=2))
    print(json.dumps({k: {n:v for n,v in item.items() if n != 'extractedText'} for k,item in results.items()}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--work', type=Path, required=True)
    produce(parser.parse_args().work)
