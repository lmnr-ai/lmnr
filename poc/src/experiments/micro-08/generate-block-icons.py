"""Extract Micro07's unchanged icon geometry, without repainting Micro08's colors."""
from pathlib import Path
import xml.etree.ElementTree as ET

PUBLIC = Path(__file__).resolve().parents[3] / 'public'
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
for name, source, path_id in [('hex', 'icon-a-square.svg', 'Subtract'), ('chat', 'icon-d-square.svg', 'Vector')]:
    source_path = PUBLIC / 'micro-07' / source
    original = ET.parse(source_path).getroot()
    path = original.find(f'.//{{{NS}}}path[@id="{path_id}"]')
    assert path is not None
    root = ET.Element(f'{{{NS}}}svg', {'viewBox': original.attrib['viewBox'], 'fill': 'none'})
    root.append(ET.Comment(f' Derived from micro-07/{source}; only background/gradient removed. '))
    root.append(path)
    ET.ElementTree(root).write(PUBLIC / 'micro-08' / f'block-{name}.svg', encoding='unicode')
