from copy import deepcopy
from hashlib import sha256
from pathlib import Path
import subprocess
import sys
from urllib.request import urlopen
import xml.etree.ElementTree as ET

from PIL import Image, ImageOps
from svgpathtools import parse_path


directory = Path(sys.argv[1]).resolve()
directory.mkdir(parents=True, exist_ok=True)
sources = [
    ('bluetooth', '0cc290ee-cd7e-4fce-993d-12d01b28164e', '689663709911f94a3218739550f9ad232493804f83ad1709351983fb241ed666'),
    ('control', '83f4d7c5-4244-48ce-ae13-cce2bdd9456e', '57714631d34734fe89cd2b63e3c4eb0f0310f58a6e22b5928bd24fc3e7202413'),
    ('display', '0311daae-2762-4818-8d47-a2d8d3e60ab4', '0fd5a1df4bce3d4515b5db11de024d9f639330eb20c367914aeb7c5990485c8c'),
    ('focus', '75b5187b-581a-44ed-b141-204c5cc58441', '7cd98fed18b4ff1deff833486cf5c5ae4f0b2b2fd33d0d5c011007dbf2bec37f'),
    ('media', '22fb066c-8d46-4ce5-a091-5fc830372507', '69fc3a6e82d07f5bba003461b8ccb75254f2f52f20e34fbed4eeca7f59bf1e3c'),
    ('mirroring', 'a27a667e-0f72-483d-818c-291e918dc063', '7265e0e4e12321f7fa4ec8431eadc23e29e4c2ad6db7da7973f6636bbd281556'),
    ('multitasking', '8e6f2b43-2721-4e52-a7e7-f9b23c2c05a8', '432f8880981115c12adc2a24a8d9a9c65db8a5060c9a5bd1cf3aaaccfcbe3102'),
    ('sharing', '8d1112ff-c160-4db2-a802-cc296fa92bc6', '51f20e690a19e178ce6cba7824732385da07a67b94665b3681645225b127e14a'),
    ('sound', '40d178fd-e148-424f-9e89-5ed2641d17b4', '90d2923604ef747675bee1d25cdfc36522ed807d997df2478c2b84afece92182'),
    ('wifi', '7f538d44-043b-41bb-984b-24a827919434', '004b4fdb53477d545fd3aac7d56cde1f6fad1631ed0085ef26466f5d3ca21791'),
]
svg_namespace = 'http://www.w3.org/2000/svg'
ET.register_namespace('', svg_namespace)


def save(tree, name):
    tree.write(directory / f'{name}-symbolic.svg', encoding='utf-8', xml_declaration=True)


for name, resource_id, checksum in sources:
    source = directory / f'{name}.png'
    if not source.exists():
        with urlopen(f'https://ipcdn-web.apple.com/assets/v2/web/{resource_id}', timeout=60) as response:
            source.write_bytes(response.read())
    assert sha256(source.read_bytes()).hexdigest() == checksum, f'资源校验失败：{name}'
    alpha = Image.open(source).convert('RGBA').getchannel('A')
    bounds = alpha.point(lambda value: 255 if value >= 128 else 0).getbbox()
    assert bounds, name
    alpha = alpha.crop(bounds)
    side = max(alpha.size)
    square = Image.new('L', (side, side))
    square.paste(alpha, ((side - alpha.width) // 2, (side - alpha.height) // 2))
    square = square.resize((side * 4, side * 4), Image.Resampling.LANCZOS)
    margin = max(4, round(side * 4 / 18))
    bitmap = ImageOps.expand(ImageOps.invert(square), border=margin, fill=255)
    bmp = directory / f'{name}.bmp'
    bitmap.save(bmp)
    svg = directory / f'{name}.svg'
    subprocess.run(['potrace', '--svg', '--turdsize', '0', '--opttolerance', '0.1',
                    '--unit', '100', '--output', str(svg), str(bmp)], check=True)
    tree = ET.parse(svg)
    root = tree.getroot()
    root.set('width', '100')
    root.set('height', '100')
    root.set('preserveAspectRatio', 'xMidYMid meet')
    for group in root.findall(f'{{{svg_namespace}}}g'):
        group.set('fill', '#2e3436')
    save(tree, name)
    if name != 'wifi':
        continue
    width = bitmap.width
    paths = root.findall(f'.//{{{svg_namespace}}}path')
    assert len(paths) == 3, 'Wi-Fi 必须包含两条圆弧和圆点'
    order = sorted(range(3), key=lambda index: -parse_path(paths[index].get('d')).bbox()[3])
    for state, bands in [('signal-none', 0), ('signal-weak', 1), ('signal-ok', 2),
                         ('signal-good', 3), ('signal-excellent', 3),
                         ('acquiring', 1), ('no-route', 3), ('disabled', 0)]:
        variant = deepcopy(tree)
        target = variant.getroot()
        variant_paths = target.findall(f'.//{{{svg_namespace}}}path')
        if bands < 3:
            for position, index in enumerate(order):
                variant_paths[index].set('opacity', '1' if position >= 3 - bands else '0.28')
        if state in ('disabled', 'no-route'):
            ET.SubElement(target, f'{{{svg_namespace}}}path', {
                'd': f'M {width * .18} {width * .16} L {width * .82} {width * .84}',
                'stroke': '#2e3436', 'stroke-width': str(width * .07),
                'stroke-linecap': 'round', 'fill': 'none'})
        save(variant, f'wifi-{state}')
print('图标构建与来源校验通过')
