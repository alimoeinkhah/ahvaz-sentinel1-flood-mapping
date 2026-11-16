// ============================================================================
// AHVAZ 2019 FLOOD MAPPING — RANDOM FOREST AND SVM COMPARISON
// ============================================================================
// Purpose:
//   1. Preserve the threshold workflow as the baseline.
//   2. Create independent optical training labels.
//   3. Exclude all blind validation locations from training.
//   4. Train Random Forest and RBF-SVM.
//   5. Later compare Baseline, RF and SVM using the same blind reference cells.
//
// Important:
//   - The 240 blind labels are never used for training.
//   - Optical imagery is used only to generate training labels.
//   - Sentinel-1, terrain and historical water are model predictors.
// ============================================================================


// ----------------------------------------------------------------------------
// 00 — USER SETTINGS
// ----------------------------------------------------------------------------

// Keep all three false for the first run.
var RUN_FINAL_BLIND_VALIDATION = false;
var EXPORT_ML_PRODUCTS = false;
var EXPORT_TRAINING_SAMPLES = false;

// Final labeled reference asset.
// This asset is required only when RUN_FINAL_BLIND_VALIDATION becomes true.
var FINAL_REFERENCE_ASSET =
  'projects/ahvaz-flood-sama-2026/assets/' +
  'ahvaz_blind_reference_labels_final_240';

// Existing blind sample-location asset.
var BLIND_SAMPLE_ASSET =
  'projects/ahvaz-flood-sama-2026/assets/' +
  'ahvaz_validation_samples_blind';

var EXPORT_FOLDER = 'Ahvaz_S1_Flood_Mapping';

var EXPORT_SCALE_METERS = 10;
var TRAINING_SCALE_METERS = 30;

var SELECTED_RELATIVE_ORBIT = 108;

var BLIND_EXCLUSION_BUFFER_METERS = 300;
var SPATIAL_BLOCK_SIZE_METERS = 5000;

var RANDOM_SEED = 42;

// Optical thresholds used only for generating training labels.
var BEFORE_DRY_MNDWI_MAX = -0.05;
var EVENT_WATER_MNDWI_MIN = 0.20;
var MINIMUM_MNDWI_INCREASE = 0.25;

var STABLE_DRY_MNDWI_MAX = -0.10;
var STABLE_DRY_MAX_ABS_CHANGE = 0.20;

var STABLE_WATER_MNDWI_MIN = 0.20;

// Requested optical training samples.
var N_STABLE_DRY = 600;
var N_NEW_EVENT_WATER = 800;
var N_STABLE_PERMANENT_WATER = 200;

// Common post-classification constraints.
var MINIMUM_CONNECTED_PIXELS = 8;
var MAXIMUM_FLOOD_SLOPE_DEGREES = 10;
var PERMANENT_WATER_OCCURRENCE_PERCENT = 90;


// ----------------------------------------------------------------------------
// 01 — STUDY AREA AND BLIND-SAMPLE EXCLUSION
// ----------------------------------------------------------------------------

var geometry = ee.Geometry.Polygon(
  [[
    [48.131597263957694, 31.189367920205697],
    [49.018743260051444, 31.189367920205697],
    [49.018743260051444, 31.63590397367669],
    [48.131597263957694, 31.63590397367669],
    [48.131597263957694, 31.189367920205697]
  ]],
  null,
  false
);

var validationProjection = ee.Projection('EPSG:32638');

var blindTable = ee.FeatureCollection(BLIND_SAMPLE_ASSET);

// Reconstruct point geometries from UTM coordinates.
var blindCentres = blindTable.map(function(feature) {
  var x = ee.Number(feature.get('x_utm38'));
  var y = ee.Number(feature.get('y_utm38'));

  var point = ee.Geometry.Point(
    [x, y],
    validationProjection
  ).transform('EPSG:4326', 1);

  return ee.Feature(
    point,
    feature.toDictionary()
  );
});

// Create a 300 m exclusion buffer around every blind sample.
var blindBuffers = blindCentres.map(function(feature) {
  return feature.buffer(BLIND_EXCLUSION_BUFFER_METERS);
});

// Value 1 outside blind buffers and 0 inside.
var allowedTrainingMask = ee.Image(0)
  .byte()
  .paint(blindBuffers, 1)
  .eq(0)
  .clip(geometry)
  .rename('allowed_training_mask');


// ----------------------------------------------------------------------------
// 02 — SENTINEL-1 INPUT IMAGES
// ----------------------------------------------------------------------------

var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(geometry)
  .filterDate('2018-04-01', '2019-05-01')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(
    ee.Filter.listContains(
      'transmitterReceiverPolarisation',
      'VV'
    )
  )
  .filter(
    ee.Filter.listContains(
      'transmitterReceiverPolarisation',
      'VH'
    )
  );

function selectS1Image(startDate, endDate) {
  return ee.Image(
    s1.filterDate(startDate, endDate)
      .filter(
        ee.Filter.eq(
          'orbitProperties_pass',
          'DESCENDING'
        )
      )
      .filter(
        ee.Filter.eq(
          'relativeOrbitNumber_start',
          SELECTED_RELATIVE_ORBIT
        )
      )
      .sort('system:time_start')
      .first()
  );
}

var preImage = selectS1Image(
  '2019-03-27',
  '2019-03-28'
);

var eventImage = selectS1Image(
  '2019-04-08',
  '2019-04-09'
);

var postImage = selectS1Image(
  '2019-04-20',
  '2019-04-21'
);

var baselineCollection = s1
  .filterDate('2018-04-01', '2019-03-20')
  .filter(
    ee.Filter.eq(
      'orbitProperties_pass',
      'DESCENDING'
    )
  )
  .filter(
    ee.Filter.eq(
      'relativeOrbitNumber_start',
      SELECTED_RELATIVE_ORBIT
    )
  );

var baselineVV = baselineCollection
  .select('VV')
  .median()
  .rename('baseline_VV');

var baselineVH = baselineCollection
  .select('VH')
  .median()
  .rename('baseline_VH');

var preVV = preImage
  .select('VV')
  .rename('pre_VV');

var preVH = preImage
  .select('VH')
  .rename('pre_VH');

var eventVV = eventImage
  .select('VV')
  .rename('event_VV');

var eventVH = eventImage
  .select('VH')
  .rename('event_VH');

var postVV = postImage
  .select('VV')
  .rename('post_VV');

var postVH = postImage
  .select('VH')
  .rename('post_VH');

function smooth30m(image, outputName) {
  return image
    .focal_median(
      30,
      'circle',
      'meters',
      1
    )
    .rename(outputName);
}

var dVVBaselineEvent = smooth30m(
  eventVV.subtract(baselineVV),
  'dVV_baseline_event'
);

var dVHBaselineEvent = smooth30m(
  eventVH.subtract(baselineVH),
  'dVH_baseline_event'
);

var dVVPostEvent = smooth30m(
  postVV.subtract(eventVV),
  'dVV_post_event'
);

var dVHPostEvent = smooth30m(
  postVH.subtract(eventVH),
  'dVH_post_event'
);

var dVVPostPre = smooth30m(
  postVV.subtract(preVV),
  'dVV_post_pre'
);

var dVHPostPre = smooth30m(
  postVH.subtract(preVH),
  'dVH_post_pre'
);

var baselineVVminusVH = baselineVV
  .subtract(baselineVH)
  .rename('baseline_VV_minus_VH');

var preVVminusVH = preVV
  .subtract(preVH)
  .rename('pre_VV_minus_VH');

var eventVVminusVH = eventVV
  .subtract(eventVH)
  .rename('event_VV_minus_VH');

var postVVminusVH = postVV
  .subtract(postVH)
  .rename('post_VV_minus_VH');


// ----------------------------------------------------------------------------
// 03 — TERRAIN, WATER AND LAND-COVER CONSTRAINTS
// ----------------------------------------------------------------------------

var elevation = ee.Image('NASA/NASADEM_HGT/001')
  .select('elevation')
  .clip(geometry)
  .rename('elevation');

var slope = ee.Terrain
  .slope(elevation)
  .rename('slope');

var waterOccurrence = ee.Image(
  'JRC/GSW1_4/GlobalSurfaceWater'
)
  .select('occurrence')
  .unmask(0)
  .clip(geometry)
  .rename('water_occurrence');

var permanentWater = waterOccurrence
  .gte(PERMANENT_WATER_OCCURRENCE_PERCENT)
  .rename('permanent_water');

var nonPermanentWaterMask = permanentWater.not();

var lowSlopeMask = slope.lte(
  MAXIMUM_FLOOD_SLOPE_DEGREES
);

var landCover2019 = ee.Image(
  'COPERNICUS/Landcover/100m/Proba-V-C3/Global/2019'
)
  .select('discrete_classification')
  .clip(geometry);

var urbanMask = landCover2019
  .eq(50)
  .rename('urban_mask');

var nonUrbanMask = urbanMask.not();


// ----------------------------------------------------------------------------
// 04 — THRESHOLD BASELINE
// ----------------------------------------------------------------------------

var baselineCandidates = dVVBaselineEvent
  .lt(-3)
  .and(dVHBaselineEvent.lt(-2))
  .and(dVVPostEvent.gt(3))
  .updateMask(nonPermanentWaterMask)
  .selfMask();

var baselineConnectedCount = baselineCandidates
  .connectedPixelCount(100, true);

var baselineFlood = baselineCandidates
  .updateMask(
    baselineConnectedCount.gte(
      MINIMUM_CONNECTED_PIXELS
    )
  )
  .updateMask(lowSlopeMask)
  .updateMask(nonUrbanMask)
  .unmask(0)
  .clip(geometry)
  .rename('baseline_flood')
  .toByte();


// ----------------------------------------------------------------------------
// 05 — SENTINEL-1 PREDICTOR STACK
// ----------------------------------------------------------------------------

var predictorStackRaw = ee.Image.cat([
  baselineVV,
  baselineVH,
  preVV,
  preVH,
  eventVV,
  eventVH,
  postVV,
  postVH,
  dVVBaselineEvent,
  dVHBaselineEvent,
  dVVPostEvent,
  dVHPostEvent,
  dVVPostPre,
  dVHPostPre,
  baselineVVminusVH,
  preVVminusVH,
  eventVVminusVH,
  postVVminusVH,
  elevation,
  slope,
  waterOccurrence
])
  .toFloat()
  .clip(geometry);

var predictorBands = predictorStackRaw.bandNames();


// ----------------------------------------------------------------------------
// 06 — OPTICAL DATA FOR INDEPENDENT TRAINING LABELS
// ----------------------------------------------------------------------------

function maskSentinel2(image) {
  var scl = image.select('SCL');

  var clearMask = scl
    .neq(0)
    .and(scl.neq(1))
    .and(scl.neq(3))
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));

  return image
    .select([
      'B2',
      'B3',
      'B4',
      'B8',
      'B11'
    ])
    .multiply(0.0001)
    .updateMask(clearMask)
    .copyProperties(
      image,
      ['system:time_start']
    );
}

function maskLandsat8(image) {
  var clearMask = image
    .select('QA_PIXEL')
    .bitwiseAnd(63)
    .eq(0);

  var saturationMask = image
    .select('QA_RADSAT')
    .eq(0);

  return image
    .select([
      'SR_B2',
      'SR_B3',
      'SR_B4',
      'SR_B5',
      'SR_B6'
    ])
    .multiply(0.0000275)
    .add(-0.2)
    .updateMask(clearMask)
    .updateMask(saturationMask)
    .copyProperties(
      image,
      ['system:time_start']
    );
}

var s2March27 = ee.ImageCollection(
  'COPERNICUS/S2_SR_HARMONIZED'
)
  .filterBounds(geometry)
  .filterDate(
    '2019-03-27',
    '2019-03-28'
  )
  .map(maskSentinel2)
  .mosaic()
  .clip(geometry);

var s2April08 = ee.ImageCollection(
  'COPERNICUS/S2_SR_HARMONIZED'
)
  .filterBounds(geometry)
  .filterDate(
    '2019-04-08',
    '2019-04-09'
  )
  .map(maskSentinel2)
  .mosaic()
  .clip(geometry);

var l8April08 = ee.ImageCollection(
  'LANDSAT/LC08/C02/T1_L2'
)
  .filterBounds(geometry)
  .filterDate(
    '2019-04-08',
    '2019-04-09'
  )
  .filter(
    ee.Filter.eq('WRS_PATH', 166)
  )
  .filter(
    ee.Filter.eq('WRS_ROW', 38)
  )
  .map(maskLandsat8)
  .mosaic()
  .clip(geometry);

var l8April08Compatible = l8April08.select(
  [
    'SR_B2',
    'SR_B3',
    'SR_B4',
    'SR_B5',
    'SR_B6'
  ],
  [
    'B2',
    'B3',
    'B4',
    'B8',
    'B11'
  ]
);

var eventOpticalComposite =
  ee.ImageCollection.fromImages([
    l8April08Compatible.toFloat(),
    s2April08.toFloat()
  ])
    .mosaic()
    .clip(geometry);

var beforeMNDWI = s2March27
  .normalizedDifference(['B3', 'B11'])
  .rename('before_MNDWI');

var eventMNDWI = eventOpticalComposite
  .normalizedDifference(['B3', 'B11'])
  .rename('event_MNDWI');

var mndwiIncrease = eventMNDWI
  .subtract(beforeMNDWI)
  .rename('MNDWI_increase');

