"""Build the standalone web app (index.html) from the EduScan source page.

The source page is the same file published inside Claude. It starts with <title>, <meta>, <link> and
<script src> lines, then styles, markup and the app script. This wraps it in a full HTML document and adds
what a stand-alone install needs: the [hidden] rule Claude's frame normally provides, the web-app manifest,
icons, the service worker and an install button.

    python3 build.py            (reads src/eduscan.html)
"""
import re
import sys

src = open(sys.argv[1] if len(sys.argv) > 1 else 'src/eduscan.html', encoding='utf8').read()
lines = src.split('\n')

head_lines, i = [], 0
while i < len(lines) and re.match(r'\s*<(title|meta|link|script src)', lines[i]):
    if 'claude:' not in lines[i]:
        head_lines.append(lines[i])
    i += 1
body = '\n'.join(lines[i:])

HEAD = '''<!doctype html>
<html lang="mn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#2b1c5e">
<meta name="description" content="Шалгалтын хариултын хуудас хэвлэх, камераар уншуулж дүгнэх, тайлан гаргах багшийн апп.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="EduScan">
<style>
html { box-sizing: border-box; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; }
img { max-width: 100%; }
[hidden]:not([hidden=until-found i]) { display: none !important; }
#installBtn { position: fixed; right: max(16px, env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 70;
  display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 999px; padding: 12px 18px; font: 600 14.5px "Golos Text", system-ui, sans-serif;
  color: #fff; background: linear-gradient(135deg, #4f6bff, #8b5cf6); box-shadow: 0 8px 24px rgba(79,107,255,0.4); cursor: pointer; }
</style>
'''

TAIL = '''
<button id="installBtn" hidden aria-label="EduScan-ийг апп болгон суулгах">＋ Апп болгон суулгах</button>
<script>
// offline cache + "add to home screen"
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; document.getElementById('installBtn').hidden = false; });
window.addEventListener('appinstalled', () => { installEvt = null; document.getElementById('installBtn').hidden = true; });
document.getElementById('installBtn').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch {}
  installEvt = null; document.getElementById('installBtn').hidden = true;
});
</script>
</body>
</html>
'''

out = HEAD + '\n'.join(head_lines) + '\n</head>\n<body>\n' + body.strip() + '\n' + TAIL
open('index.html', 'w', encoding='utf8').write(out)
print('index.html', len(out), 'bytes;', len(head_lines), 'head lines moved')
