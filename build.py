# Builds public/index.html from ../bento/index.html (single source) by injecting the Netlify config.
import re, pathlib, datetime, zoneinfo
# The version shown under Mer is the build time in Stockholm, e.g. 2026-11-23 11.20
VERSION = datetime.datetime.now(zoneinfo.ZoneInfo('Europe/Stockholm')).strftime('%Y-%m-%d %H.%M')
src = pathlib.Path('source/artifact-index.html').read_text()
cfg = '''<script src="/vendor/supabase.js"></script>
<script>window.BENTO_CONFIG={supabaseUrl:'https://abkjjgegtryxwtuyuife.supabase.co',supabaseKey:'sb_publishable_rIG3-FqfPFYaqXl57yEB1A_qtKWGJYp'};window.BENTO_VERSION='__VERSION__';</script>
<script>
'''
assert src.count('<script>\n(() => {') == 1
out = src.replace('<script>\n(() => {', cfg + '(() => {', 1)
out = out.replace('<link rel="manifest" href="manifest.webmanifest">', '<link rel="manifest" href="/manifest.webmanifest">')
out = out.replace('<link rel="icon" href="icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="icon.svg">', '<link rel="icon" href="/icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="/icon-192.png">')
out = out.replace('href="fonts/', 'href="/fonts/').replace('url("fonts/', 'url("/fonts/').replace("sc.src = 'vendor/jsqr.js'", "sc.src = '/vendor/jsqr.js'")
out = out.replace('__VERSION__', VERSION)
assert 'fonts.googleapis' not in out and 'cdnjs' not in out
pathlib.Path('public/index.html').write_text(out)
print('built', len(out), 'version', VERSION)