var commonOpticalMask = beforeMNDWI
  .mask()
  .and(eventMNDWI.mask())
  .rename('common_optical_mask');


// ----------------------------------------------------------------------------
// 07 — HIGH-CONFIDENCE OPTICAL TRAINING LABELS
// ----------------------------------------------------------------------------

// Stable dry/non-water.
var stableDry = beforeMNDWI
  .lt(STABLE_DRY_MNDWI_MAX)
  .and(
    eventMNDWI.lt(
      STABLE_DRY_MNDWI_MAX
    )
  )
  .and(
    mndwiIncrease
      .abs()
      .lt(STABLE_DRY_MAX_ABS_CHANGE)
  )
  .and(commonOpticalMask);

// Dry before and open water during the flood.
var newEventWater = beforeMNDWI
  .lt(BEFORE_DRY_MNDWI_MAX)
  .and(
    eventMNDWI.gt(
      EVENT_WATER_MNDWI_MIN
    )
  )
  .and(
    mndwiIncrease.gt(
      MINIMUM_MNDWI_INCREASE
    )
  )
  .and(commonOpticalMask)
  .and(nonPermanentWaterMask);

// Stable permanent water, treated as non-flood.
var stablePermanentWater = beforeMNDWI
  .gt(STABLE_WATER_MNDWI_MIN)
  .and(
    eventMNDWI.gt(
      STABLE_WATER_MNDWI_MIN
    )
  )
  .and(permanentWater)
  .and(commonOpticalMask);

// 0 = stable dry
// 1 = event-related flood
// 2 = stable permanent water
var opticalSourceStratum = ee.Image(0)
  .where(newEventWater, 1)
  .where(stablePermanentWater, 2)
  .updateMask(
    stableDry
      .or(newEventWater)
      .or(stablePermanentWater)
  )
  .updateMask(allowedTrainingMask)
  .rename('source_stratum')
  .toByte();


// ----------------------------------------------------------------------------
// 08 — STANDARDIZE PREDICTORS FOR RBF-SVM
// ----------------------------------------------------------------------------

var trainingStatistics = predictorStackRaw
  .updateMask(allowedTrainingMask)
  .reduceRegion({
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    geometry: geometry,
    scale: TRAINING_SCALE_METERS,
    maxPixels: 1e9,
    tileScale: 4
  });

var predictorMeans = ee.Image.constant(
  predictorBands.map(function(bandName) {
    bandName = ee.String(bandName);

    return ee.Number(
      trainingStatistics.get(
        bandName.cat('_mean')
      )
    );
  })
).rename(predictorBands);

var predictorStdDevs = ee.Image.constant(
  predictorBands.map(function(bandName) {
    bandName = ee.String(bandName);

    return ee.Number(
      trainingStatistics.get(
        bandName.cat('_stdDev')
      )
    ).max(0.000001);
  })
).rename(predictorBands);

var predictorStack = predictorStackRaw
  .subtract(predictorMeans)
  .divide(predictorStdDevs)
  .toFloat()
  .clip(geometry);


// ----------------------------------------------------------------------------
// 09 — STRATIFIED SAMPLING AND SPATIAL HOLDOUT
// ----------------------------------------------------------------------------

var opticalTrainingSamples = predictorStackRaw
  .addBands(opticalSourceStratum)
  .stratifiedSample({
    numPoints: 0,
    classBand: 'source_stratum',
    region: geometry,
    scale: TRAINING_SCALE_METERS,
    projection: validationProjection,

    classValues: [0, 1, 2],

    classPoints: [
      N_STABLE_DRY,
      N_NEW_EVENT_WATER,
      N_STABLE_PERMANENT_WATER
    ],

    seed: RANDOM_SEED,
    dropNulls: true,
    tileScale: 4,
    geometries: true
  });

function addReferenceClassAndSpatialFold(feature) {
  var sourceStratum = ee.Number(
    feature.get('source_stratum')
  );

  // Event water is flood.
  // Stable dry and permanent water are non-flood.
  var referenceClass = ee.Number(
    ee.Algorithms.If(
      sourceStratum.eq(1),
      1,
      0
    )
  );

  var coordinates = feature
    .geometry()
    .transform(validationProjection, 1)
    .coordinates();

  var blockX = ee.Number(
    coordinates.get(0)
  )
    .divide(SPATIAL_BLOCK_SIZE_METERS)
    .floor();

  var blockY = ee.Number(
    coordinates.get(1)
  )
    .divide(SPATIAL_BLOCK_SIZE_METERS)
    .floor();

  var blockId = blockX
    .multiply(100000)
    .add(blockY)
    .toInt();

  var spatialFold = blockId
    .abs()
    .mod(5)
    .toInt();

  return feature.set({
    reference_class: referenceClass,
    spatial_block_id: blockId,
    spatial_fold: spatialFold
  });
}

opticalTrainingSamples = opticalTrainingSamples
  .map(addReferenceClassAndSpatialFold);

// Fold 0 is the independent internal holdout.
// Folds 1–4 are used for training.
var internalTrainingSamples =
  opticalTrainingSamples.filter(
    ee.Filter.neq('spatial_fold', 0)
  );

var internalHoldoutSamples =
  opticalTrainingSamples.filter(
    ee.Filter.eq('spatial_fold', 0)
  );

print(
  'Optical source-stratum counts',
  opticalTrainingSamples.aggregate_histogram(
    'source_stratum'
  )
);

print(
  'Binary training-class counts',
  opticalTrainingSamples.aggregate_histogram(
    'reference_class'
  )
);

print(
  'Spatial-fold counts',
  opticalTrainingSamples.aggregate_histogram(
    'spatial_fold'
  )
);

print(
  'Internal training sample count',
  internalTrainingSamples.size()
);

print(
  'Internal spatial holdout count',
  internalHoldoutSamples.size()
);
/*
// ----------------------------------------------------------------------------
// EXPORT THE FIXED 1600 RAW TRAINING SAMPLES ONCE
// ----------------------------------------------------------------------------

Export.table.toAsset({
  collection: opticalTrainingSamples,
  description: 'Ahvaz_ML_Training_Raw_1600',
  assetId:
    'projects/ahvaz-flood-sama-2026/assets/' +
    'ahvaz_ml_training_raw_1600'
});
*/
// Load the saved 1600 training samples.
opticalTrainingSamples = ee.FeatureCollection(
  'projects/ahvaz-flood-sama-2026/assets/ahvaz_ml_training_raw_1600'
);

print(
  'Loaded training samples from Asset',
  opticalTrainingSamples.size()
);
// Check the spatial-fold field in the loaded Asset.
print(
  'First sample from loaded Asset',
  opticalTrainingSamples.first()
);

print(
  'Loaded Asset — spatial_fold histogram',
  opticalTrainingSamples.aggregate_histogram('spatial_fold')
);

print(
  'Numeric fold 0 count',
  opticalTrainingSamples
    .filter(ee.Filter.eq('spatial_fold', 0))
    .size()
);

print(
  'Text fold 0 count',
  opticalTrainingSamples
    .filter(ee.Filter.eq('spatial_fold', '0'))
    .size()
);
var NUMBER_OF_SPATIAL_FOLDS = 5;

if (false) {
// ----------------------------------------------------------------------------
// 10 — SVM COARSE TUNING WITH 5-FOLD SPATIAL CROSS-VALIDATION
// ----------------------------------------------------------------------------

// Coarse logarithmic grid based on powers of two.
// A finer search will later be performed around the best combination.
var SVM_GAMMA_VALUES = [
0.03125
];

var SVM_COST_VALUES = [
  4,
  8,       
  16,
];



// Calculate predictor means using only the training folds.
function calculatePredictorMeans(trainingSamples) {
  return ee.Dictionary.fromLists(
    predictorBands,
    predictorBands.map(function(bandName) {
      bandName = ee.String(bandName);
      return trainingSamples.aggregate_mean(bandName);
    })
  );
}


// Calculate predictor standard deviations using only the training folds.
function calculatePredictorStdDevs(trainingSamples) {
  return ee.Dictionary.fromLists(
    predictorBands,
    predictorBands.map(function(bandName) {
      bandName = ee.String(bandName);

      return ee.Number(
        trainingSamples.aggregate_total_sd(bandName)
      ).max(0.000001);
    })
  );
}


// Apply the training-fold scaling parameters to a sample collection.
function standardizeSamples(samples, means, standardDeviations) {
  return samples.map(function(feature) {

    var standardizedProperties = ee.Dictionary.fromLists(
      predictorBands,
      predictorBands.map(function(bandName) {
        bandName = ee.String(bandName);

        var mean = ee.Number(means.get(bandName));
        var standardDeviation = ee.Number(
          standardDeviations.get(bandName)
        ).max(0.000001);

        return ee.Number(feature.get(bandName))
          .subtract(mean)
          .divide(standardDeviation);
      })
    );

    return feature.set(standardizedProperties);
  });
}


// Prevent division-by-zero when calculating accuracy metrics.
function safeDivide(numerator, denominator) {
  numerator = ee.Number(numerator);
  denominator = ee.Number(denominator);

  return ee.Number(
    ee.Algorithms.If(
      denominator.gt(0),
      numerator.divide(denominator),
      0
    )
  );
}


// Train and evaluate one SVM configuration on one spatial fold.
function evaluateSvmFold(
  gammaValue,
  costValue,
  foldNumber,
  configurationId
) {

  var rawTraining = opticalTrainingSamples.filter(
    ee.Filter.neq('spatial_fold', foldNumber)
  );

  var rawValidation = opticalTrainingSamples.filter(
    ee.Filter.eq('spatial_fold', foldNumber)
  );

  // Scaling is fitted only from the four training folds.
  var means = calculatePredictorMeans(rawTraining);
  var standardDeviations =
    calculatePredictorStdDevs(rawTraining);

  var scaledTraining = standardizeSamples(
    rawTraining,
    means,
    standardDeviations
  );

  var scaledValidation = standardizeSamples(
    rawValidation,
    means,
    standardDeviations
  );

  var classifier = ee.Classifier.libsvm({
    svmType: 'C_SVC',
    kernelType: 'RBF',
    shrinking: true,
    gamma: gammaValue,
    cost: costValue
  }).train({
    features: scaledTraining,
    classProperty: 'reference_class',
    inputProperties: predictorBands
  });

  var results = scaledValidation.classify(
    classifier,
    'prediction'
  );

  var trueNegative = results
    .filter(ee.Filter.eq('reference_class', 0))
    .filter(ee.Filter.eq('prediction', 0))
    .size();

  var falsePositive = results
    .filter(ee.Filter.eq('reference_class', 0))
    .filter(ee.Filter.eq('prediction', 1))
    .size();

  var falseNegative = results
    .filter(ee.Filter.eq('reference_class', 1))
    .filter(ee.Filter.eq('prediction', 0))
    .size();

  var truePositive = results
    .filter(ee.Filter.eq('reference_class', 1))
    .filter(ee.Filter.eq('prediction', 1))
    .size();

  var total = trueNegative
    .add(falsePositive)
    .add(falseNegative)
    .add(truePositive);

  var overallAccuracy = safeDivide(
    trueNegative.add(truePositive),
    total
  );

  var floodPrecision = safeDivide(
    truePositive,
    truePositive.add(falsePositive)
  );

  var floodRecall = safeDivide(
    truePositive,
    truePositive.add(falseNegative)
  );

  var floodF1 = safeDivide(
    floodPrecision.multiply(floodRecall).multiply(2),
    floodPrecision.add(floodRecall)
  );

  var matrix = results.errorMatrix(
    'reference_class',
    'prediction',
    [0, 1]
  );

  return ee.Feature(null, {
    configuration_id: configurationId,
    gamma: gammaValue,
    cost: costValue,
    spatial_fold: foldNumber,
    validation_count: total,
    true_negative: trueNegative,
    false_positive: falsePositive,
    false_negative: falseNegative,
    true_positive: truePositive,
    overall_accuracy: overallAccuracy,
    kappa: matrix.kappa(),
    flood_precision: floodPrecision,
    flood_recall: floodRecall,
    flood_f1: floodF1
  });
}


// Run every SVM configuration on all five spatial folds.
var svmFoldMetricFeatures = [];

for (
  var gammaIndex = 0;
  gammaIndex < SVM_GAMMA_VALUES.length;
  gammaIndex++
) {
  for (
    var costIndex = 0;
    costIndex < SVM_COST_VALUES.length;
    costIndex++
  ) {

    var configurationId =
      'G' + gammaIndex + '_C' + costIndex;

    for (
      var foldNumber = 0;
      foldNumber < NUMBER_OF_SPATIAL_FOLDS;
      foldNumber++
    ) {
      svmFoldMetricFeatures.push(
        evaluateSvmFold(
          SVM_GAMMA_VALUES[gammaIndex],
          SVM_COST_VALUES[costIndex],
          foldNumber,
          configurationId
        )
      );
    }
  }
}

var svmFoldMetrics = ee.FeatureCollection(
  svmFoldMetricFeatures
);


// Calculate the mean result of the five folds for each configuration.
var svmSummaryFeatures = [];

for (
  var summaryGammaIndex = 0;
  summaryGammaIndex < SVM_GAMMA_VALUES.length;
  summaryGammaIndex++
) {
  for (
    var summaryCostIndex = 0;
    summaryCostIndex < SVM_COST_VALUES.length;
    summaryCostIndex++
  ) {

    var summaryConfigurationId =
      'G' + summaryGammaIndex +
      '_C' + summaryCostIndex;

    var configurationResults = svmFoldMetrics.filter(
      ee.Filter.eq(
        'configuration_id',
        summaryConfigurationId
      )
    );

    svmSummaryFeatures.push(
      ee.Feature(null, {
        configuration_id: summaryConfigurationId,
        gamma: SVM_GAMMA_VALUES[summaryGammaIndex],
        cost: SVM_COST_VALUES[summaryCostIndex],
        mean_flood_f1:
          configurationResults.aggregate_mean('flood_f1'),
        sd_flood_f1:
          configurationResults.aggregate_total_sd('flood_f1'),
        mean_flood_precision:
          configurationResults.aggregate_mean(
            'flood_precision'
          ),
        mean_flood_recall:
          configurationResults.aggregate_mean(
            'flood_recall'
          ),
        mean_overall_accuracy:
          configurationResults.aggregate_mean(
            'overall_accuracy'
          ),
        mean_kappa:
          configurationResults.aggregate_mean('kappa'),
        total_false_positive:
          configurationResults.aggregate_sum(
            'false_positive'
          ),
        total_false_negative:
          configurationResults.aggregate_sum(
            'false_negative'
          )
      })
    );
  }
}

var svmTuningSummary = ee.FeatureCollection(
  svmSummaryFeatures
).sort('mean_flood_f1', false);


// Main outputs.
print(
  'SVM coarse tuning — ranked by mean flood F1',
  svmTuningSummary
);

print(
  'Best coarse SVM configuration',
  svmTuningSummary.first()
);

print(
  'Best configuration — five individual folds',
  svmFoldMetrics.filter(
    ee.Filter.eq(
      'configuration_id',
      ee.Feature(svmTuningSummary.first())
        .get('configuration_id')
    )
  )
);

// ============================================================================
// END OF SVM COARSE TUNING
// Do not use the 238 final blind samples during model tuning.
// ============================================================================
}
// ============================================================================
// 11 — RANDOM FOREST: TREE-COUNT TUNING WITH 5-FOLD SPATIAL CV
// ============================================================================
// The final blind reference samples are NOT used here.

