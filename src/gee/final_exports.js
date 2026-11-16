// =============================================================================
// REPRODUCIBLE FINAL EXPORTS
// =============================================================================
// Paste this block after ahvaz_rf_svm_pipeline.js in the Earth Engine editor.
// Set RUN_FINAL_EXPORTS to true only after the corrected model and validation
// sections have completed successfully.
// =============================================================================

if (RUN_FINAL_EXPORTS) {

  var FINAL_EXPORT_CRS = 'EPSG:32639';
  var FINAL_EXPORT_TRANSFORM = [10, 0, 226650, 0, -10, 3503660];
  var FINAL_EXPORT_REGION = ee.Geometry.Rectangle(
    [226650, 3452270, 312110, 3503660],
    FINAL_EXPORT_CRS,
    false
  );

  var finalFloodProductStack = ee.Image.cat([
    tunedBaselineFlood.rename('baseline_flood'),
    tunedFinalRfRawFlood.rename('rf_raw_flood'),
    tunedFinalSvmRawFlood.rename('svm_raw_flood'),
    tunedFinalRfFlood.rename('rf_filtered_flood'),
    tunedFinalSvmFlood.rename('svm_filtered_flood')
  ]).unmask(0).toByte();

  Export.image.toDrive({
    image: finalFloodProductStack,
    description: 'Ahvaz_Final_Flood_Products_10m',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'Ahvaz_Final_Flood_Products_10m',
    region: FINAL_EXPORT_REGION,
    crs: FINAL_EXPORT_CRS,
    crsTransform: FINAL_EXPORT_TRANSFORM,
    maxPixels: 1e10,
    fileFormat: 'GeoTIFF',
    formatOptions: {cloudOptimized: true}
  });

  Export.table.toDrive({
    collection: tunedFinalBlindMetricTable,
    description: 'Ahvaz_Final_Blind_Validation_Metrics',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'Ahvaz_Final_Blind_Validation_Metrics',
    fileFormat: 'CSV',
    selectors: [
      'product_name', 'prediction_property', 'evaluated_sample_count',
      'true_negative', 'false_positive', 'false_negative', 'true_positive',
      'overall_accuracy', 'kappa', 'flood_precision', 'flood_recall',
      'flood_f1'
    ]
  });

  function confusionRows(productName, predictionProperty) {
    var matrix = ee.Array(
      tunedBlindValidationResults.errorMatrix(
        'reference_class',
        predictionProperty,
        tunedBlindClassOrder
      ).array()
    );

    return ee.FeatureCollection([
      ee.Feature(null, {
        product_name: productName,
        matrix_cell: 'TN',
        actual_class: 0,
        predicted_class: 0,
        count: matrix.get([0, 0])
      }),
      ee.Feature(null, {
        product_name: productName,
        matrix_cell: 'FP',
        actual_class: 0,
        predicted_class: 1,
        count: matrix.get([0, 1])
      }),
      ee.Feature(null, {
        product_name: productName,
        matrix_cell: 'FN',
        actual_class: 1,
        predicted_class: 0,
        count: matrix.get([1, 0])
      }),
      ee.Feature(null, {
        product_name: productName,
        matrix_cell: 'TP',
        actual_class: 1,
        predicted_class: 1,
        count: matrix.get([1, 1])
      })
    ]);
  }

  var finalConfusionMatrixTable =
    confusionRows('Baseline threshold', 'baseline_prediction')
      .merge(confusionRows('Tuned RF raw', 'rf_raw_prediction'))
      .merge(confusionRows('Tuned RBF-SVM raw', 'svm_raw_prediction'))
      .merge(confusionRows('Tuned RF filtered', 'rf_final_prediction'))
      .merge(confusionRows('Tuned RBF-SVM filtered', 'svm_final_prediction'));

  Export.table.toDrive({
    collection: finalConfusionMatrixTable,
    description: 'Ahvaz_Final_Confusion_Matrices',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'Ahvaz_Final_Confusion_Matrices',
    fileFormat: 'CSV',
    selectors: [
      'product_name', 'matrix_cell', 'actual_class', 'predicted_class', 'count'
    ]
  });

  Export.table.toDrive({
    collection: tunedBlindValidationResults,
    description: 'Ahvaz_Final_Blind_Sample_Predictions',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'Ahvaz_Final_Blind_Sample_Predictions',
    fileFormat: 'CSV',
    selectors: [
      'sample_id', 'reference_class', 'baseline_prediction',
      'rf_raw_prediction', 'svm_raw_prediction', 'rf_final_prediction',
      'svm_final_prediction'
    ]
  });

  var finalModelConfigurationTable = ee.FeatureCollection([
    ee.Feature(null, {
      model: 'Random Forest',
      training_sample_count: finalTrainingSamples.size(),
      predictor_count: finalPredictorBandList.size(),
      number_of_trees: 300,
      variables_per_split: 3,
      min_leaf_population: 1,
      bag_fraction: 0.50,
      preprocessing: 'Raw ordered 21-band predictor stack'
    }),
    ee.Feature(null, {
      model: 'RBF-SVM',
      training_sample_count: finalTrainingSamples.size(),
      predictor_count: finalPredictorBandList.size(),
      kernel: 'RBF',
      gamma: 0.03125,
      cost: 16,
      preprocessing: 'Training-set z-score standardization applied once'
    })
  ]);

  Export.table.toDrive({
    collection: finalModelConfigurationTable,
    description: 'Ahvaz_Final_Model_Configurations',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'Ahvaz_Final_Model_Configurations',
    fileFormat: 'CSV',
    selectors: [
      'model', 'training_sample_count', 'predictor_count', 'number_of_trees',
      'variables_per_split', 'min_leaf_population', 'bag_fraction', 'kernel',
      'gamma', 'cost', 'preprocessing'
    ]
  });

  function exactAreaFeature(productName, floodImage) {
    var floodPixels = ee.Number(
      ee.Image(floodImage)
        .eq(1)
        .unmask(0, false)
        .rename('flood')
        .toByte()
        .reduceRegion({
          reducer: ee.Reducer.sum(),
          geometry: FINAL_EXPORT_REGION,
          crs: FINAL_EXPORT_CRS,
          crsTransform: FINAL_EXPORT_TRANSFORM,
          maxPixels: 1e10,
          tileScale: 8
        })
        .get('flood')
    );

    return ee.Feature(null, {
      product_name: productName,
      flood_area_km2: floodPixels.multiply(0.0001)
    });
  }

  var finalExactAreaTable = ee.FeatureCollection([
    exactAreaFeature('Baseline threshold', tunedBaselineFlood),
    exactAreaFeature('Tuned RF raw', tunedFinalRfRawFlood),
    exactAreaFeature('Tuned RBF-SVM raw', tunedFinalSvmRawFlood),
    exactAreaFeature('Tuned RF filtered', tunedFinalRfFlood),
    exactAreaFeature('Tuned RBF-SVM filtered', tunedFinalSvmFlood)
  ]);

  Export.table.toDrive({
    collection: finalExactAreaTable,
    description: 'Ahvaz_Final_Flood_Areas_10m',
    folder: EXPORT_FOLDER,
    fileNamePrefix: 'Ahvaz_Final_Flood_Areas_10m',
    fileFormat: 'CSV',
    selectors: ['product_name', 'flood_area_km2']
  });
}

