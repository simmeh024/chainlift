"""Bundle Chainlift into a single self-contained HTML file.

The game normally ships as native ES modules with no build step, which is the
right shape for the real deployment. This script exists only to produce a
one-file build for places that cannot serve a directory — a preview link, an
offline copy, a bug report someone can just open.

It reads the REAL source files and strips module syntax rather than keeping a
second copy of the game, so the bundle cannot drift from what actually ships.

Usage:  python tools/bundle.py [output.html]
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Dependency order. Concatenation has no module resolver, so this is the one
# thing that must be maintained by hand when a new module is added.
MODULES = [
    "js/core/iso.js",
    "js/core/grid.js",
    "js/core/camera.js",
    "js/data/catalog.js",
    "js/sim/pathfinding.js",
    "js/sim/guests.js",
    "js/sim/park.js",
    "js/render/renderer.js",
    "js/ui/hud.js",
    "js/main.js",
]

# save.js talks to PHP, which a single file has no way to reach. Replaced with
# a localStorage-only shim so the bundle saves and loads for real rather than
# presenting buttons that quietly do nothing.
SAVE_SHIM = """
// --- bundled build: storage is local-only ---------------------------------
function savePark(park, slot = 'autosave') {
  saveLocal(park, slot);
  return Promise.reject(new Error('this build has no server'));
}
function loadPark(slot = 'autosave') {
  return Promise.reject(new Error('this build has no server'));
}
function saveLocal(park, slot = 'autosave') {
  localStorage.setItem(`chainlift:${slot}`, JSON.stringify(park.serialize()));
}
function loadLocal(slot = 'autosave') {
  const raw = localStorage.getItem(`chainlift:${slot}`);
  return raw ? JSON.parse(raw) : null;
}
"""

IMPORT_RE = re.compile(r"^\s*import\s[^;]*?;\s*$", re.MULTILINE | re.DOTALL)
EXPORT_LIST_RE = re.compile(r"^\s*export\s*\{[^}]*\}\s*;\s*$", re.MULTILINE)
EXPORT_KW_RE = re.compile(r"^(\s*)export\s+(?=const|let|var|function|class|async)", re.MULTILINE)


def strip_module_syntax(source: str) -> str:
    source = IMPORT_RE.sub("", source)
    source = EXPORT_LIST_RE.sub("", source)
    source = EXPORT_KW_RE.sub(r"\1", source)
    return source.strip()


def build() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css" / "chainlift.css").read_text(encoding="utf-8")

    parts = [SAVE_SHIM.strip()]
    for name in MODULES:
        path = ROOT / name
        body = strip_module_syntax(path.read_text(encoding="utf-8"))
        parts.append(f"// ===== {name} " + "=" * max(0, 60 - len(name)) + "\n" + body)
    script = "\n\n".join(parts)

    # Guard against a silent failure mode: if stripping ever leaves a bare
    # import or export behind, the bundle would load as a broken module and
    # look like a game bug instead of a build bug.
    for token in ("\nimport ", "\nexport "):
        if token in "\n" + script:
            raise SystemExit(f"bundle: module syntax survived stripping ({token.strip()})")

    html = html.replace(
        '<link rel="stylesheet" href="css/chainlift.css?v=1">',
        "<style>\n" + css + "\n</style>",
    )
    # Match whatever cache version index.html currently carries, so a version
    # bump does not silently stop the script tag being replaced and ship a
    # bundle whose game code is missing entirely.
    html, count = re.subn(
        r'<script type="module" src="js/main\.js\?v=\d+"></script>',
        lambda _: '<script type="module">\n' + script + "\n</script>",
        html,
    )
    if count != 1:
        raise SystemExit(f"bundle: expected 1 script tag to replace, found {count}")
    return html


if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "chainlift.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    result = build()
    out.write_text(result, encoding="utf-8")
    print(f"wrote {out} ({len(result):,} bytes)")
