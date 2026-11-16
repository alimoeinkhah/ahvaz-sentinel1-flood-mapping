from pathlib import Path
import subprocess

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patheffects as path_effects
from matplotlib.colors import ListedColormap
from matplotlib.patches import FancyBboxPatch, Rectangle
from PIL import Image
from scipy.ndimage import binary_dilation


ROOT = Path('/workspace/scratch/15c0b043fcae/map_design')
OUT = Path('/workspace/scratch/15c0b043fcae/outputs/ahvaz_final_maps')
OUT.mkdir(parents=True, exist_ok=True)

WIDTH, HEIGHT = 8546, 5139
XMIN, XMAX = 226650.0, 312110.0
YMIN, YMAX = 3452270.0, 3503660.0
EXTENT = [XMIN, XMAX, YMIN, YMAX]

SVM_AREA = 586.9872
BOTH_AREA = 503.9219
RF_ONLY_AREA = 47.5229
SVM_ONLY_AREA = 83.0653
DISAGREE_AREA = 130.5882


def read_envi_byte(path):
    return np.memmap(path, dtype=np.uint8, mode='r', shape=(HEIGHT, WIDTH))


def transform_points(points, source='EPSG:32639', target='EPSG:4326'):
    payload = ''.join(f'{x} {y}\n' for x, y in points)
    result = subprocess.run(
        ['gdaltransform', '-s_srs', source, '-t_srs', target],
        input=payload, text=True, capture_output=True, check=True,
    )
    return [tuple(map(float, line.split()[:2])) for line in result.stdout.strip().splitlines()]


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


def format_geo_ticks(ax, dark=False):
    x_ticks = np.linspace(235000, 305000, 5)
    y_ticks = np.linspace(3455000, 3500000, 4)
    center_x = (XMIN + XMAX) / 2
    center_y = (YMIN + YMAX) / 2
    x_geo = transform_points([(x, center_y) for x in x_ticks])
    y_geo = transform_points([(center_x, y) for y in y_ticks])
    color = '#EAF1F7' if dark else '#172A3A'
    grid = '#FFFFFF' if dark else '#718096'
    ax.set_xticks(x_ticks)
    ax.set_yticks(y_ticks)
    ax.set_xticklabels([dms(lon, 'E', 'W') for lon, _ in x_geo], fontsize=9, color=color)
    ax.set_yticklabels([dms(lat, 'N', 'S') for _, lat in y_geo], fontsize=9, color=color)
    ax.tick_params(length=4, width=0.8, color=color)
    ax.grid(color=grid, linewidth=0.45, alpha=0.22 if dark else 0.42, linestyle='--')
    ax.set_xlim(XMIN, XMAX)
    ax.set_ylim(YMIN, YMAX)
    ax.set_aspect('equal')
    for spine in ax.spines.values():
        spine.set_color('#D5E0E8' if dark else '#596773')
        spine.set_linewidth(0.9)


def add_north_arrow(ax, dark=False):
    color = '#F5FAFD' if dark else '#172A3A'
    ax.annotate('N', xy=(0.93, 0.88), xycoords='axes fraction',
                ha='center', va='bottom', fontsize=12, fontweight='bold', color=color)
    ax.annotate('', xy=(0.93, 0.88), xytext=(0.93, 0.785), xycoords='axes fraction',
                arrowprops=dict(facecolor=color, edgecolor=color, width=3.2, headwidth=10))


def add_ahvaz(ax, dark=False):
    (x, y), = transform_points([(48.669, 31.318)], 'EPSG:4326', 'EPSG:32639')
    color = '#FFFFFF' if dark else '#172A3A'
    ax.scatter([x], [y], s=60, marker='*', facecolor='#F6C85F',
               edgecolor=color, linewidth=0.8, zorder=20)
    label = ax.annotate('Ahvaz', xy=(x, y), xytext=(7, 5), textcoords='offset points',
                        fontsize=9.5, fontweight='bold', color=color, zorder=21)
    if dark:
        label.set_path_effects([path_effects.withStroke(linewidth=2.2, foreground='#07111B')])


