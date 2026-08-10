"""Generate an indexed contact sheet for the Kenney city tiles.

Kenney ships tiles as cityTiles_NNN.png with no semantic names, so the only way
to know which one is a pavement and which is a kerb is to look at them next to
their filenames. This writes a page that does that; open it and read off the
numbers you need.

Usage:  python tools/make_contact_sheet.py
"""

import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "kenney-city"
OUT = ROOT / "tools" / "contact-sheet.html"

CSS = """
body { background:#2c6fb5; color:#fff; font:12px system-ui, sans-serif; margin:0; padding:16px; }
h2 { font-size:14px; margin:20px 0 8px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:6px; }
.cell { background:rgba(0,0,0,.18); border-radius:4px; padding:4px; text-align:center; }
.cell img { display:block; width:100%; height:auto; image-rendering:auto; }
.cell span { display:block; margin-top:2px; font-variant-numeric:tabular-nums; font-size:11px; }
"""


def section(title, folder, prefix):
    files = sorted(folder.glob("*.png"))
    cells = []
    for path in files:
        # Just the numeric part — that is what gets referenced in code.
        label = path.stem.replace(prefix, "")
        rel = f"../assets/kenney-city/{folder.name}/{path.name}"
        cells.append(f'<div class="cell"><img src="{rel}" alt="{label}"><span>{label}</span></div>')
    return f"<h2>{title} ({len(files)})</h2>\n<div class=\"grid\">\n" + "\n".join(cells) + "\n</div>"


html = [
    "<!doctype html><html><head><meta charset='utf-8'>",
    "<title>Kenney city tiles</title>",
    f"<style>{CSS}</style></head><body>",
    section("Tiles", ASSETS / "tiles", "cityTiles_"),
    section("Details", ASSETS / "details", "cityDetails_"),
    "</body></html>",
]

OUT.write_text("\n".join(html), encoding="utf-8")
print(f"wrote {OUT}")
