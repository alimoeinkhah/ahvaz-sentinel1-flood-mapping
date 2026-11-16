# Sentinel-1 Flood Mapping and RF–SVM Comparison for Ahvaz, Iran

This repository contains the final verified flood-mapping workflow for the 2019 Ahvaz flood in Khuzestan, Iran. It compares a physically interpretable threshold baseline with tuned Random Forest (RF) and radial-basis-function support vector machine (RBF-SVM) classifiers. Every product is evaluated on the same independent blind reference set, and the spatial disagreement between the two machine-learning maps is quantified explicitly.

![Primary filtered Random Forest flood map](results/maps/Ahvaz_2019_Primary_RF_Flood_Map_Revised.png)

## Main result

The filtered RF map is retained as the primary product. On 238 independent binary reference samples, it achieved 91.18% overall accuracy, a Cohen's kappa of 0.825, flood precision of 0.836, flood recall of 1.000, and flood F1 of 0.911. It mapped 551.44 km² of flood. The filtered RBF-SVM obtained the same blind-sample metrics but mapped 586.99 km² and differed spatially from RF over 130.59 km². The SVM result is therefore retained as a sensitivity product rather than treated as an interchangeable final map.

## Project outputs

- Five-band 10 m GeoTIFF containing the baseline, raw RF, raw RBF-SVM, filtered RF, and filtered RBF-SVM flood products
- Independent blind-validation metrics and confusion matrices
- Exact 10 m flood-area table aligned to the exported GeoTIFF grid
- Scientific and satellite-overlay maps for RF, RBF-SVM, and RF-SVM spatial agreement
- Reproducibility audit, release verification record, and CV-ready project description

## Repository structure

```text
src/gee/             Google Earth Engine model and final export scripts
src/python/          Cartographic post-processing scripts
data/validation/     Blind labels, predictions, metrics, and model settings
results/maps/        Final scientific and satellite-overlay figures
results/tables/      Corrected exact-grid area results
docs/report/         Technical report sources and audit trail
docs/cv/             CV-ready project description
```

## Data and models

The predictor stack uses multi-temporal Sentinel-1 VV and VH backscatter, temporal change features, VV–VH differences, NASADEM elevation and slope, historical surface-water occurrence, and land-cover constraints. High-confidence training labels were derived independently from optical imagery. A fixed set of 1,600 training samples was used for model development, while 240 manually reviewed blind locations were reserved for final evaluation; two uncertain labels were excluded, leaving 238 binary reference samples: 131 non-flood and 107 flood.

The final RF configuration uses 300 trees, three variables per split, a minimum leaf population of one, and a 0.50 bag fraction. The RBF-SVM uses gamma 0.03125 and cost 16 after predictor standardization with training-set means and standard deviations.

The canonical script is `src/gee/ahvaz_rf_svm_pipeline.js`. It contains model development, final training, inference, validation, exact-grid area calculation, and all export tasks in one file. The two smaller Earth Engine files are retained as modular reference snippets; they are not required when the canonical script is used.

## Final verified results

| Product | TN | FP | FN | TP | Overall accuracy | Flood F1 | Flood area (km²) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline threshold | 113 | 18 | 5 | 102 | 0.9034 | 0.8987 | 262.7839 |
| Tuned RF raw | 110 | 21 | 0 | 107 | 0.9118 | 0.9106 | 565.0642 |
| Tuned RBF-SVM raw | 109 | 22 | 0 | 107 | 0.9076 | 0.9068 | 635.9270 |
| Tuned RF filtered | 110 | 21 | 0 | 107 | 0.9118 | 0.9106 | 551.4448 |
| Tuned RBF-SVM filtered | 110 | 21 | 0 | 107 | 0.9118 | 0.9106 | 586.9872 |

## Reproducing the final run

1. Upload the required training and blind-reference assets to the Earth Engine paths declared near the start of the canonical script.
2. Run `src/gee/ahvaz_rf_svm_pipeline.js` in the Earth Engine Code Editor.
3. Check that 238 binary blind samples are evaluated and that the confusion matrices match the table above.
4. Start the six final export tasks: five-band GeoTIFF, metrics, confusion matrices, blind predictions, model configuration, and exact flood areas.
5. Compare the exported files with `CHECKSUMS.sha256` when an exact byte-for-byte release check is required.

The cartographic scripts and their additional basemap requirements are documented in `src/python/README.md`.

## Reproducibility status

The corrected canonical script was rerun from a clean Earth Engine session on 16 November 2026. The run completed without a code error, evaluated all 238 binary blind samples, and reproduced every confusion-matrix cell committed here. The exact-grid area table is tied to the exported 10 m GeoTIFF grid. See `docs/report/REPRODUCIBILITY_AUDIT.md` and `docs/report/RELEASE_VERIFICATION.md`.

## Basemap note

The rendered satellite-overlay figures use Esri World Imagery with attribution. Raw basemap tiles are not distributed in this repository.

