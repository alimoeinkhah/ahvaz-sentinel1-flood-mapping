from pathlib import Path
import subprocess

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patheffects as path_effects
from matplotlib.colors import ListedColormap
from matplotlib.patches import Patch, FancyBboxPatch, Rectangle
from matplotlib.lines import Line2D
from matplotlib.ticker import FuncFormatter
from PIL import Image
from scipy.ndimage import binary_dilation


ROOT = Path('/workspace/scratch/15c0b043fcae/map_design')
OUT = Path('/workspace/scratch/15c0b043fcae/outputs/ahvaz_final_maps')
OUT.mkdir(parents=True, exist_ok=True)

WIDTH = 8546
HEIGHT = 5139
XMIN, XMAX = 226650.0, 312110.0
YMIN, YMAX = 3452270.0, 3503660.0
EXTENT = [XMIN, XMAX, YMIN, YMAX]

RF_AREA = 551.4448
SVM_AREA = 586.9872
DISAGREE_AREA = 130.5882
RF_ONLY_AREA = 47.5229
SVM_ONLY_AREA = 83.0653
BOTH_FLOOD_AREA = 503.9219


def read_envi_byte(path):
    return np.memmap(path, dtype=np.uint8, mode='r', shape=(HEIGHT, WIDTH))


def transform_points(points, source, target):
    payload = ''.join(f'{x} {y}\n' for x, y in points)
    result = subprocess.run(
        ['gdaltransform', '-s_srs', source, '-t_srs', target],
        input=payload,
        text=True,
        capture_output=True,
        check=True,
    )
    transformed = []
    for line in result.stdout.strip().splitlines():
        values = line.split()
        transformed.append((float(values[0]), float(values[1])))
    return transformed


def dms(value, positive, negative):
    direction = positive if value >= 0 else negative
    value = abs(value)
    degrees = int(value)
    minutes_float = (value - degrees) * 60
    minutes = int(minutes_float)
    seconds = int(round((minutes_float - minutes) * 60))
    if seconds == 60:
        seconds = 0
        minutes += 1
    if minutes == 60:
        minutes = 0
        degrees += 1
    return f'{degrees}°{minutes:02d}′{seconds:02d}″{direction}'


def format_geo_ticks(ax, compact=False):
    x_ticks = np.linspace(235000, 305000, 5)
    y_ticks = np.linspace(3455000, 3500000, 4)
    center_x = (XMIN + XMAX) / 2
    center_y = (YMIN + YMAX) / 2
    x_geo = transform_points([(x, center_y) for x in x_ticks], 'EPSG:32639', 'EPSG:4326')
    y_geo = transform_points([(center_x, y) for y in y_ticks], 'EPSG:32639', 'EPSG:4326')
    ax.set_xticks(x_ticks)
    ax.set_yticks(y_ticks)
    ax.set_xticklabels([dms(lon, 'E', 'W') for lon, _ in x_geo], fontsize=7.5 if compact else 9)
    ax.set_yticklabels([dms(lat, 'N', 'S') for _, lat in y_geo], fontsize=7.5 if compact else 9)
    ax.tick_params(length=4, width=0.8, color='#4A5568')
    ax.grid(color='#718096', linewidth=0.45, alpha=0.42, linestyle='--')
    ax.set_xlim(XMIN, XMAX)
    ax.set_ylim(YMIN, YMAX)
    ax.set_aspect('equal')


def add_north_arrow(ax, x=0.93, y=0.88, size=0.095, color='#172A3A'):
    ax.annotate(
        'N', xy=(x, y), xycoords='axes fraction',
        ha='center', va='bottom', fontsize=12, fontweight='bold', color=color
    )
    ax.annotate(
        '', xy=(x, y), xytext=(x, y - size), xycoords='axes fraction',
        arrowprops=dict(facecolor=color, edgecolor=color, width=3.2, headwidth=10)
    )


