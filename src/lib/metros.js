// Metro membership for PainBeacon clinics. The definitions and the radius
// arithmetic live in metro-defs.js (a twin shared with FertilityRecord); this
// file only knows how a PainBeacon clinic record carries its coordinates.
//
// Primary (deduped) practices only, like every other directory page, so a
// metro count is the same kind of number as a state or zone count.
import { getClinics } from './data.js';
import { buildMetroIndex } from './metro-defs.js';

let _index = null;

const latLng = (c) => {
  if (c.latitude == null || c.longitude == null) return null;
  const lat = Number(c.latitude);
  const lng = Number(c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return [lat, lng];
};
const cityState = (c) => `${c.cityLabel}|${c.state}`;

/** Map<slug, { metro, items, byState }> for every metro with at least one clinic. */
export async function getMetroIndex() {
  if (_index) return _index;
  const clinics = await getClinics();
  _index = buildMetroIndex(clinics.filter((c) => c.isPrimary), latLng, cityState);
  return _index;
}