if (false) {

  // First RF tuning stage: compare only the number of trees.
  var RF_TREE_VALUES = [
    100,
    300,
    500
  ];

  var rfTreeSummaryFeatures = [];
  var rfTreeFoldFeatures = [];

  RF_TREE_VALUES.forEach(function(numberOfTrees) {

    var configurationFoldFeatures = [];

    for (var fold = 0; fold < NUMBER_OF_SPATIAL_FOLDS; fold++) {

      var rfTrainingFold = opticalTrainingSamples.filter(
        ee.Filter.neq('spatial_fold', fold)
      );

      var rfValidationFold = opticalTrainingSamples.filter(
        ee.Filter.eq('spatial_fold', fold)
      );

      var rfClassifier = ee.Classifier.smileRandomForest({
        numberOfTrees: numberOfTrees,
        minLeafPopulation: 1,
        bagFraction: 0.5,
        seed: RANDOM_SEED
      }).train({
        features: rfTrainingFold,
        classProperty: 'reference_class',
        inputProperties: predictorBands
      });

      var rfValidated = rfValidationFold.classify(rfClassifier);

      var rfConfusionMatrix = rfValidated.errorMatrix(
        'reference_class',
        'classification',
        [0, 1]
      );

      var rfMatrixArray = rfConfusionMatrix.array();

      // Rows = actual classes; columns = predicted classes.
      var trueNegative = ee.Number(rfMatrixArray.get([0, 0]));
      var falsePositive = ee.Number(rfMatrixArray.get([0, 1]));
      var falseNegative = ee.Number(rfMatrixArray.get([1, 0]));
      var truePositive = ee.Number(rfMatrixArray.get([1, 1]));

      var precisionDenominator = truePositive.add(falsePositive);
      var recallDenominator = truePositive.add(falseNegative);

      var floodPrecision = ee.Number(
        ee.Algorithms.If(
          precisionDenominator.gt(0),
          truePositive.divide(precisionDenominator),
          0
        )
      );

      var floodRecall = ee.Number(
        ee.Algorithms.If(
          recallDenominator.gt(0),
          truePositive.divide(recallDenominator),
          0
        )
      );

      var f1Denominator = floodPrecision.add(floodRecall);

      var floodF1 = ee.Number(
        ee.Algorithms.If(
          f1Denominator.gt(0),
          floodPrecision
            .multiply(floodRecall)
            .multiply(2)
            .divide(f1Denominator),
          0
        )
      );

      var foldResult = ee.Feature(null, {
        configuration_id: 'RF_T' + numberOfTrees,
        number_of_trees: numberOfTrees,
        spatial_fold: fold,

        flood_precision: floodPrecision,
        flood_recall: floodRecall,
        flood_f1: floodF1,

        overall_accuracy: rfConfusionMatrix.accuracy(),
        kappa: rfConfusionMatrix.kappa(),

        true_negative: trueNegative,
        false_positive: falsePositive,
        false_negative: falseNegative,
        true_positive: truePositive,

        validation_count: rfValidationFold.size()
      });

      configurationFoldFeatures.push(foldResult);
      rfTreeFoldFeatures.push(foldResult);
    }

    var configurationResults = ee.FeatureCollection(
      configurationFoldFeatures
    );

    var summaryResult = ee.Feature(null, {
      configuration_id: 'RF_T' + numberOfTrees,
      number_of_trees: numberOfTrees,

      mean_flood_f1:
        configurationResults.aggregate_mean('flood_f1'),

      mean_flood_precision:
        configurationResults.aggregate_mean('flood_precision'),

      mean_flood_recall:
        configurationResults.aggregate_mean('flood_recall'),

      mean_overall_accuracy:
        configurationResults.aggregate_mean('overall_accuracy'),

      mean_kappa:
        configurationResults.aggregate_mean('kappa'),

      sd_flood_f1:
        configurationResults.aggregate_total_sd('flood_f1'),

      total_false_positive:
        configurationResults.aggregate_sum('false_positive'),

      total_false_negative:
        configurationResults.aggregate_sum('false_negative')
    });

    rfTreeSummaryFeatures.push(summaryResult);
  });

  var rfTreeTuningSummary = ee.FeatureCollection(
    rfTreeSummaryFeatures
  ).sort('mean_flood_f1', false);

  var bestRfTreeConfiguration = ee.Feature(
    rfTreeTuningSummary.first()
  );

  var bestRfTreeCount = bestRfTreeConfiguration.get(
    'number_of_trees'
  );

  print(
    'RF tree-count tuning — ranked by mean flood F1',
    rfTreeTuningSummary
  );

  print(
    'Best RF tree-count configuration',
    bestRfTreeConfiguration
  );

  print(
    'Best RF tree count — five individual folds',
    ee.FeatureCollection(rfTreeFoldFeatures).filter(
      ee.Filter.eq('number_of_trees', bestRfTreeCount)
    )
  );
}

// ============================================================================
// 12 — RANDOM FOREST: VARIABLES-PER-SPLIT TUNING WITH 5-FOLD SPATIAL CV
// ============================================================================
// numberOfTrees is fixed at 300.
// minLeafPopulation is fixed at 1.
// bagFraction is fixed at 0.5.
// Final blind reference samples are NOT used here.

if (false) {

  var RF_FIXED_TREE_COUNT = 300;

  // With 21 predictors, sqrt(21) is approximately 4.58.
  // Test the nearest integer and two surrounding values.
  var RF_MTRY_VALUES = [
    3,
    5,
    7
  ];

  var rfMtrySummaryFeatures = [];
  var rfMtryFoldFeatures = [];

  RF_MTRY_VALUES.forEach(function(variablesPerSplit) {

    var configurationFoldFeatures = [];

    for (
      var fold = 0;
      fold < NUMBER_OF_SPATIAL_FOLDS;
      fold++
    ) {

      var rfTrainingFold = opticalTrainingSamples.filter(
        ee.Filter.neq('spatial_fold', fold)
      );

      var rfValidationFold = opticalTrainingSamples.filter(
        ee.Filter.eq('spatial_fold', fold)
      );

      var rfClassifier = ee.Classifier.smileRandomForest({
        numberOfTrees: RF_FIXED_TREE_COUNT,
        variablesPerSplit: variablesPerSplit,
        minLeafPopulation: 1,
        bagFraction: 0.5,
        seed: RANDOM_SEED
      }).train({
        features: rfTrainingFold,
        classProperty: 'reference_class',
        inputProperties: predictorBands
      });

      var rfValidated = rfValidationFold.classify(
        rfClassifier
      );

      var rfConfusionMatrix = rfValidated.errorMatrix(
        'reference_class',
        'classification',
        [0, 1]
      );

      var rfMatrixArray = rfConfusionMatrix.array();

      // Rows = actual classes; columns = predicted classes.
      var trueNegative = ee.Number(
        rfMatrixArray.get([0, 0])
      );

      var falsePositive = ee.Number(
        rfMatrixArray.get([0, 1])
      );

      var falseNegative = ee.Number(
        rfMatrixArray.get([1, 0])
      );

      var truePositive = ee.Number(
        rfMatrixArray.get([1, 1])
      );

      var precisionDenominator = truePositive.add(
        falsePositive
      );

      var recallDenominator = truePositive.add(
        falseNegative
      );

      var floodPrecision = ee.Number(
        ee.Algorithms.If(
          precisionDenominator.gt(0),
          truePositive.divide(precisionDenominator),
          0
        )
      );

      var floodRecall = ee.Number(
        ee.Algorithms.If(
          recallDenominator.gt(0),
          truePositive.divide(recallDenominator),
          0
        )
      );

      var f1Denominator = floodPrecision.add(
        floodRecall
      );

      var floodF1 = ee.Number(
        ee.Algorithms.If(
          f1Denominator.gt(0),
          floodPrecision
            .multiply(floodRecall)
            .multiply(2)
            .divide(f1Denominator),
          0
        )
      );

      var foldResult = ee.Feature(null, {
        configuration_id:
          'RF_T300_M' + variablesPerSplit,

        number_of_trees:
          RF_FIXED_TREE_COUNT,

        variables_per_split:
          variablesPerSplit,

        spatial_fold:
          fold,

        flood_precision:
          floodPrecision,

        flood_recall:
          floodRecall,

        flood_f1:
          floodF1,

        overall_accuracy:
          rfConfusionMatrix.accuracy(),

        kappa:
          rfConfusionMatrix.kappa(),

        true_negative:
          trueNegative,

        false_positive:
          falsePositive,

        false_negative:
          falseNegative,

        true_positive:
          truePositive,

        validation_count:
          rfValidationFold.size()
      });

      configurationFoldFeatures.push(foldResult);
      rfMtryFoldFeatures.push(foldResult);
    }

    var configurationResults = ee.FeatureCollection(
      configurationFoldFeatures
    );

    var summaryResult = ee.Feature(null, {
      configuration_id:
        'RF_T300_M' + variablesPerSplit,

      number_of_trees:
        RF_FIXED_TREE_COUNT,

      variables_per_split:
        variablesPerSplit,

      mean_flood_f1:
        configurationResults.aggregate_mean(
          'flood_f1'
        ),

      mean_flood_precision:
        configurationResults.aggregate_mean(
          'flood_precision'
        ),

      mean_flood_recall:
        configurationResults.aggregate_mean(
          'flood_recall'
        ),

      mean_overall_accuracy:
        configurationResults.aggregate_mean(
          'overall_accuracy'
        ),

      mean_kappa:
        configurationResults.aggregate_mean(
          'kappa'
        ),

      sd_flood_f1:
        configurationResults.aggregate_total_sd(
          'flood_f1'
        ),

      total_false_positive:
        configurationResults.aggregate_sum(
          'false_positive'
        ),

      total_false_negative:
        configurationResults.aggregate_sum(
          'false_negative'
        )
    });

    rfMtrySummaryFeatures.push(summaryResult);
  });

  var rfMtryTuningSummary = ee.FeatureCollection(
    rfMtrySummaryFeatures
  ).sort(
    'mean_flood_f1',
    false
  );

  var bestRfMtryConfiguration = ee.Feature(
    rfMtryTuningSummary.first()
  );

  var bestRfMtry = bestRfMtryConfiguration.get(
    'variables_per_split'
  );

  print(
    'RF variables-per-split tuning — ranked by mean flood F1',
    rfMtryTuningSummary
  );

  print(
    'Best RF variables-per-split configuration',
    bestRfMtryConfiguration
  );

  print(
    'Best RF variables-per-split — five individual folds',
    ee.FeatureCollection(rfMtryFoldFeatures).filter(
      ee.Filter.eq(
        'variables_per_split',
        bestRfMtry
      )
    )
  );
}
// ============================================================================
// 13 — RANDOM FOREST: MINIMUM-LEAF TUNING WITH 5-FOLD SPATIAL CV
// ============================================================================
// Fixed parameters:
// numberOfTrees = 300
// variablesPerSplit = 3
// bagFraction = 0.5
// Final blind reference samples are NOT used here.

