import numpy as np
from PIL import Image
from scipy import ndimage
import os, unicodedata

RAW_DIR = "/home/user/game/assets/locations/raw"
OUT_DIR = "/home/user/game/game/assets/locations"

def corner_top_colors(arr, size=56, topn=2):
    h, w, _ = arr.shape
    parts = [
        arr[0:size, 0:size].reshape(-1, 3),
        arr[0:size, w-size:w].reshape(-1, 3),
        arr[h-size:h, 0:size].reshape(-1, 3),
        arr[h-size:h, w-size:w].reshape(-1, 3),
    ]
    corners = np.concatenate(parts, axis=0)
    bucket = (corners // 5 * 5)
    colors, counts = np.unique(bucket, axis=0, return_counts=True)
    order = np.argsort(-counts)
    return [colors[i].astype(np.float32) for i in order[:topn]]

def dechecker(slug, rawname, tol=26):
    src = os.path.join(RAW_DIR, rawname)
    dst = os.path.join(OUT_DIR, slug)
    im = Image.open(src).convert("RGB")
    arr = np.array(im).astype(np.int16)

    bg_colors = corner_top_colors(arr, topn=3)
    if len(bg_colors) >= 2:
        pair_d = max(np.linalg.norm(bg_colors[0]-bg_colors[1]),
                     np.linalg.norm(bg_colors[0]-bg_colors[2]) if len(bg_colors)>2 else 0)
        tol = max(tol, pair_d/2 + 14)
    dist_all = None
    for c in bg_colors:
        d = np.linalg.norm(arr.astype(np.float32) - c, axis=2)
        dist_all = d if dist_all is None else np.minimum(dist_all, d)
    checker_mask = dist_all < tol

    labeled, n = ndimage.label(checker_mask, structure=np.ones((3,3)))
    border_labels = set(labeled[0, :]) | set(labeled[-1, :]) | set(labeled[:, 0]) | set(labeled[:, -1])
    border_labels.discard(0)
    bg_mask = np.isin(labeled, list(border_labels))

    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)
    rgba = np.dstack([np.array(im), alpha])
    Image.fromarray(rgba, mode="RGBA").save(dst)
    pct = bg_mask.mean() * 100
    print(f"  {slug}: removed {pct:.1f}%")
    return pct

raw_files = sorted(os.listdir(RAW_DIR))
byNorm = {unicodedata.normalize("NFC", f): f for f in raw_files}

SLUG_TO_RAW = {
 "altai.png":"Алтай.png","anapa.png":"Анапа.png","astrakhan.png":"Астрахань.png",
 "belarus.png":"Баларусь.png","bali.png":"Бали.png","belgorod.png":"Белгород.png",
 "belgrade.png":"Белград.png","bulgaria.png":"Болгария.png","hungary.png":"Венгрия.png",
 "vietnam.png":"Вьетнам.png","vietnam_masha.png":"ВьетнамМаша.png","goa.png":"Гоа.png",
 "georgia.png":"Грузия.png","dagestan.png":"Дагестан.png","drumnbass.png":"Драмэндбес.png",
 "dubai.png":"Дубай.png","italy.png":"Италия.png","kazan.png":"Казань.png",
 "kazakhstan.png":"Казахстан.png","kaliningrad.png":"Калининград.png",
 "kaliningrad_scooter.png":"Калининградсамокат.png",
 "kaluga.png":"Калуга.png","karelia.png":"Карелия.png","kasimov.png":"Касимов.png",
 "kirovsk.png":"Кировск.png","kirovsk_ambulance.png":"Кировскскорая.png",
 "china.png":"Китай.png","kolomna.png":"Коломна.png","cuba.png":"Куба.png",
 "murom.png":"Муром.png","newyear.png":"Новыйгод.png","tent_night.png":"Ночьвпалатке.png",
 "orel.png":"Орел.png","romania.png":"Румыния.png","signal.png":"Сигнал.png",
 "scooter.png":"Скутер.png","istanbul.png":"Стамбул.png","suzdal.png":"Суздаль.png",
 "thailand.png":"Таиланд.png","thailand_birthday.png":"ТаиландДР.png",
 "thailand_ambulance.png":"Таиландскорая.png","tarusa.png":"Таруса.png",
 "tula.png":"Тула.png","tour.png":"Тур.png","turkey.png":"Турция.png",
 "philippines.png":"Филиппины.png","hurghada.png":"Хургада.png","changan.png":"Чанган.png",
 "srilanka.png":"Шри-Ланка.png","korea.png":"ЮжнаяКорея.png",
}

low = []
for slug, rawname in SLUG_TO_RAW.items():
    rn = unicodedata.normalize("NFC", rawname)
    if rn not in byNorm:
        print("MISSING RAW:", rawname); continue
    pct = dechecker(slug, byNorm[rn])
    if pct < 40:
        low.append(slug)
print("\nLOW COVERAGE (<40%):", low)
