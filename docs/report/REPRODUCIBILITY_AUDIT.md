# Reproducibility Audit

## Status

Final verification passed on 16 November 2026. The canonical corrected Earth Engine script completed without a code error and reproduced every committed confusion-matrix cell for the 238-sample independent blind evaluation. The repository is no longer classified as a release candidate.

## Corrections already applied to the repository copy

1. Random Forest inference scaling
   - Observed issue: the RF classifier was trained on raw predictor values but the saved script classified an already standardized predictor image.
   - Correction: final RF inference now uses `predictorStackRaw.select(finalPredictorBandList)`.
   - Reason: training and inference must use identical feature definitions, order, units, and scaling.

2. RBF-SVM image standardization
   - Observed issue: the final SVM image path started from a predictor stack that had already been standardized, then applied the final training-sample means and standard deviations again.
   - Correction: standardization now starts from `predictorStackRaw` and is performed exactly once with statistics estimated from the fixed training samples.
   - Reason: the RBF kernel depends on Euclidean feature-space distances; applying a different scaling at inference changes those distances and invalidates the learned decision function.

3. Exact-grid area export
   - Observed issue: an earlier area CSV did not agree with the exported GeoTIFF and reported raw areas smaller than their removal-only filtered descendants.
   - Correction: area is calculated by counting class-1 pixels on the exact EPSG 32639 10 m export grid using its fixed affine transform and bounds.
   - Authoritative area table: `results/tables/Ahvaz_Final_Flood_Areas_10m.csv`.

## Validation and mask checks already resolved

- Fractional mask values must be converted to a true binary validity mask with `gt(0)` before mask combinations.
- All 238 binary blind reference samples have valid predictor and classifier-output coverage.
- Two uncertain reference labels were excluded from quantitative evaluation.
- The blind sample coordinate fields are explicitly stored in UTM zone 38N, while the final exported raster grid is in UTM zone 39N. This is intentional and must be documented clearly rather than silently treated as one CRS.

## Completed release gate

1. The corrected canonical Earth Engine script was run from a clean authenticated session.
2. The five-band GeoTIFF, blind predictions, metrics, confusion matrices, model configuration, and exact area table were produced and retained.
3. The 238-sample evaluation count and every confusion-matrix cell were confirmed.
4. The exact area table was reconciled with the fixed 10 m GeoTIFF grid.
5. Final scientific and satellite-overlay maps were generated from the retained raster products.
6. SHA-256 hashes were recorded in `CHECKSUMS.sha256`.

The detailed verification record is available in `RELEASE_VERIFICATION.md`.

