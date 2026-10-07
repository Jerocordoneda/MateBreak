"""Verified originals -> temporary static WebP; never connects to Cloud.

Animated originals remain intact; Staging uses their first original frame.
"""
import hashlib, io, json, pathlib, sys
from PIL import Image, ImageOps

root = pathlib.Path(__file__).resolve().parent.parent
source = pathlib.Path(sys.argv[1]).resolve()
metadata = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding='utf-8'))['assets']
output = root / 'src/assets/catalog-staging'
output.mkdir(parents=True, exist_ok=True)
entries = []
for asset in metadata:
    name = pathlib.PurePosixPath(asset['storage_path']).name
    raw = (source / name).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == asset['sha256']
    assert len(raw) == asset['bytes']
    with Image.open(io.BytesIO(raw)) as original:
        animated = getattr(original, 'n_frames', 1) > 1
        original.seek(0)
        image = ImageOps.exif_transpose(original).convert('RGBA' if original.mode in ('RGBA', 'LA', 'P') else 'RGB')
        image.thumbnail((1200, 1200))
        encoded = io.BytesIO()
        image.save(encoded, format='WEBP', quality=80, method=4)
        body = encoded.getvalue()
        digest = hashlib.sha256(body).hexdigest()
        (output / (digest + '.webp')).write_bytes(body)
        entries.append({'sourcePath': asset['storage_path'], 'sourceSha256': asset['sha256'], 'path': '/src/assets/catalog-staging/' + digest + '.webp', 'sha256': digest, 'bytes': len(body), 'width': image.width, 'height': image.height, 'poster': animated})
assert len(entries) == 610
manifest = {'strategy': 'staging-static-webp-v1', 'entries': entries}
(output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
total = sum(p.stat().st_size for p in output.iterdir())
assert total < 80_000_000, 'Staging image budget exceeded; do not deploy'
print(json.dumps({'sources': len(entries), 'uniqueWebp': len(set(e['sha256'] for e in entries)), 'bytes': total, 'posters': sum(e['poster'] for e in entries)}))