if (false) {

  var RF_FIXED_TREE_COUNT = 300;
  var RF_FIXED_MTRY = 3;

  var RF_MIN_LEAF_VALUES = [
    1,
    2,
    5,
    10
  ];

  var rfLeafSummaryFeatures = [];
  var rfLeafFoldFeatures = [];

  RF_MIN_LEAF_VALUES.forEach(function(minLeafPopulation) {

    var configurationFoldFeatures = [];

    for (
      var fold = 0;
      fold < NUMBER_OF_SPATIAL_FOLDS;
      fold++
    ) {

      var rfTrainingFold = opticalTrainingSamples.filter(
        ee.Filter.neq('spatial_fold', fold)
      );

      var rfValidationFold = opticalTrainingSamples.filter(
        ee.Filter.eq('spatial_fold', fold)
      );

      var rfClassifier = ee.Classifier.smileRandomForest({
        numberOfTrees: RF_FIXED_TREE_COUNT,
        variablesPerSplit: RF_FIXED_MTRY,
        minLeafPopulation: minLeafPopulation,
        bagFraction: 0.5,
        seed: RANDOM_SEED
      }).train({
        features: rfTrainingFold,
        classProperty: 'reference_class',
        inputProperties: predictorBands
      });

      var rfValidated = rfValidationFold.classify(
        rfClassifier
      );

      var rfConfusionMatrix = rfValidated.errorMatrix(
        'reference_class',
        'classification',
        [0, 1]
      );

      var rfMatrixArray = rfConfusionMatrix.array();

      // Rows = actual classes; columns = predicted classes.
      var trueNegative = ee.Number(
        rfMatrixArray.get([0, 0])
      );

      var falsePositive = ee.Number(
        rfMatrixArray.get([0, 1])
      );

      var falseNegative = ee.Number(
        rfMatrixArray.get([1, 0])
      );

      var truePositive = ee.Number(
        rfMatrixArray.get([1, 1])
      );

      var precisionDenominator = truePositive.add(
        falsePositive
      );

      var recallDenominator = truePositive.add(
        falseNegative
      );

      var floodPrecision = ee.Number(
        ee.Algorithms.If(
          precisionDenominator.gt(0),
          truePositive.divide(precisionDenominator),
          0
        )
      );

      var floodRecall = ee.Number(
        ee.Algorithms.If(
          recallDenominator.gt(0),
          truePositive.divide(recallDenominator),
          0
        )
      );

      var f1Denominator = floodPrecision.add(
        floodRecall
      );

      var floodF1 = ee.Number(
        ee.Algorithms.If(
          f1Denominator.gt(0),
          floodPrecision
            .multiply(floodRecall)
            .multiply(2)
            .divide(f1Denominator),
          0
        )
      );

      var foldResult = ee.Feature(null, {
        configuration_id:
          'RF_T300_M3_L' + minLeafPopulation,

        number_of_trees:
          RF_FIXED_TREE_COUNT,

        variables_per_split:
          RF_FIXED_MTRY,

        min_leaf_population:
          minLeafPopulation,

        spatial_fold:
          fold,

        flood_precision:
          floodPrecision,

        flood_recall:
          floodRecall,

        flood_f1:
          floodF1,

        overall_accuracy:
          rfConfusionMatrix.accuracy(),

        kappa:
          rfConfusionMatrix.kappa(),

        true_negative:
          trueNegative,

        false_positive:
          falsePositive,

        false_negative:
          falseNegative,

        true_positive:
          truePositive,

        validation_count:
          rfValidationFold.size()
      });

      configurationFoldFeatures.push(foldResult);
      rfLeafFoldFeatures.push(foldResult);
    }

    var configurationResults = ee.FeatureCollection(
      configurationFoldFeatures
    );

    var summaryResult = ee.Feature(null, {
      configuration_id:
        'RF_T300_M3_L' + minLeafPopulation,

      number_of_trees:
        RF_FIXED_TREE_COUNT,

      variables_per_split:
        RF_FIXED_MTRY,

      min_leaf_population:
        minLeafPopulation,

      mean_flood_f1:
        configurationResults.aggregate_mean(
          'flood_f1'
        ),

      mean_flood_precision:
        configurationResults.aggregate_mean(
          'flood_precision'
        ),

      mean_flood_recall:
        configurationResults.aggregate_mean(
          'flood_recall'
        ),

      mean_overall_accuracy:
        configurationResults.aggregate_mean(
          'overall_accuracy'
        ),

      mean_kappa:
        configurationResults.aggregate_mean(
          'kappa'
        ),

      sd_flood_f1:
        configurationResults.aggregate_total_sd(
          'flood_f1'
        ),

      total_false_positive:
        configurationResults.aggregate_sum(
          'false_positive'
        ),

      total_false_negative:
        configurationResults.aggregate_sum(
          'false_negative'
        )
    });

    rfLeafSummaryFeatures.push(summaryResult);
  });

  var rfLeafTuningSummary = ee.FeatureCollection(
    rfLeafSummaryFeatures
  ).sort(
    'mean_flood_f1',
    false
  );

  var bestRfLeafConfiguration = ee.Feature(
    rfLeafTuningSummary.first()
  );

  var bestRfMinLeaf = bestRfLeafConfiguration.get(
    'min_leaf_population'
  );

  print(
    'RF minimum-leaf tuning — ranked by mean flood F1',
    rfLeafTuningSummary
  );

  print(
    'Best RF minimum-leaf configuration',
    bestRfLeafConfiguration
  );

  print(
    'Best RF minimum-leaf — five individual folds',
    ee.FeatureCollection(rfLeafFoldFeatures).filter(
      ee.Filter.eq(
        'min_leaf_population',
        bestRfMinLeaf
      )
    )
  );
}
// -----------------------------------------------------------------------------
// 14 — RF BAG-FRACTION TUNING WITH 5-FOLD SPATIAL CROSS-VALIDATION
// -----------------------------------------------------------------------------
// Fixed parameters from the previous tuning stages:
// numberOfTrees = 300
// variablesPerSplit = 3
// minLeafPopulation = 1
// -----------------------------------------------------------------------------

if (false) {

  // Candidate fractions of training samples used for each tree.
  var RF_BAG_FRACTION_VALUES = [
    0.50,
    0.632,
    0.70,
    0.80
  ];

  var rfBagFractionSummaryFeatures = [];
  var rfBagFractionFoldFeatures = [];

  RF_BAG_FRACTION_VALUES.forEach(function(bagFraction) {

    // Convert decimal point to "p" for a readable configuration name.
    var bagFractionLabel =
      String(bagFraction).replace('.', 'p');

    var configurationId =
      'RF_T300_M3_L1_B' + bagFractionLabel;

    var configurationFoldFeatures = [];

    // -------------------------------------------------------------------------
    // Evaluate the current bag fraction over the five spatial folds.
    // -------------------------------------------------------------------------

    for (
      var foldId = 0;
      foldId < NUMBER_OF_SPATIAL_FOLDS;
      foldId++
    ) {

      // Use four spatial folds for training.
      var trainingFold = opticalTrainingSamples.filter(
        ee.Filter.neq('spatial_fold', foldId)
      );

      // Use the remaining spatial fold for validation.
      var validationFold = opticalTrainingSamples.filter(
        ee.Filter.eq('spatial_fold', foldId)
      );

      // Train RF using the previously selected parameters.
      var rfClassifier =
        ee.Classifier.smileRandomForest({
          numberOfTrees: 300,
          variablesPerSplit: 3,
          minLeafPopulation: 1,
          bagFraction: bagFraction,
          seed: RANDOM_SEED
        })
        .train({
          features: trainingFold,
          classProperty: 'reference_class',
          inputProperties: predictorBands
        });

      // Classify the validation fold.
      var rfValidated =
        validationFold.classify(rfClassifier);

      // Build the binary confusion matrix:
      // rows = actual classes
      // columns = predicted classes
      var rfConfusionMatrix = rfValidated.errorMatrix(
        'reference_class',
        'classification',
        [0, 1]
      );

      var rfMatrixArray =
        rfConfusionMatrix.array();

      // Confusion-matrix components.
      var trueNegative = ee.Number(
        rfMatrixArray.get([0, 0])
      );

      var falsePositive = ee.Number(
        rfMatrixArray.get([0, 1])
      );

      var falseNegative = ee.Number(
        rfMatrixArray.get([1, 0])
      );

      var truePositive = ee.Number(
        rfMatrixArray.get([1, 1])
      );

      // -----------------------------------------------------------------------
      // Flood-class metrics
      // -----------------------------------------------------------------------

      var precisionDenominator =
        truePositive.add(falsePositive);

      var recallDenominator =
        truePositive.add(falseNegative);

      var floodPrecision = ee.Number(
        ee.Algorithms.If(
          precisionDenominator.gt(0),
          truePositive.divide(
            precisionDenominator
          ),
          0
        )
      );

      var floodRecall = ee.Number(
        ee.Algorithms.If(
          recallDenominator.gt(0),
          truePositive.divide(
            recallDenominator
          ),
          0
        )
      );

      var f1Denominator =
        floodPrecision.add(floodRecall);

      var floodF1 = ee.Number(
        ee.Algorithms.If(
          f1Denominator.gt(0),
          floodPrecision
            .multiply(floodRecall)
            .multiply(2)
            .divide(f1Denominator),
          0
        )
      );

      // Save the result of the current fold.
      var foldResult = ee.Feature(null, {
        configuration_id: configurationId,

        number_of_trees: 300,
        variables_per_split: 3,
        min_leaf_population: 1,
        bag_fraction: bagFraction,

        spatial_fold: foldId,

        flood_precision: floodPrecision,
        flood_recall: floodRecall,
        flood_f1: floodF1,

        overall_accuracy:
          rfConfusionMatrix.accuracy(),

        kappa:
          rfConfusionMatrix.kappa(),

        true_negative: trueNegative,
        false_positive: falsePositive,
        false_negative: falseNegative,
        true_positive: truePositive,

        validation_count:
          validationFold.size()
      });

      configurationFoldFeatures.push(
        foldResult
      );

      rfBagFractionFoldFeatures.push(
        foldResult
      );
    }

    // -------------------------------------------------------------------------
    // Summarize the five folds for the current bag fraction.
    // -------------------------------------------------------------------------

    var configurationResults =
      ee.FeatureCollection(
        configurationFoldFeatures
      );

    var summaryResult = ee.Feature(null, {
      configuration_id: configurationId,

      number_of_trees: 300,
      variables_per_split: 3,
      min_leaf_population: 1,
      bag_fraction: bagFraction,

      mean_flood_f1:
        configurationResults.aggregate_mean(
          'flood_f1'
        ),

      mean_flood_precision:
        configurationResults.aggregate_mean(
          'flood_precision'
        ),

      mean_flood_recall:
        configurationResults.aggregate_mean(
          'flood_recall'
        ),

      mean_overall_accuracy:
        configurationResults.aggregate_mean(
          'overall_accuracy'
        ),

      mean_kappa:
        configurationResults.aggregate_mean(
          'kappa'
        ),

      sd_flood_f1:
        configurationResults.aggregate_total_sd(
          'flood_f1'
        ),

      total_false_negative:
        configurationResults.aggregate_sum(
          'false_negative'
        ),

      total_false_positive:
        configurationResults.aggregate_sum(
          'false_positive'
        )
    });

    rfBagFractionSummaryFeatures.push(
      summaryResult
    );
  });

  // ---------------------------------------------------------------------------
  // Rank all tested bag fractions by mean flood-class F1.
  // ---------------------------------------------------------------------------

  var rfBagFractionSummary =
    ee.FeatureCollection(
      rfBagFractionSummaryFeatures
    )
    .sort(
      'mean_flood_f1',
      false
    );

  var rfBagFractionFoldResults =
    ee.FeatureCollection(
      rfBagFractionFoldFeatures
    );

  // Select the highest-ranked configuration.
  var bestRfBagFractionConfiguration =
    ee.Feature(
      rfBagFractionSummary.first()
    );

  var bestRfBagFraction =
    bestRfBagFractionConfiguration.get(
      'bag_fraction'
    );

  // ---------------------------------------------------------------------------
  // Console outputs
  // ---------------------------------------------------------------------------

  print(
    'RF bag-fraction tuning — ranked by mean flood F1',
    rfBagFractionSummary
  );

  print(
    'Best RF bag-fraction configuration',
    bestRfBagFractionConfiguration
  );

  print(
    'Best RF bag-fraction — five individual folds',
    rfBagFractionFoldResults.filter(
      ee.Filter.eq(
        'bag_fraction',
        bestRfBagFraction
      )
    )
  );
}
// -----------------------------------------------------------------------------
// 15 — TRAIN THE FINAL TUNED RF AND RBF-SVM MODELS
// -----------------------------------------------------------------------------
// RF selected parameters:
//   numberOfTrees = 300
//   variablesPerSplit = 3
//   minLeafPopulation = 1
//   bagFraction = 0.50
//
// RBF-SVM selected parameters:
//   gamma = 0.03125
//   cost = 16
//
// Both models are trained using all 1600 fixed training samples.
// The independent blind-validation samples are NOT used here.
// -----------------------------------------------------------------------------

var finalPredictorBandList =
  ee.List(predictorBands);

var finalTrainingSamples =
  opticalTrainingSamples;

print(
  'Final model training-sample count',
  finalTrainingSamples.size()
);


// -----------------------------------------------------------------------------
// 15A — CALCULATE FINAL SVM STANDARDIZATION PARAMETERS
// -----------------------------------------------------------------------------
// RF does not require predictor standardization.
// RBF-SVM is trained using standardized predictors.
//
// These means and standard deviations are calculated only from the fixed
// training samples. The same values must later be applied to:
//   1. the predictor image;
//   2. the independent blind-validation samples.
// -----------------------------------------------------------------------------

