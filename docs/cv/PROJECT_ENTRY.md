# CV Project Entry

## Sentinel 1 Flood Mapping and Machine Learning Comparison for Ahvaz Iran

- Developed an end-to-end Google Earth Engine workflow for 10 m flood mapping from multi-temporal Sentinel-1 VV and VH imagery, combining 21 SAR, terrain, and historical-water predictors with independently generated optical training labels.
- Tuned Random Forest and RBF-SVM models using five-fold spatial cross-validation and evaluated the final products on 238 independent blind reference samples; the selected filtered RF map achieved 91.18% overall accuracy, 0.825 kappa, 0.911 flood F1, and 1.000 flood recall.
- Produced reproducible GeoTIFF, confusion-matrix, exact-area, and cartographic outputs; mapped 551.44 km2 with RF and quantified 130.59 km2 of RF-SVM spatial disagreement to report model sensitivity explicitly.

## Compact one-line version

Sentinel-1 flood mapping for Ahvaz using tuned RF and RBF-SVM, spatial cross-validation, independent blind validation, exact-grid area estimation, and RF-SVM uncertainty mapping.

