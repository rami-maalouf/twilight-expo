# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools>=4.50"]
# ///
# builds the filled material symbols font android uses for sf ".fill" names.
# expo-symbols only ships the outlined (FILL 0) material symbols, so a solid
# sf glyph like heart.fill renders as an outline. this pins google's variable
# material symbols outlined font (apache 2.0) at FILL 1 / wght 400 / GRAD 0 /
# opsz 24 and subsets it to the glyphs the app maps from ".fill" names in
# src/components/common/native-symbol-map.ts, then writes the font and a
# name -> codepoint table next to the symbol component.
# usage: uv run scripts/generate-filled-symbols.py \
#   "<path to MaterialSymbolsOutlined[FILL,GRAD,opsz,wght].ttf>"
# (from https://github.com/google/material-design-icons/tree/master/variablefont)
import json
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / "src/components/common/native-symbol-map.ts"
FONT_OUT = ROOT / "assets/fonts/MaterialSymbolsFilled.ttf"
TABLE_OUT = ROOT / "src/components/common/filled-symbols.json"


def filled_android_names() -> list[str]:
    source = MAP.read_text()
    pairs = re.findall(r"'([a-z0-9.]+)':\s*'([a-z0-9_]+)'", source)
    return sorted({android for sf, android in pairs if sf.endswith(".fill")})


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__ or "usage: generate-filled-symbols.py <variable font>")
    names = filled_android_names()
    font = TTFont(sys.argv[1])
    by_glyph = {glyph: code for code, glyph in font.getBestCmap().items()}
    table: dict[str, int] = {}
    for name in names:
        code = by_glyph.get(name)
        if code is None:
            sys.exit(f"no glyph named {name} in the variable font")
        table[name] = code
    static = instancer.instantiateVariableFont(font, {"FILL": 1, "wght": 400, "GRAD": 0, "opsz": 24})
    options = subset.Options()
    options.layout_features = []
    options.name_IDs = ["*"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(table.values()))
    subsetter.subset(static)
    FONT_OUT.parent.mkdir(parents=True, exist_ok=True)
    static.save(FONT_OUT)
    TABLE_OUT.write_text(json.dumps(table, indent=2, sort_keys=True) + "\n")
    print(f"{len(table)} glyphs -> {FONT_OUT.relative_to(ROOT)} ({FONT_OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