function calculateFinalSvmMeans(samples) {

  return ee.Dictionary.fromLists(
    finalPredictorBandList,

    finalPredictorBandList.map(
      function(bandName) {

        bandName = ee.String(bandName);

        return samples.aggregate_mean(
          bandName
        );
      }
    )
  );
}


function calculateFinalSvmStdDevs(samples) {

  return ee.Dictionary.fromLists(
    finalPredictorBandList,

    finalPredictorBandList.map(
      function(bandName) {

        bandName = ee.String(bandName);

        return ee.Number(
          samples.aggregate_total_sd(
            bandName
          )
        ).max(0.000001);
      }
    )
  );
}


var finalSvmPredictorMeans =
  calculateFinalSvmMeans(
    finalTrainingSamples
  );

var finalSvmPredictorStdDevs =
  calculateFinalSvmStdDevs(
    finalTrainingSamples
  );

print(
  'Final SVM predictor means',
  finalSvmPredictorMeans
);

print(
  'Final SVM predictor standard deviations',
  finalSvmPredictorStdDevs
);


// -----------------------------------------------------------------------------
// 15B — STANDARDIZE THE FINAL SVM TRAINING SAMPLES
// -----------------------------------------------------------------------------

function standardizeFinalSvmSamples(
  samples,
  predictorMeans,
  predictorStdDevs
) {

  return samples.map(
    function(sample) {

      var standardizedValues =
        ee.Dictionary.fromLists(

          finalPredictorBandList,

          finalPredictorBandList.map(
            function(bandName) {

              bandName =
                ee.String(bandName);

              var originalValue =
                ee.Number(
                  sample.get(bandName)
                );

              var predictorMean =
                ee.Number(
                  predictorMeans.get(
                    bandName
                  )
                );

              var predictorStdDev =
                ee.Number(
                  predictorStdDevs.get(
                    bandName
                  )
                );

              return originalValue
                .subtract(predictorMean)
                .divide(predictorStdDev);
            }
          )
        );

      return sample.set(
        standardizedValues
      );
    }
  );
}


var finalStandardizedSvmTrainingSamples =
  standardizeFinalSvmSamples(
    finalTrainingSamples,
    finalSvmPredictorMeans,
    finalSvmPredictorStdDevs
  );

print(
  'Final standardized SVM training-sample count',
  finalStandardizedSvmTrainingSamples.size()
);


// -----------------------------------------------------------------------------
// 15C — TRAIN THE FINAL RANDOM FOREST MODEL
// -----------------------------------------------------------------------------

var finalRfClassifier =
  ee.Classifier.smileRandomForest({
    numberOfTrees: 300,
    variablesPerSplit: 3,
    minLeafPopulation: 1,
    bagFraction: 0.50,
    seed: RANDOM_SEED
  })
  .train({
    features: finalTrainingSamples,
    classProperty: 'reference_class',
    inputProperties: finalPredictorBandList
  });

print(
  'Final tuned RF classifier',
  finalRfClassifier
);

print(
  'Final tuned RF model information',
  finalRfClassifier.explain()
);


// -----------------------------------------------------------------------------
// 15D — TRAIN THE FINAL RBF-SVM MODEL
// -----------------------------------------------------------------------------

var finalSvmClassifier =
  ee.Classifier.libsvm({
    svmType: 'C_SVC',
    kernelType: 'RBF',
    shrinking: true,
    gamma: 0.03125,
    cost: 16
  })
  .train({
    features:
      finalStandardizedSvmTrainingSamples,

    classProperty:
      'reference_class',

    inputProperties:
      finalPredictorBandList
  });

print(
  'Final tuned RBF-SVM classifier',
  finalSvmClassifier
);


// -----------------------------------------------------------------------------
// 15E — STANDARDIZE THE PREDICTOR IMAGE FOR THE FINAL SVM MODEL
// -----------------------------------------------------------------------------

function standardizeFinalSvmImage(
  image,
  predictorMeans,
  predictorStdDevs
) {

  var orderedPredictorImage =
    image.select(
      finalPredictorBandList
    );

  var predictorMeanImage =
    ee.Image.constant(

      finalPredictorBandList.map(
        function(bandName) {

          bandName =
            ee.String(bandName);

          return ee.Number(
            predictorMeans.get(
              bandName
            )
          );
        }
      )
    )
    .rename(
      finalPredictorBandList
    );

  var predictorStdDevImage =
    ee.Image.constant(

      finalPredictorBandList.map(
        function(bandName) {

          bandName =
            ee.String(bandName);

          return ee.Number(
            predictorStdDevs.get(
              bandName
            )
          );
        }
      )
    )
    .rename(
      finalPredictorBandList
    );

  return orderedPredictorImage
    .subtract(predictorMeanImage)
    .divide(predictorStdDevImage)
    .rename(finalPredictorBandList);
}


var finalStandardizedSvmPredictorImage =
  standardizeFinalSvmImage(
    predictorStackRaw,
    finalSvmPredictorMeans,
    finalSvmPredictorStdDevs
  );

print(
  'Final standardized SVM predictor-image bands',
  finalStandardizedSvmPredictorImage.bandNames()
);


// -----------------------------------------------------------------------------
// 15F — CREATE THE TWO FINAL RAW CLASSIFICATION IMAGES
// -----------------------------------------------------------------------------
// These are the raw machine-learning classifications.
// No post-classification filtering is applied at this stage.
// -----------------------------------------------------------------------------

var finalRfRawClassification =
  predictorStackRaw
    .select(finalPredictorBandList)
    .classify(
      finalRfClassifier,
      'rf_prediction'
    )
    .rename('rf_prediction')
    .toByte()
    .clip(geometry);


var finalSvmRawClassification =
  finalStandardizedSvmPredictorImage
    .classify(
      finalSvmClassifier,
      'svm_prediction'
    )
    .rename('svm_prediction')
    .toByte()
    .clip(geometry);


print(
  'Final RF raw-classification bands',
  finalRfRawClassification.bandNames()
);

print(
  'Final SVM raw-classification bands',
  finalSvmRawClassification.bandNames()
);


// -----------------------------------------------------------------------------
// 15G — OPTIONAL MAP DISPLAY
// -----------------------------------------------------------------------------

Map.addLayer(
  finalRfRawClassification.selfMask(),
  {
    min: 1,
    max: 1,
    palette: ['FF0000']
  },
  'Final tuned RF flood — raw',
  false
);

Map.addLayer(
  finalSvmRawClassification.selfMask(),
  {
    min: 1,
    max: 1,
    palette: ['FFFF00']
  },
  'Final tuned RBF-SVM flood — raw',
  false
);
// =============================================================================
// 16 — FINAL INDEPENDENT BLIND VALIDATION
// =============================================================================
//
// Scientific purpose:
//
// 1. The 240 manually labeled blind samples are used only for final evaluation.
// 2. They were never used for training or hyperparameter tuning.
// 3. Final labels are joined to the original blind-sample locations by sample_id.
// 4. Geometry from the uploaded CSV is deliberately ignored.
// 5. Baseline, RF and RBF-SVM are evaluated on exactly the same reference cells.
// 6. Both raw classifier outputs and final filtered maps are evaluated.
//
// =============================================================================


// Run the new final blind validation.
var RUN_TUNED_FINAL_BLIND_VALIDATION = true;


