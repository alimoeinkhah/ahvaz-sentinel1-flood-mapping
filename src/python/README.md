# Cartographic Post-processing

The two Python scripts preserve the map-design workflow used to create the six figures in `results/maps`.

## Dependencies

- Python 3.10 or newer
- NumPy
- Matplotlib
- Pillow
- SciPy
- GDAL command-line utilities, including `gdaltransform`

Install the Python packages with:

```bash
python -m pip install -r requirements.txt
```

## Additional inputs

The scientific figures use the filtered RF and RBF-SVM bands from the five-band GeoTIFF. The satellite-overlay figures additionally require a georeferenced imagery basemap. Raw Esri World Imagery tiles are not redistributed because they are third-party content and remain subject to Esri's attribution and use requirements.

The scripts are retained as the exact rendering provenance and currently point to the local intermediate-render directory used for the final figures. Before rerunning them elsewhere, update `ROOT` and `OUT` near the beginning of each script and prepare:

- `rf_filtered.dat`: byte raster on the final 8,546 × 5,139 grid
- `svm_filtered.dat`: byte raster on the same grid
- `ahvaz_world_imagery_utm.tif`: aligned RGB basemap for satellite-overlay figures

The published PNG outputs are already included in `results/maps`, so these third-party basemap inputs are not needed to inspect or use the final project results.
