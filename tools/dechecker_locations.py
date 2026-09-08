"""
Strip the baked-in checkerboard background out of assets/locations/raw/*.png
and write true-alpha RGBA versions into game/assets/locations_alpha/ (an
intermediate; tools/slice_decor.py then cuts individual objects out of it).

The AI-generated packs export a checkerboard "transparency" pattern baked
into RGB pixels instead of a real alpha channel. This finds the two
checker tones via 2-means clustering on the image's border pixels, then
removes any border-connected region whose color is close to either tone
(border-connectivity keeps it from eating real objects that merely share
a similar tone in their own texture/shading).
"""
import numpy as np
from PIL import Image
from scipy import ndimage
import os, unicodedata

RAW_DIR = "/home/user/game/assets/locations/raw"
OUT_DIR = "/home/user/game/game/assets/locations_alpha"
TOL = 42
CORNER = 56

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


def kmeans2(points, iters=15, seed=0):
    rs = np.random.RandomState(seed)
    idx = rs.choice(len(points), 2, replace=False)
    c = points[idx].astype(np.float64)
    for _ in range(iters):
        d0 = np.linalg.norm(points - c[0], axis=1)
        d1 = np.linalg.norm(points - c[1], axis=1)
        assign = d1 < d0
        if assign.any():
            c[1] = points[assign].mean(axis=0)
        if (~assign).any():
            c[0] = points[~assign].mean(axis=0)
    return c


def dechecker(src, dst, tol=TOL, corner=CORNER):
    im = Image.open(src).convert("RGB")
    arr = np.array(im).astype(np.float64)
    h, w, _ = arr.shape
    parts = [
        arr[0:corner, 0:corner].reshape(-1, 3), arr[0:corner, w - corner:w].reshape(-1, 3),
        arr[h - corner:h, 0:corner].reshape(-1, 3), arr[h - corner:h, w - corner:w].reshape(-1, 3),
    ]
    corners = np.concatenate(parts, axis=0)
    centers = kmeans2(corners)
    d0 = np.linalg.norm(arr - centers[0], axis=2)
    d1 = np.linalg.norm(arr - centers[1], axis=2)
    checker_mask = np.minimum(d0, d1) < tol

    labeled, n = ndimage.label(checker_mask, structure=np.ones((3, 3)))
    border_labels = set(labeled[0, :]) | set(labeled[-1, :]) | set(labeled[:, 0]) | set(labeled[:, -1])
    border_labels.discard(0)
    bg_mask = np.isin(labeled, list(border_labels))

    alpha = np.where(bg_mask, 0, 255).astype(np.uint8)
    rgba = np.dstack([np.array(im), alpha])
    Image.fromarray(rgba, "RGBA").save(dst)
    return bg_mask.mean() * 100


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    raw_files = sorted(os.listdir(RAW_DIR))
    by_norm = {unicodedata.normalize("NFC", f): f for f in raw_files}
    for slug, rawname in SLUG_TO_RAW.items():
        rn = unicodedata.normalize("NFC", rawname)
        if rn not in by_norm:
            print("MISSING RAW:", rawname)
            continue
        pct = dechecker(os.path.join(RAW_DIR, by_norm[rn]), os.path.join(OUT_DIR, slug))
        print(f"  {slug}: removed {pct:.1f}%")
