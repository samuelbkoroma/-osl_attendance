export const ODC_LOCATION = {
  name: "Orange Digital Center - Freetown",
  address: "1 Alpha Wurie Drive, Hill Station, Freetown, Sierra Leone",
  latitude: 8.4657,
  longitude: -13.2317,
  // The physical check-in radius. Kept generous because GPS inside a building
  // can drift 100-200m from the true position.
  radiusMeters: 250,
}

// When the browser reports a GPS accuracy figure, we allow up to this many
// extra metres of slack on top of the geofence radius before rejecting a
// check-in. Prevents "I'm in the building but it says I'm not" false negatives.
export const LOCATION_ACCURACY_BUFFER_METERS = 100

export const SESSION_DURATION_MINUTES = 90