def add_scale_bar(ax, length_km=20, segments=4, x_fraction=0.07, y_fraction=0.075):
    x0 = XMIN + (XMAX - XMIN) * x_fraction
    y0 = YMIN + (YMAX - YMIN) * y_fraction
    total_m = length_km * 1000
    segment_m = total_m / segments
    height = (YMAX - YMIN) * 0.018
    for i in range(segments):
        color = '#172A3A' if i % 2 == 0 else '#FFFFFF'
        rect = plt.Rectangle(
            (x0 + i * segment_m, y0), segment_m, height,
            facecolor=color, edgecolor='#172A3A', linewidth=0.8, zorder=8
        )
        ax.add_patch(rect)
    for i in range(segments + 1):
        label = int(i * length_km / segments)
        ax.text(x0 + i * segment_m, y0 - height * 0.6, str(label),
                ha='center', va='top', fontsize=7.5, color='#172A3A', zorder=9)
    ax.text(x0 + total_m + segment_m * 0.18, y0 + height * 0.5, 'km',
            ha='left', va='center', fontsize=8, color='#172A3A', zorder=9)


def add_ahvaz(ax, compact=False, text_color='#172A3A', marker_edge='#172A3A', halo=False):
    (x, y), = transform_points([(48.669, 31.318)], 'EPSG:4326', 'EPSG:32639')
    ax.scatter([x], [y], s=35 if compact else 60, marker='*',
               facecolor='#F6C85F', edgecolor=marker_edge, linewidth=0.8, zorder=10)
    annotation = ax.annotate('Ahvaz', xy=(x, y), xytext=(7, 5), textcoords='offset points',
                fontsize=7.5 if compact else 9.5, fontweight='bold', color='#172A3A',
                path_effects=[])
    annotation.set_color(text_color)
    if halo:
        annotation.set_path_effects([
            path_effects.withStroke(linewidth=2.2, foreground='#07111B')
        ])


def style_frame(ax):
    ax.set_facecolor('#F2F0EA')
    for spine in ax.spines.values():
        spine.set_color('#596773')
        spine.set_linewidth(0.9)


ARABIC_FORMS = {
    'ا': ('\ufe8d', '\ufe8e', None, None),
    'ت': ('\ufe95', '\ufe96', '\ufe97', '\ufe98'),
    'ح': ('\ufea1', '\ufea2', '\ufea3', '\ufea4'),
    'د': ('\ufea9', '\ufeaa', None, None),
    'ر': ('\ufead', '\ufeae', None, None),
    'ز': ('\ufeaf', '\ufeb0', None, None),
    'س': ('\ufeb1', '\ufeb2', '\ufeb3', '\ufeb4'),
    'ش': ('\ufeb5', '\ufeb6', '\ufeb7', '\ufeb8'),
    'ع': ('\ufec9', '\ufeca', '\ufecb', '\ufecc'),
    'ق': ('\ufed5', '\ufed6', '\ufed7', '\ufed8'),
    'ل': ('\ufedd', '\ufede', '\ufedf', '\ufee0'),
    'م': ('\ufee1', '\ufee2', '\ufee3', '\ufee4'),
    'ن': ('\ufee5', '\ufee6', '\ufee7', '\ufee8'),
    'و': ('\ufeed', '\ufeee', None, None),
    'ه': ('\ufee9', '\ufeea', '\ufeeb', '\ufeec'),
    'ی': ('\ufef1', '\ufef2', '\ufef3', '\ufef4'),
}


def rtl_visual(text):
    """Shape the small Persian title for Matplotlib's left-to-right renderer."""
    words = text.split(' ')
    visual_words = []
    for word in words:
        if all(ch.isdigit() for ch in word):
            visual_words.append(word)
            continue
        shaped = []
        for i, ch in enumerate(word):
            forms = ARABIC_FORMS.get(ch)
            if forms is None:
                shaped.append(ch)
                continue
            prev_forms = ARABIC_FORMS.get(word[i - 1]) if i > 0 else None
            next_forms = ARABIC_FORMS.get(word[i + 1]) if i + 1 < len(word) else None
            joins_prev = prev_forms is not None and prev_forms[2] is not None
            joins_next = next_forms is not None and forms[2] is not None
            if joins_prev and joins_next:
                shaped.append(forms[3])
            elif joins_prev:
                shaped.append(forms[1])
            elif joins_next:
                shaped.append(forms[2])
            else:
                shaped.append(forms[0])
        visual_words.append(''.join(shaped)[::-1])
    return ' '.join(visual_words[::-1])


rf = read_envi_byte(ROOT / 'rf_filtered.dat')
svm = read_envi_byte(ROOT / 'svm_filtered.dat')

