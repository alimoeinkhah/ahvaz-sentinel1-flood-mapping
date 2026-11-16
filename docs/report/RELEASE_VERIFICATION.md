# Final Release Verification

## Verification event

- Date: 16 November 2026
- Platform: Google Earth Engine Code Editor
- Canonical script: `src/gee/ahvaz_rf_svm_pipeline.js`
- Earth Engine script name used for the verification run: `09_Ahvaz_RF_SVM_Final_Release`
- Result: completed without a code error

## Confirmed sample counts

- Fixed model-training samples: 1,600
- Manually reviewed blind locations: 240
- Uncertain labels excluded from binary evaluation: 2
- Final evaluated blind samples: 238
- Reference non-flood samples: 131
- Reference flood samples: 107

## Confirmed confusion matrices

Matrix orientation is actual class by predicted class, with class order `[0, 1]`.

| Product | Matrix | TN | FP | FN | TP |
| --- | --- | ---: | ---: | ---: | ---: |
| Baseline threshold | `[[113, 18], [5, 102]]` | 113 | 18 | 5 | 102 |
| Tuned RF raw | `[[110, 21], [0, 107]]` | 110 | 21 | 0 | 107 |
| Tuned RBF-SVM raw | `[[109, 22], [0, 107]]` | 109 | 22 | 0 | 107 |
| Tuned RF filtered | `[[110, 21], [0, 107]]` | 110 | 21 | 0 | 107 |
| Tuned RBF-SVM filtered | `[[110, 21], [0, 107]]` | 110 | 21 | 0 | 107 |

## Confirmed implementation path

- RF was trained and classified using the same ordered raw predictor stack.
- RBF-SVM predictors were standardized exactly once using means and standard deviations estimated from the fixed training samples.
- All 238 binary blind samples had valid predictor and classifier-output coverage.
- The exact area calculation used a fixed EPSG:32639 grid with a 10 m pixel size, the affine transform `[10, 0, 226650, 0, -10, 3503660]`, and the exported raster bounds.

## Release decision

The clean rerun reproduced the committed validation results. The earlier release gate is therefore closed, and this repository can be treated as the final verified project release rather than a release candidate.
