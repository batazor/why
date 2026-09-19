"""
Обложки разборов. Каждая функция — сюжет одной обложки, по её «Проблеме».

Обложки скрейпинга и интеграционных событий нарисованы раньше и правились
руками — генератор их не трогает.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from lib import *  # noqa: E402,F403

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'covers')


def circuit_breaker():
    """Ретраи долбят упавший сервис; рубильник между ними разомкнут."""
    callers = []
    for i, y in enumerate((60, 130, 200)):
        callers += [rect(40, y, 70, 46, SKY, op=0.8)]
    hammer = []
    for y in (83, 153, 223):
        for k in range(3):
            hammer += arrow(118, y - 8 + k * 8, 250, 150 - 14 + k * 14, bend=(k - 1) * 10)
    return (
        bloom((90, 150, 90, 110, '#d3e3ee'), (330, 150, 80, 70, '#f3e8cc'), (520, 150, 110, 90, '#f3d6d6'))
        + wash(*callers)
        + brush(*hammer, color=INK, width=1.8, opacity=0.45)
        # Рубильник: основание, контакты и поднятый рычаг.
        + wash(rect(270, 170, 110, 26, BUTTER, op=0.9), circle(292, 164, 8, PEACH, 0.95), circle(358, 164, 8, PEACH, 0.95))
        + brush('M292 164 L336 104', color=INK_WARM, width=4, opacity=0.8)
        + wash(circle(338, 100, 9, SAGE_D, 0.95))
        + brush('M300 196 v20 M350 196 v20', color=INK_WARM, width=2, opacity=0.6)
        # Упавший сервис отдыхает: пластырь и «з-з».
        + wash(rect(450, 100, 140, 120, ROSE, op=0.75), rect(488, 140, 64, 20, CREAM, r=6, op=0.95, rot=-18))
        + brush('M510 146 v10 M520 144 v10 M530 142 v10', color=INK_ROSE, width=1.6, opacity=0.7)
        + brush('M560 80 h12 l-12 12 h12', 'M584 58 h9 l-9 9 h9', color=INK_ROSE, width=2, opacity=0.7)
        + brush(*arrow(384, 150, 440, 150), color=INK_SAGE, width=2.2, opacity=0.35, dash='5 8')
        + splashes((200, 50, 4, PEACH), (420, 250, 3, SKY), (610, 240, 3, ROSE))
    )


def discount_floor():
    """Две акции тянут цену ниже закупки; доказательство держит её на полу."""
    return (
        bloom((150, 150, 120, 90, '#f3e8cc'), (420, 170, 150, 80, '#f3d6d6'), (560, 90, 70, 60, '#d4e6dc'))
        # Ценник на верёвочке.
        + wash(path('M70 90 h120 l30 45 l-30 45 h-120 z', BUTTER, 0.85), circle(200, 135, 7, CREAM, 1))
        + brush(*lines(88, 118, [70, 50, 62], 18), color=INK_WARM, opacity=0.6)
        # Две акции-купона падают на цену.
        + wash(rect(270, 50, 90, 50, PEACH, op=0.85, rot=-12), rect(300, 96, 90, 50, LAVENDER, op=0.85, rot=9))
        + brush('M292 64 l40 -8 M300 78 l30 -6', 'M320 112 l40 6 M318 126 l30 5', color=INK_WARM, width=1.8, opacity=0.6)
        + brush('M285 70 l-6 -6 M345 58 l6 -6', color=INK_WARM, width=1.6, opacity=0.5)
        # Цена уезжает вниз, пол — пунктир.
        + brush(*arrow(420, 90, 440, 236, bend=-14), color=INK_ROSE, width=2.4, opacity=0.7)
        + brush('M240 218 H600', color=INK_ROSE, width=2.4, opacity=0.65, dash='10 8')
        # Доказательство: свиток с галочкой подпирает цену у пола.
        + wash(rect(480, 150, 110, 64, SAGE, op=0.85), path('M480 150 q-12 32 0 64 z', SAGE_D, 0.9))
        + brush('M506 182 l12 12 l26 -28', color=INK_SAGE, width=3, opacity=0.8)
        + splashes((250, 40, 3, BUTTER), (620, 140, 3, SAGE), (40, 230, 4, PEACH))
    )


def idempotency():
    """Таймаут, повтор: два одинаковых письма, и только ключ спасает от второго списания."""
    return (
        bloom((120, 150, 100, 90, '#d3e3ee'), (330, 140, 110, 80, '#f3e8cc'), (530, 160, 100, 90, '#d4e6dc'))
        # Клиент и его два одинаковых запроса.
        + wash(rect(40, 100, 90, 110, SKY, op=0.8))
        + brush('M60 130 h50 M60 150 h36', color=INK, opacity=0.6)
        + wash(*envelope(190, 88, 76, 50), *envelope(206, 150, 76, 50))
        # Песочные часы — ответ не дошёл.
        + brush('M150 74 h20 M150 110 h20 M152 74 q10 18 8 18 q-10 0 8 18', color=INK_WARM, width=2, opacity=0.6)
        # Ключ на обоих письмах.
        + wash(circle(252, 100, 7, SAGE_D, 0.95), circle(268, 162, 7, SAGE_D, 0.95))
        + brush('M259 100 h14 v5 M280 100 v4', 'M275 162 h14 v5 M296 162 v4', color=INK_SAGE, width=2, opacity=0.75)
        + brush(*arrow(300, 115, 380, 140), *arrow(310, 178, 380, 160), color=INK, width=2.2, opacity=0.55)
        # Сервер узнаёт ключ: второе письмо отскакивает.
        + wash(rect(390, 90, 110, 130, LAVENDER, op=0.8))
        + brush(*arrow(392, 196, 320, 236, bend=-20), color=INK_SAGE, width=2, opacity=0.55, dash='6 7')
        # Одна монета в банке, а не две.
        + wash(path('M530 150 q0 -10 10 -10 h52 q10 0 10 10 v60 q0 12 -12 12 h-48 q-12 0 -12 -12 z', MINT, 0.8),
               circle(566, 200, 14, BUTTER, 0.95))
        + brush(*arrow(504, 160, 528, 176), color=INK, width=2, opacity=0.55)
        + splashes((170, 250, 3, PEACH), (620, 80, 3, SAGE), (360, 50, 3, SKY))
    )


def aggregate_versioning():
    """Двое пишут в один счёт; второе сохранение молча затирает первое, версия это ловит."""
    return (
        bloom((120, 150, 100, 100, '#d3e3ee'), (330, 150, 120, 90, '#f3e8cc'), (540, 150, 90, 100, '#e2d8ee'))
        # Два запроса с правками.
        + wash(rect(40, 60, 90, 60, SKY, op=0.8), rect(40, 180, 90, 60, LAVENDER, op=0.8))
        + brush('M58 84 h50 M58 98 h36', color=INK, opacity=0.6)
        + brush('M58 204 h50 M58 218 h36', color=INK_LAV, opacity=0.6)
        + brush(*arrow(138, 90, 250, 130, bend=-12), color=INK, width=2.2, opacity=0.55)
        + brush(*arrow(138, 210, 250, 170, bend=12), color=INK_LAV, width=2.2, opacity=0.55)
        # Счёт: первая правка стёрта — бледный след поверх.
        + wash(rect(260, 70, 140, 170, CREAM, op=0.95))
        + brush(*lines(282, 100, [96, 80, 90], 18), color=INK_WARM, opacity=0.6)
        + wash(rect(278, 164, 104, 20, SKY, op=0.35))
        + brush('M282 174 h96', color=INK, width=2, opacity=0.25, dash='4 6')
        + brush('M282 210 h80', color=INK_LAV, width=2.4, opacity=0.7)
        # Штамп версии: сохранение со старой версией отскакивает.
        + wash(circle(520, 130, 44, SAGE, 0.8), circle(520, 130, 30, SAGE_D, 0.6))
        + brush('M506 130 l10 10 l20 -22', color=INK_SAGE, width=3, opacity=0.8)
        + brush(*arrow(404, 150, 470, 138), color=INK, width=2, opacity=0.5)
        + brush(*arrow(476, 170, 420, 226, bend=16), color=INK_ROSE, width=2, opacity=0.6, dash='6 7')
        + splashes((200, 40, 3, BUTTER), (610, 230, 3, LAVENDER), (440, 60, 3, SKY))
    )


def cqrs():
    """Чтобы показать одну строку, сервис собирает тяжёлый агрегат; чтение уходит в свою лёгкую модель."""
    return (
        bloom((120, 150, 100, 90, '#d3e3ee'), (360, 110, 120, 70, '#d4e6dc'), (430, 230, 140, 50, '#f3e8cc'))
        # Экран, которому нужна одна строка.
        + wash(rect(40, 100, 120, 90, SKY, op=0.8), rect(84, 190, 32, 18, SKY_D, r=3, op=0.8))
        + wash(rect(56, 130, 88, 16, CREAM, r=4, op=0.95))
        # Запись — в тяжёлый агрегат с шестерёнками.
        + wash(rect(300, 40, 170, 120, SAGE, op=0.8), circle(350, 100, 22, SAGE_D, 0.9), circle(420, 96, 16, SAGE_D, 0.9))
        + brush(*gear_marks(350, 100, 22), *gear_marks(420, 96, 16), color=INK_SAGE, width=2, opacity=0.6)
        + brush(*arrow(166, 124, 292, 96, bend=-14), color=INK, width=2.2, opacity=0.55)
        # Чтение — из лёгкого списка.
        + wash(rect(300, 196, 250, 64, BUTTER, op=0.85))
        + brush(*lines(318, 214, [180, 150, 200], 14), color=INK_WARM, width=1.8, opacity=0.6)
        + brush(*arrow(294, 226, 170, 170, bend=-14), color=INK, width=2.2, opacity=0.55)
        # Проекция: агрегат наполняет список фактами.
        + brush(*arrow(470, 164, 480, 192), color=INK_SAGE, width=2, opacity=0.5, dash='5 6')
        + splashes((230, 40, 3, SKY), (600, 120, 4, SAGE), (620, 250, 3, BUTTER))
    )


def ddd_context():
    """Магазин из областей; одно слово — три значения; границы пунктиром."""
    return (
        bloom((320, 150, 280, 120, '#f3e8cc'))
        # Четыре области магазина.
        + wash(path('M60 70 q60 -40 150 -10 q30 60 -10 100 q-90 20 -140 -20 q-20 -40 0 -70 z', SAGE, 0.75),
               path('M250 60 q80 -30 150 10 q20 60 -20 90 q-90 10 -130 -20 q-20 -40 0 -80 z', SKY, 0.75),
               path('M430 70 q80 -30 150 20 q10 60 -40 90 q-80 0 -110 -40 q-20 -40 0 -70 z', LAVENDER, 0.75),
               path('M180 190 q90 -30 200 0 q30 40 -20 70 q-110 20 -170 -10 q-30 -30 -10 -60 z', PEACH, 0.75))
        + brush('M226 70 q10 60 -10 110', 'M414 70 q-10 60 10 110', 'M200 184 q120 -20 220 0',
                color=INK, width=2, opacity=0.5, dash='6 8')
        # Одно слово — три разных облачка.
        + wash(path('M110 120 h54 q8 0 8 8 v18 q0 8 -8 8 h-38 l-10 10 v-10 h-6 q-8 0 -8 -8 v-18 q0 -8 8 -8 z', CREAM, 0.95),
               path('M300 100 h54 q8 0 8 8 v18 q0 8 -8 8 h-38 l-10 10 v-10 h-6 q-8 0 -8 -8 v-18 q0 -8 8 -8 z', CREAM, 0.95),
               path('M486 110 h54 q8 0 8 8 v18 q0 8 -8 8 h-38 l-10 10 v-10 h-6 q-8 0 -8 -8 v-18 q0 -8 8 -8 z', CREAM, 0.95))
        + brush('M112 137 h40', color=INK_SAGE, opacity=0.7)
        + brush('M302 117 l10 -6 l10 6 l10 -6 l10 6', color=INK, opacity=0.7)
        + brush('M500 127 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M516 127 h16', color=INK_LAV, opacity=0.7)
        # Мостик между областями — единственная сделка между ними.
        + brush('M300 218 q30 -16 60 0', 'M300 226 q30 -16 60 0', color=INK_WARM, width=2, opacity=0.6)
        + splashes((40, 240, 4, SAGE), (620, 60, 3, LAVENDER), (600, 250, 3, PEACH))
    )


def ddd_domain():
    """Структура с открытыми полями рассыпается; агрегат держит правила под замком."""
    return (
        bloom((170, 160, 150, 100, '#f3d6d6'), (470, 150, 130, 100, '#d4e6dc'))
        # Открытый ящик: поля наружу, деньги — дробью с хвостом.
        + wash(path('M70 130 h150 v100 h-150 z', PEACH, 0.8), path('M70 130 l-28 -34 h150 l28 34 z', BUTTER, 0.75))
        + wash(rect(90, 70, 40, 22, CREAM, r=4, op=0.95, rot=-18), rect(150, 60, 44, 22, CREAM, r=4, op=0.95, rot=12),
               rect(110, 32, 40, 22, ROSE, r=4, op=0.9, rot=-6))
        + brush('M96 80 h26', 'M156 70 h30', 'M116 42 h8 M130 42 h2 M136 42 h2 M142 42 h2', color=INK_WARM, width=1.8, opacity=0.65)
        # Чужие руки тянутся к полям.
        + brush(*arrow(40, 240, 88, 206), *arrow(270, 250, 196, 212), color=INK_ROSE, width=2, opacity=0.55)
        # Агрегат: закрытая коробка с замком.
        + wash(rect(400, 90, 170, 140, SAGE, op=0.85), rect(468, 148, 34, 28, SAGE_D, r=4, op=0.95))
        + brush('M474 148 v-10 q11 -16 22 0 v10', color=INK_SAGE, width=3, opacity=0.8)
        + brush(*lines(420, 200, [130, 100], 14), color=INK_SAGE, width=1.8, opacity=0.55)
        # Команда — через одну дверь.
        + brush(*arrow(300, 160, 392, 160), color=INK, width=2.4, opacity=0.6)
        + splashes((30, 60, 3, PEACH), (610, 70, 4, SAGE), (600, 260, 3, MINT))
    )


def ddd_infrastructure():
    """Вызов, сценарий, база и шина — где транзакция и кто отправил факт."""
    return (
        bloom((320, 150, 240, 120, '#e8eef3'), (500, 200, 110, 70, '#d4e6dc'))
        # Входящий вызов.
        + wash(rect(40, 110, 90, 70, SKY, op=0.8))
        + brush('M58 136 h50 M58 152 h34', color=INK, opacity=0.6)
        + brush(*arrow(136, 145, 204, 145), color=INK, width=2.2, opacity=0.55)
        # Сценарий — шестерёнка в середине.
        + wash(circle(250, 145, 34, SAGE, 0.85), circle(250, 145, 12, CREAM, 0.95))
        + brush(*gear_marks(250, 145, 34), color=INK_SAGE, width=2.2, opacity=0.6)
        # Транзакция — пунктирное кольцо вокруг базы и outbox.
        + brush('M318 70 h200 q24 0 24 24 v130 q0 24 -24 24 h-200 q-24 0 -24 -24 v-130 q0 -24 24 -24 z',
                color=INK_LAV, width=2, opacity=0.6, dash='7 8')
        + wash(*cylinder(330, 110, 90, 80, SKY, '#d3e3ee'))
        + wash(rect(446, 110, 76, 90, BUTTER, op=0.85))
        + brush(*lines(460, 132, [48, 36, 44], 16), color=INK_WARM, width=1.8, opacity=0.6)
        + brush(*arrow(288, 140, 326, 140), color=INK, width=2.2, opacity=0.55)
        # Факт уходит на шину только после коммита.
        + wash(*envelope(560, 128, 60, 40))
        + brush(*arrow(526, 154, 556, 150), color=INK_SAGE, width=2.2, opacity=0.6)
        + splashes((200, 60, 3, SAGE), (600, 250, 3, LAVENDER), (60, 240, 4, SKY))
    )


def ddd_services():
    """Пеня: срок, ставка и календарь рабочих дней сходятся в доменном сервисе."""
    return (
        bloom((130, 150, 120, 110, '#f3e8cc'), (360, 150, 90, 90, '#d4e6dc'), (540, 150, 100, 100, '#e2d8ee'))
        # Календарь.
        + wash(rect(40, 70, 130, 120, CREAM, op=0.95), rect(40, 70, 130, 26, ROSE, op=0.8))
        + wash(*[rect(54 + c * 26, 108 + r * 24, 16, 14, SKY if c < 5 else PEACH, r=3, op=0.8)
                 for r in range(3) for c in range(4)])
        + brush('M70 62 v16 M140 62 v16', color=INK_ROSE, width=3, opacity=0.7)
        # Ставка — процент на кружке.
        + wash(circle(120, 240, 26, BUTTER, 0.9))
        + brush('M108 252 l24 -24', 'M110 232 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0', 'M130 250 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0',
                color=INK_WARM, width=2, opacity=0.7)
        # Доменный сервис связывает.
        + wash(circle(360, 150, 40, SAGE, 0.85), circle(360, 150, 14, CREAM, 0.95))
        + brush(*gear_marks(360, 150, 40), color=INK_SAGE, width=2.2, opacity=0.6)
        + brush(*arrow(176, 130, 310, 142), *arrow(150, 232, 314, 168, bend=10), color=INK, width=2.2, opacity=0.55)
        # Счёт с пеней.
        + wash(rect(470, 80, 130, 150, LAVENDER, op=0.8))
        + brush(*lines(490, 112, [90, 70, 80], 18), color=INK_LAV, width=1.8, opacity=0.6)
        + brush('M490 196 h56', color=INK_ROSE, width=3, opacity=0.7)
        + brush(*arrow(406, 150, 462, 150), color=INK, width=2.2, opacity=0.55)
        + splashes((220, 40, 3, ROSE), (620, 60, 3, LAVENDER), (270, 260, 3, SAGE))
    )


def ddd_specification():
    """Одно правило «просрочен» вместо трёх копий: сценарий, проекция и WHERE берут его оттуда."""
    return (
        bloom((150, 150, 120, 100, '#d4e6dc'), (470, 150, 160, 110, '#e8eef3'))
        # Правило — карточка с галочкой.
        + wash(rect(60, 90, 150, 120, SAGE, op=0.85))
        + brush('M90 150 l16 16 l34 -38', color=INK_SAGE, width=3.4, opacity=0.8)
        + brush('M150 186 h40', color=INK_SAGE, width=2, opacity=0.5)
        # Три потребителя.
        + wash(circle(440, 70, 26, SAGE_D, 0.8), circle(440, 70, 9, CREAM, 0.95))
        + brush(*gear_marks(440, 70, 26), color=INK_SAGE, width=2, opacity=0.55)
        + wash(rect(400, 128, 120, 50, BUTTER, op=0.85))
        + brush(*lines(414, 146, [80, 60], 14), color=INK_WARM, width=1.8, opacity=0.6)
        + wash(*cylinder(410, 208, 90, 50, SKY, '#d3e3ee'))
        + brush(*arrow(216, 130, 404, 72, bend=-16), *arrow(216, 150, 392, 152), *arrow(216, 170, 404, 226, bend=16),
                color=INK, width=2.2, opacity=0.55)
        # Старые копии правила — бледные, зачёркнутые.
        + wash(rect(548, 60, 60, 20, ROSE, r=4, op=0.45), rect(548, 140, 60, 20, ROSE, r=4, op=0.45), rect(548, 220, 60, 20, ROSE, r=4, op=0.45))
        + brush('M552 70 h52', 'M552 150 h52', 'M552 230 h52', color=INK_ROSE, width=2, opacity=0.6)
        + splashes((40, 50, 3, SAGE), (300, 260, 3, SKY), (330, 40, 3, BUTTER))
    )


def ddd_transport():
    """Снаружи JSON, внутри доменные сущности; адаптер переводит, а cmd/ собирает процесс."""
    return (
        bloom((120, 140, 110, 90, '#f3e8cc'), (330, 140, 80, 90, '#d3e3ee'), (520, 140, 110, 100, '#d4e6dc'))
        # JSON — угловатый листок со скобками.
        + wash(path('M40 80 h120 l20 20 v110 h-140 z', CREAM, 0.95))
        + brush('M62 104 q-10 0 -10 12 v10 q0 6 -6 6 q6 0 6 6 v10 q0 12 10 12', 'M140 104 q10 0 10 12 v10 q0 6 6 6 q-6 0 -6 6 v10 q0 12 -10 12',
                color=INK_WARM, width=2.4, opacity=0.7)
        + brush(*lines(74, 118, [50, 36, 44], 14), color=INK_WARM, width=1.8, opacity=0.5)
        # Адаптер — воронка.
        + wash(path('M270 80 h120 l-40 70 v50 h-40 v-50 z', SKY, 0.8))
        + brush(*arrow(186, 145, 262, 120), color=INK, width=2.2, opacity=0.55)
        # Домен — гладкие фигуры.
        + wash(circle(480, 110, 26, SAGE, 0.85), rect(520, 84, 56, 52, SAGE_D, r=14, op=0.85), circle(510, 176, 22, MINT, 0.9))
        + brush(*arrow(356, 176, 460, 150, bend=12), color=INK, width=2.2, opacity=0.55)
        # cmd/ — папка, из которой торчит вилка: процесс собран.
        + wash(path('M220 230 h40 l8 10 h72 v44 h-120 z', BUTTER, 0.85))
        + brush('M348 262 h40 M388 254 v16 M388 256 h10 M388 268 h10', color=INK_WARM, width=2.2, opacity=0.7)
        + splashes((40, 250, 4, PEACH), (620, 230, 3, SAGE), (220, 50, 3, SKY))
    )


COVERS = {
    'circuit-breaker': (circuit_breaker, 'Ретраи долбят упавший сервис, рубильник между ними разомкнут.'),
    'discount-floor': (discount_floor, 'Две акции тянут цену ниже пола, доказательство держит её.'),
    'idempotency': (idempotency, 'Повтор после таймаута: ключ не даёт списать дважды.'),
    'why-aggregate-versioning': (aggregate_versioning, 'Второе сохранение затирает первое; версия ловит это.'),
    'why-cqrs': (cqrs, 'Запись — в тяжёлый агрегат, чтение — из лёгкого списка.'),
    'why-ddd-context': (ddd_context, 'Области магазина, границы пунктиром, одно слово — три значения.'),
    'why-ddd-domain': (ddd_domain, 'Открытые поля рассыпаются; агрегат держит правила под замком.'),
    'why-ddd-infrastructure': (ddd_infrastructure, 'Вызов, сценарий, транзакция вокруг базы и outbox, факт после коммита.'),
    'why-ddd-services': (ddd_services, 'Календарь и ставка сходятся в доменном сервисе.'),
    'why-ddd-specification': (ddd_specification, 'Одно правило вместо трёх копий.'),
    'why-ddd-transport': (ddd_transport, 'JSON через адаптер в домен, cmd/ собирает процесс.'),
}

if __name__ == '__main__':
    only = set(sys.argv[1:])
    for slug, (scene, about) in COVERS.items():
        if only and slug not in only:
            continue
        comment = f'    Обложка «{slug}»: {about}\n    Сгенерировано scripts/covers/build.py.'
        with open(os.path.join(ROOT, f'{slug}.svg'), 'w') as out:
            out.write(svg(comment, scene()))
        print('ok', slug)