# Downsample only for plotting. The reported areas remain based on exact 10 m counts.
step = 2
rf_plot = np.asarray(rf[::step, ::step])
svm_plot = np.asarray(svm[::step, ::step])
satellite_rgb = np.asarray(Image.open(ROOT / 'ahvaz_world_imagery_utm.tif').convert('RGB'))


# ---------------------------------------------------------------------------
# 1) Primary RF map
# ---------------------------------------------------------------------------
fig = plt.figure(figsize=(15.5, 7.2), facecolor='white')
ax = fig.add_axes([0.304, 0.07, 0.664, 0.86])
style_frame(ax)

background = np.zeros_like(rf_plot, dtype=np.uint8)
ax.imshow(background, extent=EXTENT, origin='upper', cmap=ListedColormap(['#F2F0EA']), zorder=1)
rf_masked = np.ma.masked_where(rf_plot != 1, rf_plot)
ax.imshow(rf_masked, extent=EXTENT, origin='upper',
          cmap=ListedColormap(['#0A6EBD']), interpolation='nearest', alpha=0.92, zorder=3)

format_geo_ticks(ax)
add_north_arrow(ax)
add_ahvaz(ax)

# Legend and scale panel outside the map.
panel = fig.add_axes([0.025, 0.25, 0.205, 0.50])
panel.set_xlim(0, 1)
panel.set_ylim(0, 1)
panel.axis('off')
panel.add_patch(FancyBboxPatch(
    (0, 0), 1, 1,
    boxstyle='round,pad=0.015,rounding_size=0.025',
    facecolor='#F3F8FC', edgecolor='#9FBBD3', linewidth=1.4,
    transform=panel.transAxes, clip_on=False
))

panel.text(0.5, 0.91, '2019 Flood Inundation Extent',
           ha='center', va='center', fontsize=13.0, fontweight='bold',
           color='#17324D')
panel.text(0.5, 0.84, 'Ahvaz, Iran',
           ha='center', va='center', fontsize=13.0, fontweight='bold',
           color='#17324D')
panel.text(0.5, 0.725, 'Filtered Random Forest | Sentinel-1 | 10 m',
           ha='center', va='center', fontsize=8.0, color='#52606D')

panel.add_patch(Rectangle((0.10, 0.565), 0.13, 0.055,
                          facecolor='#0A6EBD', edgecolor='#075985', linewidth=1.0))
panel.text(0.27, 0.593, f'Flood extent: {RF_AREA:.2f} km²',
           ha='left', va='center', fontsize=9.0, color='#172A3A')
panel.plot([0.165], [0.470], marker='*', markersize=12,
           markerfacecolor='#F6C85F', markeredgecolor='#172A3A', linestyle='none')
panel.text(0.29, 0.470, 'Ahvaz',
           ha='left', va='center', fontsize=9.5, color='#172A3A')

panel.plot([0.08, 0.92], [0.36, 0.36], color='#9FBBD3', linewidth=0.9)

x0, y0 = 0.10, 0.245
segment_w, bar_h = 0.175, 0.036
for i in range(4):
    panel.add_patch(Rectangle(
        (x0 + i * segment_w, y0), segment_w, bar_h,
        facecolor='#172A3A' if i % 2 == 0 else '#FFFFFF',
        edgecolor='#172A3A', linewidth=0.8
    ))
for i, label in enumerate([0, 5, 10, 15, 20]):
    panel.text(x0 + i * segment_w, y0 - 0.035, str(label),
               ha='center', va='top', fontsize=8, color='#172A3A')
panel.text(x0 + 4 * segment_w + 0.035, y0 + bar_h / 2, 'km',
           ha='left', va='center', fontsize=8.5, color='#172A3A')

main_png = OUT / 'Ahvaz_2019_Primary_RF_Flood_Map_Revised.png'
fig.savefig(main_png, dpi=300, bbox_inches='tight', pad_inches=0.02, facecolor='white')
plt.close(fig)


# ---------------------------------------------------------------------------
# 2) Commercial satellite-overlay map
# ---------------------------------------------------------------------------
fig = plt.figure(figsize=(15.5, 7.2), facecolor='#0B1320')
ax = fig.add_axes([0.304, 0.07, 0.664, 0.86])

