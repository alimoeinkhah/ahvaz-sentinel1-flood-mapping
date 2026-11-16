// Replacement for the old whole-area CSV export block.
// Paste this after the five final flood images have been created.
// It counts flooded pixels on the exact grid used by the exported 10 m GeoTIFF.

var AREA_EXPORT_CRS = 'EPSG:32639';
var AREA_EXPORT_TRANSFORM = [10, 0, 226650, 0, -10, 3503660];

// Exact bounds of Ahvaz_Final_Flood_Products_10m.tif:
// 8546 columns x 5139 rows at 10 m.
var AREA_EXPORT_REGION = ee.Geometry.Rectangle(
  [226650, 3452270, 312110, 3503660],
  AREA_EXPORT_CRS,
  false
);

function exactFloodAreaFeature(productName, floodImage) {
  var floodOnExportGrid = ee.Image(floodImage)
    .eq(1)
    .unmask(0, false)
    .rename('flood')
    .toByte();

  var floodPixels = ee.Number(floodOnExportGrid.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: AREA_EXPORT_REGION,
    crs: AREA_EXPORT_CRS,
    crsTransform: AREA_EXPORT_TRANSFORM,
    maxPixels: 1e10,
    tileScale: 8
  }).get('flood'));

  return ee.Feature(null, {
    product_name: productName,
    flood_area_km2: floodPixels.multiply(0.0001)
  });
}

var correctedFinalFloodAreas = ee.FeatureCollection([
  exactFloodAreaFeature('Baseline threshold', tunedBaselineFlood),
  exactFloodAreaFeature('Tuned RF raw', tunedFinalRfRawFlood),
  exactFloodAreaFeature('Tuned RBF-SVM raw', tunedFinalSvmRawFlood),
  exactFloodAreaFeature('Tuned RF filtered', tunedFinalRfFlood),
  exactFloodAreaFeature('Tuned RBF-SVM filtered', tunedFinalSvmFlood)
]);

print('CORRECTED FINAL FLOOD AREAS — exact exported 10 m grid', correctedFinalFloodAreas);

Export.table.toDrive({
  collection: correctedFinalFloodAreas,
  description: 'Ahvaz_Final_Flood_Areas_10m',
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'Ahvaz_Final_Flood_Areas_10m',
  fileFormat: 'CSV',
  selectors: ['product_name', 'flood_area_km2']
});