def draw_panel(fig, dark, title, subtitle, legend_items, summary=None, credit=False):
    panel = fig.add_axes([0.025, 0.215, 0.205, 0.57])
    panel.set_xlim(0, 1)
    panel.set_ylim(0, 1)
    panel.axis('off')

    panel_face = '#142131' if dark else '#F3F8FC'
    panel_edge = '#5D7184' if dark else '#9FBBD3'
    main = '#FFFFFF' if dark else '#17324D'
    muted = '#B8C6D2' if dark else '#52606D'
    rule = '#526A7E' if dark else '#9FBBD3'

    panel.add_patch(FancyBboxPatch(
        (0, 0), 1, 1, boxstyle='round,pad=0.015,rounding_size=0.025',
        facecolor=panel_face, edgecolor=panel_edge, linewidth=1.4,
        transform=panel.transAxes, clip_on=False,
    ))
    panel.text(0.5, 0.92, title, ha='center', va='center',
               fontsize=11.8, fontweight='bold', color=main)
    panel.text(0.5, 0.855, 'Ahvaz, Iran', ha='center', va='center',
               fontsize=12.2, fontweight='bold', color=main)
    panel.text(0.5, 0.755, subtitle, ha='center', va='center',
               fontsize=7.7, color=muted)

    start_y = 0.635
    spacing = 0.095 if len(legend_items) >= 3 else 0.11
    for i, (color, edge, text) in enumerate(legend_items):
        y = start_y - i * spacing
        if text == 'Ahvaz':
            panel.plot([0.165], [y], marker='*', markersize=12,
                       markerfacecolor=color, markeredgecolor=edge, linestyle='none')
        else:
            panel.add_patch(Rectangle((0.10, y - 0.025), 0.13, 0.050,
                                      facecolor=color, edgecolor=edge, linewidth=1.0))
        panel.text(0.27, y, text, ha='left', va='center', fontsize=8.7, color=main)

    if summary:
        panel.text(0.10, 0.335, summary, ha='left', va='center',
                   fontsize=8.3, fontweight='bold', color=main)
        divider_y = 0.285
        scale_y = 0.17
    else:
        divider_y = 0.36
        scale_y = 0.225

    panel.plot([0.08, 0.92], [divider_y, divider_y], color=rule, linewidth=0.9)
    x0 = 0.10
    segment_w, bar_h = 0.175, 0.032
    for i in range(4):
        panel.add_patch(Rectangle(
            (x0 + i * segment_w, scale_y), segment_w, bar_h,
            facecolor=('#F2F6F9' if i % 2 == 0 else panel_face) if dark
                       else ('#172A3A' if i % 2 == 0 else '#FFFFFF'),
            edgecolor='#F2F6F9' if dark else '#172A3A', linewidth=0.8,
        ))
    for i, label in enumerate([0, 5, 10, 15, 20]):
        panel.text(x0 + i * segment_w, scale_y - 0.030, str(label),
                   ha='center', va='top', fontsize=7.8, color=main)
    panel.text(x0 + 4 * segment_w + 0.035, scale_y + bar_h / 2, 'km',
               ha='left', va='center', fontsize=8.2, color=main)
    if credit:
        panel.text(0.08, 0.045, 'Satellite basemap: Esri World Imagery',
                   ha='left', va='center', fontsize=6.4, color='#8296A8')


def make_canvas(dark=False):
    face = '#0B1320' if dark else '#FFFFFF'
    fig = plt.figure(figsize=(15.5, 7.2), facecolor=face)
    ax = fig.add_axes([0.304, 0.07, 0.664, 0.86])
    return fig, ax, face


def show_mask(ax, mask, color, alpha=0.92, zorder=4, dilation=0, glow_color=None):
    if dilation:
        glow = binary_dilation(mask, iterations=dilation) & ~mask
        ax.imshow(np.ma.masked_where(~glow, glow), extent=EXTENT, origin='upper',
                  cmap=ListedColormap([glow_color or color]), interpolation='nearest',
                  alpha=0.24, zorder=zorder - 2)
        edge = binary_dilation(mask, iterations=1) & ~mask
        ax.imshow(np.ma.masked_where(~edge, edge), extent=EXTENT, origin='upper',
                  cmap=ListedColormap(['#F4FDFF']), interpolation='nearest',
                  alpha=0.70, zorder=zorder - 1)
    ax.imshow(np.ma.masked_where(~mask, mask), extent=EXTENT, origin='upper',
              cmap=ListedColormap([color]), interpolation='nearest', alpha=alpha, zorder=zorder)


rf = np.asarray(read_envi_byte(ROOT / 'rf_filtered.dat')[::2, ::2]) == 1
svm = np.asarray(read_envi_byte(ROOT / 'svm_filtered.dat')[::2, ::2]) == 1
both = rf & svm
rf_only = rf & ~svm
svm_only = svm & ~rf

satellite_rgb = np.asarray(Image.open(ROOT / 'ahvaz_world_imagery_utm.tif').convert('RGB'))
base = satellite_rgb.astype(np.float32) / 255.0
luma = np.dot(base[..., :3], [0.2126, 0.7152, 0.0722])[..., None]
base_muted = np.clip((0.52 * base + 0.48 * luma) * 0.54, 0, 1)
base_muted = np.power(base_muted, 0.92)


# 1. Filtered RBF-SVM — scientific version
fig, ax, face = make_canvas(False)
ax.set_facecolor('#F2F0EA')
ax.imshow(np.zeros_like(svm, dtype=np.uint8), extent=EXTENT, origin='upper',
          cmap=ListedColormap(['#F2F0EA']), zorder=1)