base = satellite_rgb.astype(np.float32) / 255.0
luma = np.dot(base[..., :3], [0.2126, 0.7152, 0.0722])[..., None]
base_muted = np.clip((0.52 * base + 0.48 * luma) * 0.54, 0, 1)
base_muted = np.power(base_muted, 0.92)
ax.imshow(base_muted, extent=EXTENT, origin='upper', interpolation='bilinear', zorder=1)

flood = rf_plot == 1
glow = binary_dilation(flood, iterations=4) & ~flood
edge = binary_dilation(flood, iterations=1) & ~flood
ax.imshow(np.ma.masked_where(~glow, glow), extent=EXTENT, origin='upper',
          cmap=ListedColormap(['#00D8FF']), interpolation='nearest', alpha=0.24, zorder=2)
ax.imshow(np.ma.masked_where(~edge, edge), extent=EXTENT, origin='upper',
          cmap=ListedColormap(['#E8FCFF']), interpolation='nearest', alpha=0.72, zorder=3)
ax.imshow(np.ma.masked_where(~flood, flood), extent=EXTENT, origin='upper',
          cmap=ListedColormap(['#00CFF3']), interpolation='nearest', alpha=0.68, zorder=4)

format_geo_ticks(ax)
ax.tick_params(colors='#EAF1F7')
for label in ax.get_xticklabels() + ax.get_yticklabels():
    label.set_color('#EAF1F7')
ax.grid(color='#FFFFFF', linewidth=0.45, alpha=0.22, linestyle='--')
for spine in ax.spines.values():
    spine.set_color('#D5E0E8')
    spine.set_linewidth(0.9)
add_north_arrow(ax, color='#F5FAFD')
add_ahvaz(ax, text_color='#FFFFFF', marker_edge='#FFFFFF', halo=True)

panel = fig.add_axes([0.025, 0.25, 0.205, 0.50])
panel.set_xlim(0, 1)
panel.set_ylim(0, 1)
panel.axis('off')
panel.add_patch(FancyBboxPatch(
    (0, 0), 1, 1,
    boxstyle='round,pad=0.015,rounding_size=0.025',
    facecolor='#142131', edgecolor='#5D7184', linewidth=1.4,
    transform=panel.transAxes, clip_on=False
))
panel.text(0.5, 0.91, '2019 Flood Inundation Extent', ha='center', va='center',
           fontsize=13.0, fontweight='bold', color='#FFFFFF')
panel.text(0.5, 0.84, 'Ahvaz, Iran', ha='center', va='center',
           fontsize=13.0, fontweight='bold', color='#FFFFFF')
panel.text(0.5, 0.725, 'Filtered Random Forest | Sentinel-1 | 10 m',
           ha='center', va='center', fontsize=8.0, color='#B8C6D2')

panel.add_patch(Rectangle((0.10, 0.565), 0.13, 0.055,
                          facecolor='#00CFF3', edgecolor='#E8FCFF', linewidth=1.0))
panel.text(0.27, 0.593, f'Flood extent: {RF_AREA:.2f} km²',
           ha='left', va='center', fontsize=9.0, color='#FFFFFF')
panel.plot([0.165], [0.470], marker='*', markersize=12,
           markerfacecolor='#F6C85F', markeredgecolor='#FFFFFF', linestyle='none')
panel.text(0.29, 0.470, 'Ahvaz', ha='left', va='center',
           fontsize=9.5, color='#FFFFFF')

panel.plot([0.08, 0.92], [0.36, 0.36], color='#526A7E', linewidth=0.9)
x0, y0 = 0.10, 0.245
segment_w, bar_h = 0.175, 0.036
for i in range(4):
    panel.add_patch(Rectangle(
        (x0 + i * segment_w, y0), segment_w, bar_h,
        facecolor='#F2F6F9' if i % 2 == 0 else '#142131',
        edgecolor='#F2F6F9', linewidth=0.8
    ))
for i, label in enumerate([0, 5, 10, 15, 20]):
    panel.text(x0 + i * segment_w, y0 - 0.035, str(label),
               ha='center', va='top', fontsize=8, color='#F2F6F9')
panel.text(x0 + 4 * segment_w + 0.035, y0 + bar_h / 2, 'km',
           ha='left', va='center', fontsize=8.5, color='#F2F6F9')
panel.text(0.08, 0.07, 'Satellite basemap: Esri World Imagery',
           ha='left', va='center', fontsize=6.8, color='#8296A8')