if (RUN_TUNED_FINAL_BLIND_VALIDATION) {


  // ===========================================================================
  // 16A — LOAD FINAL LABELS AND ORIGINAL BLIND LOCATIONS
  // ===========================================================================

  // Final manually labeled table.
  // We use only its attributes, not its geometry.
  var tunedBlindLabelTable =
    ee.FeatureCollection(FINAL_REFERENCE_ASSET);

  // Original blind samples.
  // These contain the original and correct point geometries.
  var tunedBlindSampleLocations =
    ee.FeatureCollection(BLIND_SAMPLE_ASSET);


  print(
    'Final blind label-row count',
    tunedBlindLabelTable.size()
  );

  print(
    'Original blind sample-location count',
    tunedBlindSampleLocations.size()
  );


  // ===========================================================================
  // 16B — JOIN LABELS TO ORIGINAL LOCATIONS USING sample_id
  // ===========================================================================

  var tunedBlindJoined = ee.FeatureCollection(
    ee.Join.saveFirst('matched_label').apply({
      primary: tunedBlindSampleLocations,
      secondary: tunedBlindLabelTable,

      condition: ee.Filter.equals({
        leftField: 'sample_id',
        rightField: 'sample_id'
      })
    })
  );


  // Keep only locations with a matching final manual label.
  var tunedBlindReferenceRaw =
    tunedBlindJoined
      .filter(ee.Filter.notNull(['matched_label']))
      .map(function(feature) {

        feature = ee.Feature(feature);

        var labelFeature =
          ee.Feature(feature.get('matched_label'));

        // Create a clean feature using only the original geometry.
        // The geometry of the uploaded CSV is not transferred.
        return ee.Feature(feature.geometry())
          .set(
            'sample_id',
            feature.get('sample_id')
          )
          .set(
            'reference_class',
            ee.Number(labelFeature.get('reference_class'))
          )
          .set(
            'class_name',
            labelFeature.get('class_name')
          )
          .set(
            'confidence',
            labelFeature.get('confidence')
          )
          .set(
            'label_order',
            labelFeature.get('label_order')
          );
      });


  print(
    'Matched final blind sample count',
    tunedBlindReferenceRaw.size()
  );

  print(
    'Final blind reference — usable class histogram',
    tunedBlindReferenceRaw
      .aggregate_histogram('reference_class')
  );


  // ===========================================================================
  // 16C — KEEP ONLY VALID BINARY REFERENCE CLASSES
  // ===========================================================================

  // Class definitions:
  // 0 = non-flood
  // 1 = flood
  //
  // Any uncertain class such as 9 is excluded from quantitative evaluation.

  var tunedBlindBinaryReference =
    tunedBlindReferenceRaw
      .filter(
        ee.Filter.inList(
          'reference_class',
          [0, 1]
        )
      );


  print(
    'Final blind binary-reference count',
    tunedBlindBinaryReference.size()
  );


  // ===========================================================================
  // 16D — CREATE APPROXIMATELY 30 × 30 m VALIDATION CELLS
  // ===========================================================================

  // The distance in buffer() is expressed in metres.
  // No explicit UTM transformation is used, which avoids the CSV CRS error.

  var tunedBlindReferenceCells =
    tunedBlindBinaryReference.map(function(feature) {

      feature = ee.Feature(feature);

      var originalPoint =
        feature.geometry();

      // Create a 15 m buffer around each point and obtain its rectangular bounds.
      // This produces an approximately 30 × 30 m validation footprint.
      var validationCell =
        originalPoint
          .buffer(15, 1)
          .bounds(1);

      return ee.Feature(
        validationCell,
        feature.toDictionary()
      );
    });


  print(
    'Final blind validation-cell count',
    tunedBlindReferenceCells.size()
  );


  // ===========================================================================
  // 16E — PREPARE THE FIVE FLOOD-MAP PRODUCTS
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // 1. Baseline threshold map
  // ---------------------------------------------------------------------------

  var tunedBaselineFlood =
    ee.Image(baselineFlood)
      .gt(0)
      .unmask(0)
      .rename('baseline_prediction')
      .toByte();


  // ---------------------------------------------------------------------------
  // 2. Raw tuned Random Forest output
  // ---------------------------------------------------------------------------

  var tunedFinalRfRawFlood =
    ee.Image(finalRfRawClassification)
      .eq(1)
      .unmask(0)
      .rename('rf_raw_prediction')
      .toByte();


  // ---------------------------------------------------------------------------
  // 3. Raw tuned RBF-SVM output
  // ---------------------------------------------------------------------------

  var tunedFinalSvmRawFlood =
    ee.Image(finalSvmRawClassification)
      .eq(1)
      .unmask(0)
      .rename('svm_raw_prediction')
      .toByte();


  // ===========================================================================
  // 16F — COMMON POST-CLASSIFICATION FILTERING FUNCTION
  // ===========================================================================

  // The same physical and spatial filters are applied to RF and RBF-SVM.
  //
  // The filters remove:
  // - permanent water;
  // - implausibly steep terrain;
  // - urban areas, where appropriate;
  // - isolated flood patches smaller than the selected minimum size.

  function createTunedFinalFilteredFloodMap(rawFloodImage) {

    var candidateFlood =
      ee.Image(rawFloodImage)
        .eq(1)
        .selfMask()
        .updateMask(nonPermanentWaterMask)
        .updateMask(lowSlopeMask)
        .updateMask(nonUrbanMask);


    var connectedPixelCount =
      candidateFlood.connectedPixelCount(
        100,
        true
      );


    var filteredFlood =
      candidateFlood
        .updateMask(
          connectedPixelCount.gte(
            MINIMUM_CONNECTED_PIXELS
          )
        )
        .unmask(0)
        .toByte();


    return filteredFlood;
  }


  // ---------------------------------------------------------------------------
  // 4. Final filtered Random Forest map
  // ---------------------------------------------------------------------------

  var tunedFinalRfFlood =
    createTunedFinalFilteredFloodMap(
      tunedFinalRfRawFlood
    )
      .rename('rf_final_prediction');


  // ---------------------------------------------------------------------------
  // 5. Final filtered RBF-SVM map
  // ---------------------------------------------------------------------------

  var tunedFinalSvmFlood =
    createTunedFinalFilteredFloodMap(
      tunedFinalSvmRawFlood
    )
      .rename('svm_final_prediction');


  // ===========================================================================
  // 16G — BUILD THE COMMON PREDICTION STACK
  // ===========================================================================

  var tunedBlindPredictionStack =
    ee.Image.cat([

      tunedBaselineFlood,

      tunedFinalRfRawFlood,

      tunedFinalSvmRawFlood,

      tunedFinalRfFlood,

      tunedFinalSvmFlood

    ])
      .unmask(0)
      .toByte()
      .clip(geometry);


  print(
    'Final blind validation — prediction-stack bands',
    tunedBlindPredictionStack.bandNames()
  );


  // ===========================================================================
  // 16H — EXTRACT PREDICTIONS WITHIN THE 30 m REFERENCE CELLS
  // ===========================================================================

  var tunedBlindValidationResults =
    tunedBlindPredictionStack.reduceRegions({

      collection: tunedBlindReferenceCells,

      reducer: ee.Reducer.mean(),

      scale: 10,

      tileScale: 4

    });


  // A cell is classified as flood when more than 50% of its evaluated pixels
  // are classified as flood.

  tunedBlindValidationResults =
    tunedBlindValidationResults.map(function(feature) {

      feature = ee.Feature(feature);

      var baselinePrediction =
        ee.Number(
          feature.get('baseline_prediction')
        ).gt(0.5);

      var rfRawPrediction =
        ee.Number(
          feature.get('rf_raw_prediction')
        ).gt(0.5);

      var svmRawPrediction =
        ee.Number(
          feature.get('svm_raw_prediction')
        ).gt(0.5);

      var rfFinalPrediction =
        ee.Number(
          feature.get('rf_final_prediction')
        ).gt(0.5);

      var svmFinalPrediction =
        ee.Number(
          feature.get('svm_final_prediction')
        ).gt(0.5);


      return feature
        .set(
          'baseline_prediction',
          baselinePrediction
        )
        .set(
          'rf_raw_prediction',
          rfRawPrediction
        )
        .set(
          'svm_raw_prediction',
          svmRawPrediction
        )
        .set(
          'rf_final_prediction',
          rfFinalPrediction
        )
        .set(
          'svm_final_prediction',
          svmFinalPrediction
        );
    });


  print(
    'Final blind validation — evaluated sample count',
    tunedBlindValidationResults.size()
  );


  // ===========================================================================
  // 16I — CREATE THE FIVE CONFUSION MATRICES
  // ===========================================================================

  var tunedBlindClassOrder =
    ee.List([0, 1]);


  var baselineFinalBlindMatrix =
    tunedBlindValidationResults.errorMatrix(
      'reference_class',
      'baseline_prediction',
      tunedBlindClassOrder
    );


  var rfRawFinalBlindMatrix =
    tunedBlindValidationResults.errorMatrix(
      'reference_class',
      'rf_raw_prediction',
      tunedBlindClassOrder
    );


  var svmRawFinalBlindMatrix =
    tunedBlindValidationResults.errorMatrix(
      'reference_class',
      'svm_raw_prediction',
      tunedBlindClassOrder
    );


  var rfFilteredFinalBlindMatrix =
    tunedBlindValidationResults.errorMatrix(
      'reference_class',
      'rf_final_prediction',
      tunedBlindClassOrder
    );


  var svmFilteredFinalBlindMatrix =
    tunedBlindValidationResults.errorMatrix(
      'reference_class',
      'svm_final_prediction',
      tunedBlindClassOrder
    );


  print(
    'Baseline — final blind confusion matrix [0, 1]',
    baselineFinalBlindMatrix
  );

  print(
    'Tuned RF raw — final blind confusion matrix [0, 1]',
    rfRawFinalBlindMatrix
  );

  print(
    'Tuned RBF-SVM raw — final blind confusion matrix [0, 1]',
    svmRawFinalBlindMatrix
  );

  print(
    'Tuned RF filtered — final blind confusion matrix [0, 1]',
    rfFilteredFinalBlindMatrix
  );

  print(
    'Tuned RBF-SVM filtered — final blind confusion matrix [0, 1]',
    svmFilteredFinalBlindMatrix
  );


  // ===========================================================================
  // 16J — METRIC FUNCTIONS
  // ===========================================================================

  function tunedBlindSafeDivide(numerator, denominator) {

    numerator =
      ee.Number(numerator);

    denominator =
      ee.Number(denominator);

    return ee.Number(
      ee.Algorithms.If(
        denominator.neq(0),
        numerator.divide(denominator),
        0
      )
    );
  }


  function buildTunedBlindMetricFeature(
    productName,
    predictionProperty
  ) {

    var matrix =
      tunedBlindValidationResults.errorMatrix(
        'reference_class',
        predictionProperty,
        tunedBlindClassOrder
      );


    // Matrix structure for order [0, 1]:
    //
    //               Predicted 0    Predicted 1
    // Actual 0          TN              FP
    // Actual 1          FN              TP

    var matrixArray =
      ee.Array(matrix.array());


    var trueNegative =
      ee.Number(
        matrixArray.get([0, 0])
      );

    var falsePositive =
      ee.Number(
        matrixArray.get([0, 1])
      );

    var falseNegative =
      ee.Number(
        matrixArray.get([1, 0])
      );

    var truePositive =
      ee.Number(
        matrixArray.get([1, 1])
      );


    var floodPrecision =
      tunedBlindSafeDivide(
        truePositive,
        truePositive.add(falsePositive)
      );


    var floodRecall =
      tunedBlindSafeDivide(
        truePositive,
        truePositive.add(falseNegative)
      );


    var floodF1 =
      ee.Number(
        ee.Algorithms.If(

          floodPrecision
            .add(floodRecall)
            .gt(0),

          floodPrecision
            .multiply(floodRecall)
            .multiply(2)
            .divide(
              floodPrecision.add(floodRecall)
            ),

          0
        )
      );


    var evaluatedCount =
      trueNegative
        .add(falsePositive)
        .add(falseNegative)
        .add(truePositive);


    return ee.Feature(null, {

      product_name:
        productName,

      prediction_property:
        predictionProperty,

      evaluated_sample_count:
        evaluatedCount,

      true_negative:
        trueNegative,

      false_positive:
        falsePositive,

      false_negative:
        falseNegative,

      true_positive:
        truePositive,

      overall_accuracy:
        matrix.accuracy(),

      kappa:
        matrix.kappa(),

      flood_precision:
        floodPrecision,

      flood_recall:
        floodRecall,

      flood_f1:
        floodF1
    });
  }


  // ===========================================================================
  // 16K — CREATE THE FINAL COMPARISON TABLE
  // ===========================================================================

  var tunedFinalBlindMetricTable =
    ee.FeatureCollection([

      buildTunedBlindMetricFeature(
        'Baseline threshold',
        'baseline_prediction'
      ),

      buildTunedBlindMetricFeature(
        'Tuned RF raw',
        'rf_raw_prediction'
      ),

      buildTunedBlindMetricFeature(
        'Tuned RBF-SVM raw',
        'svm_raw_prediction'
      ),

      buildTunedBlindMetricFeature(
        'Tuned RF filtered',
        'rf_final_prediction'
      ),

      buildTunedBlindMetricFeature(
        'Tuned RBF-SVM filtered',
        'svm_final_prediction'
      )

    ])
      .sort(
        'flood_f1',
        false
      );


  print(
    'FINAL INDEPENDENT BLIND VALIDATION — ranked by flood F1',
    tunedFinalBlindMetricTable
  );


  // ===========================================================================
  // 16L — OPTIONAL MAP DISPLAY
  // ===========================================================================

  Map.addLayer(
    tunedFinalRfFlood.selfMask(),
    {
      min: 1,
      max: 1,
      palette: ['FF0000']
    },
    'Final tuned RF flood — filtered',
    false
  );


  Map.addLayer(
    tunedFinalSvmFlood.selfMask(),
    {
      min: 1,
      max: 1,
      palette: ['FFFF00']
    },
    'Final tuned RBF-SVM flood — filtered',
    false
  );


  Map.addLayer(
    tunedBlindReferenceCells.style({
      color: 'FFFFFF',
      fillColor: 'FFFFFF20',
      width: 1
    }),
    {},
    'Final blind validation cells — approximately 30 m',
    false
  );

}

// =============================================================================
// 17 — DIAGNOSTIC TEST: CENTRE PIXEL VS 30 m MAJORITY EVALUATION
// =============================================================================
//
// Purpose:
//
// The final blind validation in Section 16 used an approximately 30 × 30 m cell.
// A sample was classified as flood only when more than 50% of that cell was flood.
//
// This diagnostic test evaluates the exact central 10 m pixel instead.
// No model parameter is changed.
// The blind reference labels are not used for retraining or tuning.
//
// =============================================================================


var RUN_BLIND_CENTRE_PIXEL_DIAGNOSTIC = true;


if (RUN_BLIND_CENTRE_PIXEL_DIAGNOSTIC) {


  // ===========================================================================
  // 17A — SAMPLE THE EXACT CENTRAL PIXEL
  // ===========================================================================

  var tunedBlindCentrePixelResults =
    tunedBlindPredictionStack.sampleRegions({

      collection:
        tunedBlindBinaryReference,

      properties: [
        'sample_id',
        'reference_class',
        'class_name',
        'confidence',
        'label_order'
      ],

      scale: 10,

      geometries: true,

      tileScale: 4
    });


  print(
    'Centre-pixel diagnostic — evaluated sample count',
    tunedBlindCentrePixelResults.size()
  );

  print(
    'Centre-pixel diagnostic — reference-class histogram',
    tunedBlindCentrePixelResults
      .aggregate_histogram('reference_class')
  );


  // ===========================================================================
  // 17B — CHECK HOW MANY 0 AND 1 PREDICTIONS EACH METHOD PRODUCED
  // ===========================================================================

  print(
    'Centre pixel — Baseline prediction histogram',
    tunedBlindCentrePixelResults
      .aggregate_histogram('baseline_prediction')
  );

  print(
    'Centre pixel — RF raw prediction histogram',
    tunedBlindCentrePixelResults
      .aggregate_histogram('rf_raw_prediction')
  );

  print(
    'Centre pixel — RBF-SVM raw prediction histogram',
    tunedBlindCentrePixelResults
      .aggregate_histogram('svm_raw_prediction')
  );

  print(
    'Centre pixel — RF filtered prediction histogram',
    tunedBlindCentrePixelResults
      .aggregate_histogram('rf_final_prediction')
  );

  print(
    'Centre pixel — RBF-SVM filtered prediction histogram',
    tunedBlindCentrePixelResults
      .aggregate_histogram('svm_final_prediction')
  );


  // ===========================================================================
  // 17C — CREATE CENTRE-PIXEL CONFUSION MATRICES
  // ===========================================================================

  var centrePixelClassOrder =
    ee.List([0, 1]);


  var centreBaselineMatrix =
    tunedBlindCentrePixelResults.errorMatrix(
      'reference_class',
      'baseline_prediction',
      centrePixelClassOrder
    );


  var centreRfRawMatrix =
    tunedBlindCentrePixelResults.errorMatrix(
      'reference_class',
      'rf_raw_prediction',
      centrePixelClassOrder
    );


  var centreSvmRawMatrix =
    tunedBlindCentrePixelResults.errorMatrix(
      'reference_class',
      'svm_raw_prediction',
      centrePixelClassOrder
    );


  var centreRfFilteredMatrix =
    tunedBlindCentrePixelResults.errorMatrix(
      'reference_class',
      'rf_final_prediction',
      centrePixelClassOrder
    );


  var centreSvmFilteredMatrix =
    tunedBlindCentrePixelResults.errorMatrix(
      'reference_class',
      'svm_final_prediction',
      centrePixelClassOrder
    );


  print(
    'Centre pixel — Baseline confusion matrix [0, 1]',
    centreBaselineMatrix
  );

  print(
    'Centre pixel — Tuned RF raw confusion matrix [0, 1]',
    centreRfRawMatrix
  );

  print(
    'Centre pixel — Tuned RBF-SVM raw confusion matrix [0, 1]',
    centreSvmRawMatrix
  );

  print(
    'Centre pixel — Tuned RF filtered confusion matrix [0, 1]',
    centreRfFilteredMatrix
  );

  print(
    'Centre pixel — Tuned RBF-SVM filtered confusion matrix [0, 1]',
    centreSvmFilteredMatrix
  );


  // ===========================================================================
  // 17D — METRIC FUNCTIONS
  // ===========================================================================

  function centrePixelSafeDivide(numerator, denominator) {

    numerator =
      ee.Number(numerator);

    denominator =
      ee.Number(denominator);

    return ee.Number(
      ee.Algorithms.If(
        denominator.neq(0),
        numerator.divide(denominator),
        0
      )
    );
  }


  function buildCentrePixelMetric(
    productName,
    predictionProperty
  ) {

    var matrix =
      tunedBlindCentrePixelResults.errorMatrix(
        'reference_class',
        predictionProperty,
        centrePixelClassOrder
      );


    // Matrix order:
    //
    //               Predicted 0    Predicted 1
    // Actual 0          TN              FP
    // Actual 1          FN              TP

    var matrixArray =
      ee.Array(matrix.array());


    var trueNegative =
      ee.Number(
        matrixArray.get([0, 0])
      );

    var falsePositive =
      ee.Number(
        matrixArray.get([0, 1])
      );

    var falseNegative =
      ee.Number(
        matrixArray.get([1, 0])
      );

    var truePositive =
      ee.Number(
        matrixArray.get([1, 1])
      );


    var floodPrecision =
      centrePixelSafeDivide(
        truePositive,
        truePositive.add(falsePositive)
      );


    var floodRecall =
      centrePixelSafeDivide(
        truePositive,
        truePositive.add(falseNegative)
      );


    var floodF1 =
      ee.Number(
        ee.Algorithms.If(

          floodPrecision
            .add(floodRecall)
            .gt(0),

          floodPrecision
            .multiply(floodRecall)
            .multiply(2)
            .divide(
              floodPrecision.add(floodRecall)
            ),

          0
        )
      );


    var evaluatedSampleCount =
      trueNegative
        .add(falsePositive)
        .add(falseNegative)
        .add(truePositive);


    return ee.Feature(null, {

      evaluation_method:
        'Exact central 10 m pixel',

      product_name:
        productName,

      prediction_property:
        predictionProperty,

      evaluated_sample_count:
        evaluatedSampleCount,

      true_negative:
        trueNegative,

      false_positive:
        falsePositive,

      false_negative:
        falseNegative,

      true_positive:
        truePositive,

      overall_accuracy:
        matrix.accuracy(),

      kappa:
        matrix.kappa(),

      flood_precision:
        floodPrecision,

      flood_recall:
        floodRecall,

      flood_f1:
        floodF1
    });
  }


  // ===========================================================================
  // 17E — CREATE CENTRE-PIXEL COMPARISON TABLE
  // ===========================================================================

  var centrePixelDiagnosticMetricTable =
    ee.FeatureCollection([

      buildCentrePixelMetric(
        'Baseline threshold',
        'baseline_prediction'
      ),

      buildCentrePixelMetric(
        'Tuned RF raw',
        'rf_raw_prediction'
      ),

      buildCentrePixelMetric(
        'Tuned RBF-SVM raw',
        'svm_raw_prediction'
      ),

      buildCentrePixelMetric(
        'Tuned RF filtered',
        'rf_final_prediction'
      ),

      buildCentrePixelMetric(
        'Tuned RBF-SVM filtered',
        'svm_final_prediction'
      )

    ])
      .sort(
        'flood_f1',
        false
      );


  print(
    'CENTRE-PIXEL BLIND DIAGNOSTIC — ranked by flood F1',
    centrePixelDiagnosticMetricTable
  );


  // ===========================================================================
  // 17F — OPTIONAL DISPLAY OF THE ORIGINAL BLIND POINTS
  // ===========================================================================

  Map.addLayer(
    tunedBlindBinaryReference.style({
      color: '00FFFF',
      pointSize: 4,
      width: 1
    }),
    {},
    'Final blind reference — original centre points',
    false
  );

}
// =============================================================================
// 18 — DIAGNOSTIC TEST: PREDICTOR AND CLASSIFIER MASK COVERAGE
// =============================================================================
//
// Purpose:
//
// Check whether one or more predictor bands are masked at the independent
// blind-reference locations.
//
// No training, tuning or model modification is performed.
//
// =============================================================================