show_mask(ax, svm, '#7A2CB8')
format_geo_ticks(ax, False)
add_north_arrow(ax, False)
add_ahvaz(ax, False)
draw_panel(
    fig, False, '2019 Flood Inundation Extent',
    'Filtered RBF-SVM | Sentinel-1 | 10 m',
    [('#7A2CB8', '#5B1D8A', f'Flood extent: {SVM_AREA:.2f} km²'),
     ('#F6C85F', '#172A3A', 'Ahvaz')],
)
svm_scientific = OUT / 'Ahvaz_2019_SVM_Flood_Map_Scientific.png'
fig.savefig(svm_scientific, dpi=300, bbox_inches='tight', pad_inches=0.02, facecolor=face)
plt.close(fig)


# 2. Filtered RBF-SVM — satellite version
fig, ax, face = make_canvas(True)
ax.imshow(base_muted, extent=EXTENT, origin='upper', interpolation='bilinear', zorder=1)
show_mask(ax, svm, '#D14DFF', alpha=0.66, dilation=4, glow_color='#E879FF')
format_geo_ticks(ax, True)
add_north_arrow(ax, True)
add_ahvaz(ax, True)
draw_panel(
    fig, True, '2019 Flood Inundation Extent',
    'Filtered RBF-SVM | Sentinel-1 | 10 m',
    [('#D14DFF', '#F4FDFF', f'Flood extent: {SVM_AREA:.2f} km²'),
     ('#F6C85F', '#FFFFFF', 'Ahvaz')],
    credit=True,
)
svm_satellite = OUT / 'Ahvaz_2019_SVM_Flood_Map_Satellite.png'
fig.savefig(svm_satellite, dpi=300, bbox_inches='tight', pad_inches=0.02, facecolor=face)
plt.close(fig)


# 3. RF–SVM agreement/disagreement — scientific version
fig, ax, face = make_canvas(False)
ax.set_facecolor('#F2F0EA')
ax.imshow(np.zeros_like(rf, dtype=np.uint8), extent=EXTENT, origin='upper',
          cmap=ListedColormap(['#F2F0EA']), zorder=1)
show_mask(ax, both, '#087EA4', alpha=0.92, zorder=3)
show_mask(ax, rf_only, '#F07A3F', alpha=0.96, zorder=4)
show_mask(ax, svm_only, '#A945D6', alpha=0.96, zorder=5)
format_geo_ticks(ax, False)
add_north_arrow(ax, False)
add_ahvaz(ax, False)
draw_panel(
    fig, False, 'RF–SVM Flood-Extent Agreement',
    'Filtered products | Sentinel-1 | 10 m',
    [('#087EA4', '#065B78', f'Both models: {BOTH_AREA:.2f} km²'),
     ('#F07A3F', '#B94C1D', f'RF only: {RF_ONLY_AREA:.2f} km²'),
     ('#A945D6', '#76279C', f'SVM only: {SVM_ONLY_AREA:.2f} km²')],
    summary=f'Total disagreement: {DISAGREE_AREA:.2f} km²',
)
disagreement_scientific = OUT / 'Ahvaz_2019_RF_SVM_Disagreement_Scientific.png'
fig.savefig(disagreement_scientific, dpi=300, bbox_inches='tight', pad_inches=0.02, facecolor=face)
plt.close(fig)


# 4. RF–SVM agreement/disagreement — satellite version
fig, ax, face = make_canvas(True)
ax.imshow(base_muted, extent=EXTENT, origin='upper', interpolation='bilinear', zorder=1)
show_mask(ax, both, '#00CFE8', alpha=0.56, zorder=3)
show_mask(ax, rf_only, '#FF8A3D', alpha=0.90, zorder=5, dilation=2, glow_color='#FFB078')
show_mask(ax, svm_only, '#D946EF', alpha=0.88, zorder=6, dilation=2, glow_color='#F184FF')
format_geo_ticks(ax, True)
add_north_arrow(ax, True)
add_ahvaz(ax, True)
draw_panel(
    fig, True, 'RF–SVM Flood-Extent Agreement',
    'Filtered products | Sentinel-1 | 10 m',
    [('#00CFE8', '#F4FDFF', f'Both models: {BOTH_AREA:.2f} km²'),
     ('#FF8A3D', '#FFD3B8', f'RF only: {RF_ONLY_AREA:.2f} km²'),
     ('#D946EF', '#F8C7FF', f'SVM only: {SVM_ONLY_AREA:.2f} km²')],
    summary=f'Total disagreement: {DISAGREE_AREA:.2f} km²',
    credit=True,
)
disagreement_satellite = OUT / 'Ahvaz_2019_RF_SVM_Disagreement_Satellite.png'
fig.savefig(disagreement_satellite, dpi=300, bbox_inches='tight', pad_inches=0.02, facecolor=face)
plt.close(fig)


for path in [svm_scientific, svm_satellite, disagreement_scientific, disagreement_satellite]:
    print(path)
