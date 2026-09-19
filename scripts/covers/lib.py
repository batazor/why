"""
Акварельные обложки разборов: общие фильтры, палитра и кисти.

Обложка — SVG в public/covers/. Скрипт не запускается при сборке: картинки
рисуются один раз, правятся руками и лежат в репозитории как обычные файлы.
Генератор нужен, чтобы стиль был один на все обложки: те же фильтры, те же
пастельные цвета, та же толщина кисти.

    python3 scripts/covers/build.py
"""

# Пастель, матовая: без насыщенных тонов, цвет должен лечь на бумагу карточки.
SAGE = '#bcd4b4'
SAGE_D = '#a9c7a1'
SKY = '#b9d3e6'
SKY_D = '#9dbfd8'
BUTTER = '#f4dca8'
CREAM = '#f7eacb'
PEACH = '#f2c9a9'
ROSE = '#e8b7b7'
LAVENDER = '#cdbfe0'
LILAC = '#d9cde8'
MINT = '#cfe4de'
TEAL = '#9fc9bd'

# Кисть: приглушённые линии в тон пятнам.
INK = '#8792a3'
INK_SAGE = '#6f8a74'
INK_WARM = '#9a8b7a'
INK_LAV = '#8a7ea3'
INK_ROSE = '#b77f7f'

DEFS = '''  <defs>
    <!-- «Мокрый» край, зерно пигмента и тёмная кайма высохшей капли. -->
    <filter id="wash" filterUnits="userSpaceOnUse" x="-20" y="-20" width="680" height="340">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="warp" />
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="9" xChannelSelector="R" yChannelSelector="G" result="bled" />
      <feGaussianBlur in="bled" stdDeviation="0.8" result="soft" />
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="grain" />
      <feColorMatrix in="grain" type="matrix"
        values="0 0 0 0 0.6  0 0 0 0 0.57  0 0 0 0 0.55  0 0 0 -0.45 0.5" result="grainTint" />
      <feComposite in="grainTint" in2="soft" operator="in" result="grainIn" />
      <feBlend in="soft" in2="grainIn" mode="multiply" result="granulated" />
      <feMorphology in="bled" operator="erode" radius="2.2" result="inner" />
      <feComposite in="bled" in2="inner" operator="out" result="rim" />
      <feGaussianBlur in="rim" stdDeviation="0.9" result="rimSoft" />
      <feColorMatrix in="rimSoft" type="matrix"
        values="0.8 0 0 0 0  0 0.8 0 0 0  0 0 0.8 0 0  0 0 0 0.55 0" result="rimDark" />
      <feMerge>
        <feMergeNode in="granulated" />
        <feMergeNode in="rimDark" />
      </feMerge>
    </filter>

    <!-- Линия кистью: неровная, чуть рваная. Область фильтра — весь холст:
         у горизонтальной линии высота рамки нулевая, и фильтр по рамке
         стирал её целиком. -->
    <filter id="brush" filterUnits="userSpaceOnUse" x="-20" y="-20" width="680" height="340">
      <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="11" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="d" />
      <feGaussianBlur in="d" stdDeviation="0.35" />
    </filter>

    <!-- Фоновые размывы: самые мягкие пятна, почти без края. -->
    <filter id="bloom" filterUnits="userSpaceOnUse" x="-20" y="-20" width="680" height="340">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="21" result="w" />
      <feDisplacementMap in="SourceGraphic" in2="w" scale="22" xChannelSelector="R" yChannelSelector="G" result="d" />
      <feGaussianBlur in="d" stdDeviation="6" />
    </filter>
  </defs>
'''


def svg(comment: str, body: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 300" width="640" height="300">\n'
        f'  <!--\n{comment}\n  -->\n{DEFS}{body}</svg>\n'
    )


# ---------- слои ----------

def bloom(*spots) -> str:
    """Фоновые размывы: (cx, cy, rx, ry, цвет)."""
    items = ''.join(
        f'    <ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{c}" />\n' for x, y, rx, ry, c in spots
    )
    return f'  <g filter="url(#bloom)" opacity="0.5">\n{items}  </g>\n'