var RUN_PREDICTOR_MASK_DIAGNOSTIC = false;


if (RUN_PREDICTOR_MASK_DIAGNOSTIC) {


  // ===========================================================================
  // 18A — PREPARE THE FINAL PREDICTOR IMAGE
  // ===========================================================================

  var maskDiagnosticBandList =
    ee.List(finalPredictorBandList);


  var maskDiagnosticPredictorImage =
    predictorStackRaw.select(
      maskDiagnosticBandList
    );


  print(
    'Mask diagnostic — predictor-band count',
    maskDiagnosticBandList.size()
  );

  print(
    'Mask diagnostic — predictor-band names',
    maskDiagnosticPredictorImage.bandNames()
  );


  // ===========================================================================
  // 18B — CHECK WHETHER ALL 21 PREDICTORS ARE VALID
  // ===========================================================================

  // Value 1 means every predictor is valid.
  // Value 0 means at least one predictor is masked.

  var allPredictorsValidMask =
    maskDiagnosticPredictorImage
      .mask()
      .gt(0)
      .reduce(ee.Reducer.min())
      .unmask(0)
      .rename('all_predictors_valid')
      .toByte();


  var blindAllPredictorsValidity =
    allPredictorsValidMask.sampleRegions({

      collection:
        tunedBlindBinaryReference,

      properties: [
        'sample_id',
        'reference_class'
      ],

      scale: 10,

      geometries: true,

      tileScale: 4
    });


  print(
    'Mask diagnostic — blind sample count',
    blindAllPredictorsValidity.size()
  );

  print(
    'Mask diagnostic — all predictors valid histogram',
    blindAllPredictorsValidity
      .aggregate_histogram('all_predictors_valid')
  );
var maskValidityByReferenceClass =
  blindAllPredictorsValidity.map(function(feature) {
    feature = ee.Feature(feature);

    var key = ee.Number(feature.get('reference_class'))
      .format()
      .cat('_')
      .cat(
        ee.Number(feature.get('all_predictors_valid')).format()
      );

    return feature.set('reference_validity_key', key);
  });

print(
  'Mask diagnostic — reference class x predictor validity',
  maskValidityByReferenceClass.aggregate_histogram(
    'reference_validity_key'
  )
);

  // ===========================================================================
  // 18C — CHECK THE MASK OF EACH INDIVIDUAL PREDICTOR BAND
  // ===========================================================================

  var predictorValidityBandNames =
    maskDiagnosticBandList.map(function(bandName) {

      return ee.String('valid__')
        .cat(ee.String(bandName));
    });


  var predictorValidityImage =
    maskDiagnosticPredictorImage
      .mask()
      .gt(0)
      .unmask(0)
      .rename(predictorValidityBandNames)
      .toByte();


  var predictorValidityAtBlind =
    predictorValidityImage.sampleRegions({

      collection:
        tunedBlindBinaryReference,

      properties: [
        'sample_id',
        'reference_class'
      ],

      scale: 10,

      geometries: false,

      tileScale: 4
    });


  var totalBlindDiagnosticCount =
    tunedBlindBinaryReference.size();


  var perBandMaskDiagnosticTable =
    ee.FeatureCollection(

      maskDiagnosticBandList
        .zip(predictorValidityBandNames)
        .map(function(pair) {

          pair = ee.List(pair);

          var predictorBandName =
            ee.String(pair.get(0));

          var validityPropertyName =
            ee.String(pair.get(1));

          var validCount =
            ee.Number(
              predictorValidityAtBlind.aggregate_sum(
                validityPropertyName
              )
            );

          var missingCount =
            ee.Number(totalBlindDiagnosticCount)
              .subtract(validCount);


          return ee.Feature(null, {

            predictor_band:
              predictorBandName,

            total_blind_samples:
              totalBlindDiagnosticCount,

            valid_blind_samples:
              validCount,

            masked_blind_samples:
              missingCount,

            valid_fraction:
              validCount.divide(
                totalBlindDiagnosticCount
              )
          });
        })
    )
      .sort(
        'masked_blind_samples',
        false
      );


  print(
    'Mask diagnostic — predictor bands ranked by missing Blind values',
    perBandMaskDiagnosticTable
  );


  // ===========================================================================
  // 18D — CHECK WHETHER FINAL RF AND SVM OUTPUTS ARE MASKED
  // ===========================================================================

  var classifierOutputValidityImage =
    ee.Image.cat([

      ee.Image(finalRfRawClassification)
        .mask()
        .gt(0)
        .reduce(ee.Reducer.min())
        .unmask(0)
        .rename('rf_output_valid'),

      ee.Image(finalSvmRawClassification)
        .mask()
        .gt(0)
        .reduce(ee.Reducer.min())
        .unmask(0)
        .rename('svm_output_valid')

    ])
      .toByte();


  var classifierOutputValidityAtBlind =
    classifierOutputValidityImage.sampleRegions({

      collection:
        tunedBlindBinaryReference,

      properties: [
        'sample_id',
        'reference_class'
      ],

      scale: 10,

      geometries: false,

      tileScale: 4
    });


  print(
    'Mask diagnostic — RF output-valid histogram',
    classifierOutputValidityAtBlind
      .aggregate_histogram('rf_output_valid')
  );

  print(
    'Mask diagnostic — SVM output-valid histogram',
    classifierOutputValidityAtBlind
      .aggregate_histogram('svm_output_valid')
  );

}
// =============================================================================
// 19 — FINAL SPATIAL COMPARISON — LIGHTWEIGHT VERSION
// =============================================================================

var RUN_FINAL_SPATIAL_COMPARISON = false;

if (RUN_FINAL_SPATIAL_COMPARISON) {

  // This scale is used only for the spatial-comparison diagnostic.
  // Exact final areas will be calculated from the exported 10 m GeoTIFF.
  var COMPARISON_SCALE_METERS = 30;


  // ===========================================================================
  // 19A — CREATE ONE FIVE-BAND PRODUCT STACK
  // ===========================================================================

  var finalComparisonStack = ee.Image.cat([

    tunedBaselineFlood.rename('baseline'),

    tunedFinalRfRawFlood.rename('rf_raw'),

    tunedFinalSvmRawFlood.rename('svm_raw'),

    tunedFinalRfFlood.rename('rf_filtered'),

    tunedFinalSvmFlood.rename('svm_filtered')

  ])
    .unmask(0)
    .toByte()
    .clip(geometry);


  // ===========================================================================
  // 19B — CALCULATE ALL FIVE AREAS IN ONE OPERATION
  // ===========================================================================

  var floodAreaImage =
    finalComparisonStack
      .multiply(ee.Image.pixelArea());


  var floodAreaDictionary =
    floodAreaImage.reduceRegion({

      reducer: ee.Reducer.sum(),

      geometry: geometry,

      scale: COMPARISON_SCALE_METERS,

      crs: 'EPSG:32639',

      maxPixels: 1e10,

      tileScale: 16

    });


  var finalFloodAreaTable =
    ee.FeatureCollection([

      ee.Feature(null, {
        product_name: 'Baseline threshold',
        estimated_flood_area_km2:
          ee.Number(
            floodAreaDictionary.get('baseline')
          ).divide(1e6)
      }),

      ee.Feature(null, {
        product_name: 'Tuned RF raw',
        estimated_flood_area_km2:
          ee.Number(
            floodAreaDictionary.get('rf_raw')
          ).divide(1e6)
      }),

      ee.Feature(null, {
        product_name: 'Tuned RBF-SVM raw',
        estimated_flood_area_km2:
          ee.Number(
            floodAreaDictionary.get('svm_raw')
          ).divide(1e6)
      }),

      ee.Feature(null, {
        product_name: 'Tuned RF filtered',
        estimated_flood_area_km2:
          ee.Number(
            floodAreaDictionary.get('rf_filtered')
          ).divide(1e6)
      }),

      ee.Feature(null, {
        product_name: 'Tuned RBF-SVM filtered',
        estimated_flood_area_km2:
          ee.Number(
            floodAreaDictionary.get('svm_filtered')
          ).divide(1e6)
      })

    ]);


  print(
    'FINAL FLOOD-AREA COMPARISON — 30 m diagnostic estimate',
    finalFloodAreaTable
  );


  // ===========================================================================
  // 19C — RF AND SVM FILTERED AGREEMENT
  // ===========================================================================

  var rfFiltered =
    ee.Image(tunedFinalRfFlood)
      .eq(1)
      .unmask(0);

  var svmFiltered =
    ee.Image(tunedFinalSvmFlood)
      .eq(1)
      .unmask(0);


  var rfSvmAgreementAreaStack =
    ee.Image.cat([

      rfFiltered
        .and(svmFiltered)
        .rename('both_flood'),

      rfFiltered
        .and(svmFiltered.not())
        .rename('rf_only'),

      svmFiltered
        .and(rfFiltered.not())
        .rename('svm_only'),

      rfFiltered
        .not()
        .and(svmFiltered.not())
        .rename('neither_flood')

    ])
      .multiply(ee.Image.pixelArea());


  var rfSvmAgreementAreaDictionary =
    rfSvmAgreementAreaStack.reduceRegion({

      reducer: ee.Reducer.sum(),

      geometry: geometry,

      scale: COMPARISON_SCALE_METERS,

      crs: 'EPSG:32639',

      maxPixels: 1e10,

      tileScale: 16

    });


  var rfSvmAgreementAreaTable =
    ee.FeatureCollection([

      ee.Feature(null, {
        spatial_category: 'Both RF and SVM flood',
        estimated_area_km2:
          ee.Number(
            rfSvmAgreementAreaDictionary.get('both_flood')
          ).divide(1e6)
      }),

      ee.Feature(null, {
        spatial_category: 'RF flood only',
        estimated_area_km2:
          ee.Number(
            rfSvmAgreementAreaDictionary.get('rf_only')
          ).divide(1e6)
      }),

      ee.Feature(null, {
        spatial_category: 'SVM flood only',
        estimated_area_km2:
          ee.Number(
            rfSvmAgreementAreaDictionary.get('svm_only')
          ).divide(1e6)
      }),

      ee.Feature(null, {
        spatial_category: 'Neither model flood',
        estimated_area_km2:
          ee.Number(
            rfSvmAgreementAreaDictionary.get('neither_flood')
          ).divide(1e6)
      })

    ]);


  print(
    'FILTERED RF–SVM SPATIAL AGREEMENT AREA — 30 m estimate',
    rfSvmAgreementAreaTable
  );


  var disagreementAreaKm2 =
    ee.Number(
      rfSvmAgreementAreaDictionary.get('rf_only')
    )
      .add(
        ee.Number(
          rfSvmAgreementAreaDictionary.get('svm_only')
        )
      )
      .divide(1e6);


  print(
    'Filtered RF–SVM disagreement area km2 — 30 m estimate',
    disagreementAreaKm2
  );


  // ===========================================================================
  // 19D — OPTIONAL MAP DISPLAY
  // ===========================================================================

  var rfSvmDisagreement =
    rfFiltered
      .neq(svmFiltered)
      .rename('rf_svm_disagreement');


  Map.addLayer(
    rfFiltered.selfMask(),
    {palette: ['FF0000']},
    'Final RF filtered flood',
    false
  );

  Map.addLayer(
    svmFiltered.selfMask(),
    {palette: ['FFFF00']},
    'Final RBF-SVM filtered flood',
    false
  );

  Map.addLayer(
    rfSvmDisagreement.selfMask(),
    {palette: ['FF00FF']},
    'RF–SVM disagreement',
    false
  );
}