commercial_png = OUT / 'Ahvaz_2019_RF_Flood_Map_Satellite_Overlay.png'
fig.savefig(commercial_png, dpi=300, bbox_inches='tight', pad_inches=0.02, facecolor='#0B1320')
plt.close(fig)


# ---------------------------------------------------------------------------
# 3) RF-SVM comparison and spatial disagreement
# ---------------------------------------------------------------------------
fig, axes = plt.subplots(1, 3, figsize=(17.2, 7.2), facecolor='white')
plt.subplots_adjust(left=0.045, right=0.98, top=0.83, bottom=0.16, wspace=0.12)

for ax in axes:
    style_frame(ax)

for ax, data, color, title, area in [
    (axes[0], rf_plot, '#0A6EBD', 'A  Filtered Random Forest', RF_AREA),
    (axes[1], svm_plot, '#7B2CBF', 'B  Filtered RBF-SVM', SVM_AREA),
]:
    ax.imshow(np.zeros_like(data), extent=EXTENT, origin='upper',
              cmap=ListedColormap(['#F2F0EA']), zorder=1)
    masked = np.ma.masked_where(data != 1, data)
    ax.imshow(masked, extent=EXTENT, origin='upper',
              cmap=ListedColormap([color]), interpolation='nearest', alpha=0.92, zorder=3)
    format_geo_ticks(ax, compact=True)
    add_ahvaz(ax, compact=True)
    ax.set_title(f'{title}\nFlood area: {area:.4f} km²', loc='left', fontsize=11.5,
                 fontweight='bold', color='#17324D', pad=10)

agreement = (rf_plot.astype(np.uint8) * 2 + svm_plot.astype(np.uint8))
agreement_cmap = ListedColormap(['#F2F0EA', '#A855F7', '#F08A5D', '#075985'])
axes[2].imshow(agreement, extent=EXTENT, origin='upper', cmap=agreement_cmap,
               vmin=-0.5, vmax=3.5, interpolation='nearest', zorder=2)
format_geo_ticks(axes[2], compact=True)
add_ahvaz(axes[2], compact=True)
axes[2].set_title('C  Spatial agreement and disagreement\nRF–SVM comparison',
                  loc='left', fontsize=11.5, fontweight='bold', color='#17324D', pad=10)

axes[0].legend(handles=[Patch(facecolor='#0A6EBD', label='RF flood')], loc='upper left',
               frameon=True, facecolor='white', edgecolor='#CBD5E0', fontsize=8.5)
axes[1].legend(handles=[Patch(facecolor='#7B2CBF', label='SVM flood')], loc='upper left',
               frameon=True, facecolor='white', edgecolor='#CBD5E0', fontsize=8.5)
axes[2].legend(handles=[
    Patch(facecolor='#075985', label=f'Both flood: {BOTH_FLOOD_AREA:.4f} km²'),
    Patch(facecolor='#F08A5D', label=f'RF only: {RF_ONLY_AREA:.4f} km²'),
    Patch(facecolor='#A855F7', label=f'SVM only: {SVM_ONLY_AREA:.4f} km²'),
    Patch(facecolor='#F2F0EA', edgecolor='#A0AEC0', label='Both non-flood'),
], loc='upper left', frameon=True, facecolor='white', edgecolor='#CBD5E0', fontsize=8.2)

fig.text(0.045, 0.94, 'Spatial Sensitivity of the Final Ahvaz Flood Map',
         fontsize=19, fontweight='bold', color='#17324D', ha='left')
fig.text(0.045, 0.895,
         'Filtered RF is the primary product; filtered RBF-SVM is retained as a sensitivity product.',
         fontsize=10.5, color='#52606D', ha='left')

summary = (
    f'Disagreement area: {DISAGREE_AREA:.4f} km²     |     '
    'Overall grid agreement: 97.03%     |     Flood-union Jaccard: 79.42%'
)
fig.text(0.5, 0.07, summary, ha='center', va='center', fontsize=10.5,
         fontweight='bold', color='#243B53',
         bbox=dict(boxstyle='round,pad=0.55', facecolor='#EEF4F8', edgecolor='#BCCCDC'))

comparison_png = OUT / 'Ahvaz_2019_RF_SVM_Spatial_Comparison.png'
fig.savefig(comparison_png, dpi=300, bbox_inches='tight', facecolor='white')
plt.close(fig)

print(main_png)
print(comparison_png)
