# Technical Report Outline

## Working title

Machine Learning Based Sentinel 1 Flood Mapping and Spatial Uncertainty Assessment for the 2019 Ahvaz Flood Iran

## Planned report sections

1. Executive summary
   - Problem, approach, principal result, and intended use
   - Why RF is the primary map and why SVM is retained as a sensitivity product

2. Introduction
   - Flood mapping with synthetic aperture radar
   - Operational advantages of Sentinel-1 during cloudy flood events
   - Limits of single-threshold mapping and motivation for model comparison
   - Research questions and project objectives

3. Study area and flood event
   - Geographic setting of Ahvaz and the Khuzestan floodplain
   - Study-area bounds, coordinate systems, terrain, river network, and land use
   - 2019 event chronology and selected observation dates

4. Scientific background
   - Active microwave remote sensing and SAR image formation
   - Backscatter coefficient and decibel representation
   - Surface roughness, dielectric properties, incidence angle, and double-bounce effects
   - Open-water response in VV and VH polarization
   - Speckle and spatial filtering
   - Temporal backscatter change detection

5. Input datasets
   - Sentinel-1 GRD IW VV and VH scenes
   - Sentinel-2 and Landsat optical data used only for training-label construction
   - NASADEM elevation and derived slope
   - JRC Global Surface Water occurrence
   - Urban mask and auxiliary constraints
   - Blind sample locations and manually reviewed reference labels

6. Preprocessing
   - Scene selection, orbit consistency, spatial clipping, masking, and 30 m focal median filtering
   - Temporal image selection: baseline, pre-event, event, and post-event
   - Predictor ordering and data-type control

7. Predictor engineering
   - Original VV and VH bands for four temporal states
   - Temporal differences in VV and VH
   - Polarization differences VV minus VH
   - Elevation, slope, water occurrence, and land-cover predictors
   - Complete 21-predictor table with definition, unit, source, and expected flood response

8. Threshold baseline
   - Physical rationale for the VV decrease, VH support, and post-event recovery conditions
   - Mathematical definition of the baseline decision rule
   - Permanent-water, slope, urban, and connectivity constraints

9. Independent optical training labels
   - MNDWI definition and spectral rationale
   - Stable dry, new event-water, and stable permanent-water rules
   - Conversion to binary flood and non-flood classes
   - Blind-sample exclusion buffers and leakage prevention

10. Sampling and spatial validation design
    - Stratified sampling and requested class counts
    - Fixed 1,600-sample training asset
    - 5 km spatial blocks and five-fold spatial cross-validation
    - Difference between internal spatial CV and final blind validation

11. Random Forest method
    - Bootstrap aggregation, random feature subsets, tree voting, and decision boundaries
    - Node impurity and the Gini criterion
    - Sequential tuning of tree count, variables per split, minimum leaf population, and bag fraction
    - Final RF configuration and justification

12. RBF-SVM method
    - Maximum-margin classification and soft-margin penalty
    - RBF kernel definition
    - Roles of gamma and cost
    - Training-only z-score standardization and leakage prevention
    - Spatial cross-validation grid search and final configuration

13. Final model training and inference
    - Training on all fixed development samples after tuning
    - Raw predictor path for RF
    - Single training-statistic standardization path for RBF-SVM
    - Raw binary classification products

14. Post-classification filtering
    - Permanent-water removal
    - Maximum-slope constraint
    - Urban exclusion
    - Minimum connected-pixel rule
    - Why the same filter is applied to RF and SVM

15. Independent blind validation
    - Manual label workflow and exclusion of uncertain class 9
    - Final class distribution: 131 non-flood and 107 flood samples
    - Approximately 30 m validation cells and majority rule
    - Confusion-matrix orientation and definitions of TN, FP, FN, and TP
    - Formulas for overall accuracy, precision, recall, F1, specificity, and Cohen kappa

16. Flood-area calculation
    - Exact 10 m export grid and EPSG 32639
    - Pixel counting and conversion from square metres to square kilometres
    - Why area must be measured on the exported grid
    - Resolution of the earlier raw-area CSV mismatch

17. Results
    - Baseline, raw RF, raw RBF-SVM, filtered RF, and filtered RBF-SVM metrics
    - Confusion matrices
    - Exact mapped areas
    - Primary RF map and SVM sensitivity map

18. Spatial agreement and uncertainty
    - Both non-flood, SVM-only flood, RF-only flood, and both-flood classes
    - Overall agreement, flood-union Jaccard index, and disagreement area
    - Spatial interpretation of the 130.59 km2 disagreement

19. Quality control and implementation audit
    - Predictor-mask checks
    - Reference-mask validity correction using a binary greater-than-zero test
    - RF inference-scaling mismatch and correction
    - SVM double-standardization risk and correction
    - Exact-grid area-export correction

20. Discussion
    - Comparison of threshold and machine-learning products
    - High recall and the false-positive tradeoff
    - Why equal blind metrics do not imply equal maps
    - Why RF is selected as the primary product
    - Interpretation limits of post-classification filtering

21. Limitations
    - Reference-sample size and spatial representativeness
    - Optical-label uncertainty and temporal mismatch
    - SAR geometry, mixed pixels, vegetation, urban double bounce, and permanent water
    - Single-event generalizability
    - Dependence on manually selected thresholds and auxiliary masks

22. Reproducibility
    - Software, datasets, assets, random seed, coordinate systems, and export settings
    - Repository structure and complete execution sequence
    - Expected tasks and output checksums

23. Conclusions
    - Main findings, defensible claims, and appropriate use of the products

24. References and appendices
    - Dataset and method references
    - Predictor dictionary
    - Hyperparameter search spaces
    - Full confusion matrices and metric formulas
    - Earth Engine and Python execution instructions