// =============================================================================
// 20 — FINAL EXPORT PACKAGE
// =============================================================================

var RUN_FINAL_EXPORTS = true;

if (RUN_FINAL_EXPORTS) {

  // ===========================================================================
  // 20A — FIVE-BAND FINAL MAP STACK
  // ===========================================================================

  var finalFloodProductStack = ee.Image.cat([

    tunedBaselineFlood
      .rename('baseline_flood'),

    tunedFinalRfRawFlood
      .rename('rf_raw_flood'),

    tunedFinalSvmRawFlood
      .rename('svm_raw_flood'),

    tunedFinalRfFlood
      .rename('rf_filtered_flood'),

    tunedFinalSvmFlood
      .rename('svm_filtered_flood')

  ])
    .unmask(0)
    .toByte()
    .clip(geometry);


  Export.image.toDrive({
    image: finalFloodProductStack,

    description:
      'Ahvaz_Final_Flood_Products_10m',

    folder:
      EXPORT_FOLDER,

    fileNamePrefix:
      'Ahvaz_Final_Flood_Products_10m',

    region:
      geometry,

    scale:
      10,

    crs:
      'EPSG:32639',

    maxPixels:
      1e13,

    fileFormat:
      'GeoTIFF',

    formatOptions: {
      cloudOptimized: true
    }
  });


  // ===========================================================================
  // 20B — FINAL BLIND-VALIDATION METRICS
  // ===========================================================================

  Export.table.toDrive({
    collection:
      tunedFinalBlindMetricTable,

    description:
      'Ahvaz_Final_Blind_Validation_Metrics',

    folder:
      EXPORT_FOLDER,

    fileNamePrefix:
      'Ahvaz_Final_Blind_Validation_Metrics',

    fileFormat:
      'CSV',

    selectors: [
      'product_name',
      'prediction_property',
      'evaluated_sample_count',
      'true_negative',
      'false_positive',
      'false_negative',
      'true_positive',
      'overall_accuracy',
      'kappa',
      'flood_precision',
      'flood_recall',
      'flood_f1'
    ]
  });


  // ===========================================================================
  // 20C — CONFUSION MATRICES IN LONG-TABLE FORMAT
  // ===========================================================================

  function confusionMatrixToTable(
    productName,
    matrix
  ) {

    var matrixArray =
      ee.Array(matrix.array());

    return ee.FeatureCollection([

      ee.Feature(null, {
        product_name: productName,
        matrix_cell: 'TN',
        actual_class: 0,
        predicted_class: 0,
        count: matrixArray.get([0, 0])
      }),

      ee.Feature(null, {
        product_name: productName,
        matrix_cell: 'FP',
        actual_class: 0,
        predicted_class: 1,
        count: matrixArray.get([0, 1])
      }),

      ee.Feature(null, {
        product_name: productName,
        matrix_cell: 'FN',
        actual_class: 1,
        predicted_class: 0,
        count: matrixArray.get([1, 0])
      }),

      ee.Feature(null, {
        product_name: productName,
        matrix_cell: 'TP',
        actual_class: 1,
        predicted_class: 1,
        count: matrixArray.get([1, 1])
      })

    ]);
  }


  var finalConfusionMatrixTable =

    confusionMatrixToTable(
      'Baseline threshold',
      baselineFinalBlindMatrix
    )

      .merge(
        confusionMatrixToTable(
          'Tuned RF raw',
          rfRawFinalBlindMatrix
        )
      )

      .merge(
        confusionMatrixToTable(
          'Tuned RBF-SVM raw',
          svmRawFinalBlindMatrix
        )
      )

      .merge(
        confusionMatrixToTable(
          'Tuned RF filtered',
          rfFilteredFinalBlindMatrix
        )
      )

      .merge(
        confusionMatrixToTable(
          'Tuned RBF-SVM filtered',
          svmFilteredFinalBlindMatrix
        )
      );


  Export.table.toDrive({
    collection:
      finalConfusionMatrixTable,

    description:
      'Ahvaz_Final_Confusion_Matrices',

    folder:
      EXPORT_FOLDER,

    fileNamePrefix:
      'Ahvaz_Final_Confusion_Matrices',

    fileFormat:
      'CSV',

    selectors: [
      'product_name',
      'matrix_cell',
      'actual_class',
      'predicted_class',
      'count'
    ]
  });


  // ===========================================================================
  // 20D — PREDICTIONS FOR ALL 238 BLIND SAMPLES
  // ===========================================================================

  var finalBlindPredictionExport =
    tunedBlindValidationResults.map(function(feature) {

      feature = ee.Feature(feature);

      return ee.Feature(null, {

        sample_id:
          feature.get('sample_id'),

        reference_class:
          ee.Number(
            feature.get('reference_class')
          ).int(),

        baseline_prediction:
          ee.Number(
            feature.get('baseline_prediction')
          ).int(),

        rf_raw_prediction:
          ee.Number(
            feature.get('rf_raw_prediction')
          ).int(),

        svm_raw_prediction:
          ee.Number(
            feature.get('svm_raw_prediction')
          ).int(),

        rf_filtered_prediction:
          ee.Number(
            feature.get('rf_final_prediction')
          ).int(),

        svm_filtered_prediction:
          ee.Number(
            feature.get('svm_final_prediction')
          ).int()

      });
    });


  Export.table.toDrive({
    collection:
      finalBlindPredictionExport,

    description:
      'Ahvaz_Final_Blind_Sample_Predictions',

    folder:
      EXPORT_FOLDER,

    fileNamePrefix:
      'Ahvaz_Final_Blind_Sample_Predictions',

    fileFormat:
      'CSV',

    selectors: [
      'sample_id',
      'reference_class',
      'baseline_prediction',
      'rf_raw_prediction',
      'svm_raw_prediction',
      'rf_filtered_prediction',
      'svm_filtered_prediction'
    ]
  });

/*
  // ===========================================================================
  // 20E — EXACT 10 m FLOOD-AREA TABLE
  // ===========================================================================

  var exactFloodAreaDictionary =
    finalFloodProductStack
      .multiply(ee.Image.pixelArea())
      .reduceRegion({

        reducer:
          ee.Reducer.sum(),

        geometry:
          geometry,

        scale:
          10,

        crs:
          'EPSG:32639',

        maxPixels:
          1e13,

        tileScale:
          16
      });


  var exactFloodAreaTable =
    ee.FeatureCollection([

      ee.Feature(null, {
        product_name: 'Baseline threshold',
        flood_area_km2:
          ee.Number(
            exactFloodAreaDictionary.get(
              'baseline_flood'
            )
          ).divide(1e6)
      }),

      ee.Feature(null, {
        product_name: 'Tuned RF raw',
        flood_area_km2:
          ee.Number(
            exactFloodAreaDictionary.get(
              'rf_raw_flood'
            )
          ).divide(1e6)
      }),

      ee.Feature(null, {
        product_name: 'Tuned RBF-SVM raw',
        flood_area_km2:
          ee.Number(
            exactFloodAreaDictionary.get(
              'svm_raw_flood'
            )
          ).divide(1e6)
      }),

      ee.Feature(null, {
        product_name: 'Tuned RF filtered',
        flood_area_km2:
          ee.Number(
            exactFloodAreaDictionary.get(
              'rf_filtered_flood'
            )
          ).divide(1e6)
      }),

      ee.Feature(null, {
        product_name: 'Tuned RBF-SVM filtered',
        flood_area_km2:
          ee.Number(
            exactFloodAreaDictionary.get(
              'svm_filtered_flood'
            )
          ).divide(1e6)
      })

    ]);


  Export.table.toDrive({
    collection:
      exactFloodAreaTable,

    description:
      'Ahvaz_Final_Flood_Areas_10m',

    folder:
      EXPORT_FOLDER,

    fileNamePrefix:
      'Ahvaz_Final_Flood_Areas_10m',

    fileFormat:
      'CSV',

    selectors: [
      'product_name',
      'flood_area_km2'
    ]
  });

*/
// ===========================================================================
// 20E — CORRECTED EXACT 10 m FLOOD-AREA TABLE
// Uses exactly the same grid and bounds as the exported GeoTIFF
// ===========================================================================

var exactAreaCrs =
  'EPSG:32639';

var exactAreaTransform = [
  10, 0, 226650,
  0, -10, 3503660
];


// Exact bounds of the exported GeoTIFF:
// 8546 columns × 5139 rows × 10 m
var exactAreaRegion =
  ee.Geometry.Rectangle(
    [
      226650,
      3452270,
      312110,
      3503660
    ],
    exactAreaCrs,
    false
  );


// Convert every band to a strict binary image:
// flood = 1
// non-flood or masked = 0
var exactBinaryFloodStack =
  finalFloodProductStack
    .select([
      'baseline_flood',
      'rf_raw_flood',
      'svm_raw_flood',
      'rf_filtered_flood',
      'svm_filtered_flood'
    ])
    .eq(1)
    .unmask(0, false)
    .toByte();


// Count flooded pixels on the exact GeoTIFF grid
var exactFloodPixelDictionary =
  exactBinaryFloodStack.reduceRegion({

    reducer:
      ee.Reducer.sum(),

    geometry:
      exactAreaRegion,

    crs:
      exactAreaCrs,

    crsTransform:
      exactAreaTransform,

    maxPixels:
      1e13,

    tileScale:
      16
  });


print(
  'Exact flood-pixel counts',
  exactFloodPixelDictionary
);


// Function to build one row of the CSV
function createExactAreaFeature(
  productName,
  bandName
) {

  var floodPixels =
    ee.Number(
      exactFloodPixelDictionary.get(
        bandName
      )
    );

  return ee.Feature(null, {

    product_name:
      productName,

    // Each 10 × 10 m pixel = 0.0001 km²
    flood_area_km2:
      floodPixels.multiply(0.0001)
  });
}


// Create the corrected area table
var exactFloodAreaTable =
  ee.FeatureCollection([

    createExactAreaFeature(
      'Baseline threshold',
      'baseline_flood'
    ),

    createExactAreaFeature(
      'Tuned RF raw',
      'rf_raw_flood'
    ),

    createExactAreaFeature(
      'Tuned RBF-SVM raw',
      'svm_raw_flood'
    ),

    createExactAreaFeature(
      'Tuned RF filtered',
      'rf_filtered_flood'
    ),

    createExactAreaFeature(
      'Tuned RBF-SVM filtered',
      'svm_filtered_flood'
    )

  ]);


print(
  'CORRECTED EXACT 10 m FLOOD AREAS',
  exactFloodAreaTable
);


Export.table.toDrive({

  collection:
    exactFloodAreaTable,

  description:
    'Ahvaz_Final_Flood_Areas_10m',

  folder:
    EXPORT_FOLDER,

  fileNamePrefix:
    'Ahvaz_Final_Flood_Areas_10m',

  fileFormat:
    'CSV',

  selectors: [
    'product_name',
    'flood_area_km2'
  ]
});
  // ===========================================================================
  // 20F — FINAL MODEL CONFIGURATIONS
  // ===========================================================================

  var finalModelConfigurationTable =
    ee.FeatureCollection([

      ee.Feature(null, {
        model: 'Random Forest',
        number_of_trees: 300,
        variables_per_split: 3,
        min_leaf_population: 1,
        bag_fraction: 0.5,
        training_sample_count: 1600,
        predictor_count: 21
      }),

      ee.Feature(null, {
        model: 'RBF-SVM',
        gamma: 0.03125,
        cost: 16,
        training_sample_count: 1600,
        predictor_count: 21
      })

    ]);


  Export.table.toDrive({
    collection:
      finalModelConfigurationTable,

    description:
      'Ahvaz_Final_Model_Configurations',

    folder:
      EXPORT_FOLDER,

    fileNamePrefix:
      'Ahvaz_Final_Model_Configurations',

    fileFormat:
      'CSV'
  });


  print(
    'Section 20 ready — start all export tasks from the Tasks tab.'
  );
}