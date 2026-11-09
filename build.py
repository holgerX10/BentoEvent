# Builds public/index.html from ../bento/index.html (single source) by injecting the Netlify config.
import re, pathlib
src = pathlib.Path('source/artifact-index.html').read_text()
cfg = '''<script src="/vendor/supabase.js"></script>
<script>window.BENTO_CONFIG={supabaseUrl:'https://abkjjgegtryxwtuyuife.supabase.co',supabaseKey:'sb_publishable_rIG3-FqfPFYaqXl57yEB1A_qtKWGJYp'};</script>
<script>
'''
assert src.count('<script>\n(() => {') == 1
out = src.replace('<script>\n(() => {', cfg + '(() => {', 1)
out = out.replace('<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="/manifest.webmanifest">')
out = out.replace('<link rel="icon" href="icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="icon.svg">', '<link rel="icon" href="/icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="/icon-192.png">')
pathlib.Path('public/index.html').write_text(out)
print('built', len(out))