def wash(*shapes, opacity=None) -> str:
    """Заливки: каждая фигура — готовый SVG-элемент."""
    op = f' opacity="{opacity}"' if opacity else ''
    return f'  <g filter="url(#wash)"{op}>\n' + ''.join(f'    {s}\n' for s in shapes) + '  </g>\n'


def brush(*paths, color=INK, width=2.2, opacity=0.7, dash=None) -> str:
    """Линии кистью: пути `d` или готовые элементы."""
    d = f' stroke-dasharray="{dash}"' if dash else ''
    items = ''.join(
        f'    {p}\n' if p.lstrip().startswith('<') else f'    <path d="{p}" />\n' for p in paths
    )
    return (
        f'  <g filter="url(#brush)" stroke="{color}" stroke-width="{width}" stroke-linecap="round" '
        f'stroke-linejoin="round" fill="none" opacity="{opacity}"{d}>\n{items}  </g>\n'
    )


# ---------- фигуры ----------

def rect(x, y, w, h, fill, r=8, op=0.85, rot=None):
    t = f' transform="rotate({rot} {x + w / 2} {y + h / 2})"' if rot else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" opacity="{op}"{t} />'


def circle(cx, cy, r, fill, op=0.85):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" opacity="{op}" />'


def path(d, fill, op=0.85):
    return f'<path d="{d}" fill="{fill}" opacity="{op}" />'


def cylinder(x, y, w, h, fill, top):
    """База: цилиндр с крышкой."""
    ry = w * 0.16
    return [
        path(f'M{x} {y} v{h} a{w / 2} {ry} 0 0 0 {w} 0 v{-h} z', fill, 0.85),
        f'<ellipse cx="{x + w / 2}" cy="{y}" rx="{w / 2}" ry="{ry}" fill="{top}" opacity="0.95" />',
    ]


def envelope(x, y, w, h, fill=CREAM, flap=BUTTER):
    return [
        rect(x, y, w, h, fill, r=4, op=0.95),
        path(f'M{x} {y} l{w / 2} {h * 0.55} l{w / 2} {-h * 0.55} z', flap, 0.85),
    ]


def gear_marks(cx, cy, r):
    """Зубцы шестерёнки — кистью вокруг круга."""
    import math

    out = []
    for i in range(8):
        a = i * math.pi / 4
        x1, y1 = cx + math.cos(a) * (r + 3), cy + math.sin(a) * (r + 3)
        x2, y2 = cx + math.cos(a) * (r + 9), cy + math.sin(a) * (r + 9)
        out.append(f'M{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}')
    return out


def arrow(x1, y1, x2, y2, bend=0):
    """Стрелка кистью: кривая и наконечник. `bend` — прогиб в пикселях."""
    import math

    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy) or 1
    nx, ny = -dy / length, dx / length
    cx, cy = mx + nx * bend, my + ny * bend
    # Наконечник — по касательной в конце кривой.
    tx, ty = x2 - cx, y2 - cy
    tl = math.hypot(tx, ty) or 1
    ux, uy = tx / tl, ty / tl
    a = math.radians(28)
    s = 9
    lx = x2 - s * (ux * math.cos(a) - uy * math.sin(a))
    ly = y2 - s * (uy * math.cos(a) + ux * math.sin(a))
    rx = x2 - s * (ux * math.cos(a) + uy * math.sin(a))
    ry = y2 - s * (uy * math.cos(a) - ux * math.sin(a))
    return [
        f'M{x1} {y1} Q{cx:.1f} {cy:.1f} {x2} {y2}',
        f'M{lx:.1f} {ly:.1f} L{x2} {y2} L{rx:.1f} {ry:.1f}',
    ]


def lines(x, y, widths, step=14):
    """Строки текста на листке."""
    return [f'M{x} {y + i * step} h{w}' for i, w in enumerate(widths)]


def splashes(*dots) -> str:
    """Брызги: (cx, cy, r, цвет)."""
    return wash(*[circle(x, y, r, c, 1) for x, y, r, c in dots], opacity=0.5)
