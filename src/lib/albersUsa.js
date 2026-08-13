// Albers USA point projection — the same composite (lower 48 + Alaska/Hawaii
// insets, 975x610 frame) that scripts/build_county_geo.mjs used to build the
// committed county geometry, so anything projected here lands exactly on that
// map. This is the point-only subset of that script's d3-geo port; if the
// frame constants ever change there, change them here too.

const RAD = Math.PI / 180;

function conicEqualAreaRaw(phi0, phi1) {
  const sy0 = Math.sin(phi0);
  const n = (sy0 + Math.sin(phi1)) / 2;
  const c = 1 + sy0 * (2 * n - sy0);
  const r0 = Math.sqrt(c) / n;
  return (lambda, phi) => {
    const r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n;
    return [r * Math.sin(lambda * n), r0 - r * Math.cos(lambda * n)];
  };
}

function conicProjection({ parallels, rotateLon, center, scale, translate }) {
  const raw = conicEqualAreaRaw(parallels[0] * RAD, parallels[1] * RAD);
  const [cx, cy] = raw(center[0] * RAD, center[1] * RAD);
  const dx = translate[0] - scale * cx;
  const dy = translate[1] + scale * cy;
  return ([lon, lat]) => {
    let lambda = (lon + rotateLon) * RAD;
    if (lambda > Math.PI) lambda -= 2 * Math.PI;
    else if (lambda < -Math.PI) lambda += 2 * Math.PI;
    const p = raw(lambda, lat * RAD);
    return [scale * p[0] + dx, dy - scale * p[1]];
  };
}

const K = 1300;
const TX = 487.5;
const TY = 305;

const PROJECTIONS = {
  lower48: {
    project: conicProjection({
      parallels: [29.5, 45.5], rotateLon: 96, center: [-0.6, 38.7],
      scale: K, translate: [TX, TY],
    }),
    clip: [TX - 0.455 * K, TY - 0.238 * K, TX + 0.455 * K, TY + 0.238 * K],
  },
  alaska: {
    project: conicProjection({
      parallels: [55, 65], rotateLon: 154, center: [-2, 58.5],
      scale: K * 0.35, translate: [TX - 0.307 * K, TY + 0.201 * K],
    }),
    clip: [TX - 0.425 * K, TY + 0.12 * K, TX - 0.214 * K, TY + 0.234 * K],
  },
  hawaii: {
    project: conicProjection({
      parallels: [8, 18], rotateLon: 157, center: [-3, 19.9],
      scale: K, translate: [TX - 0.205 * K, TY + 0.212 * K],
    }),
    clip: [TX - 0.214 * K, TY + 0.166 * K, TX - 0.115 * K, TY + 0.234 * K],
  },
};

export const VIEW_BOX = `0 0 975 610`;

// Project a clinic's coordinates into the 975x610 frame. The inset is chosen
// by the clinic's state (AK and HI have their own), and points that fall
// outside their inset's clip box — or in a territory with no inset (PR, GU,
// VI, AS, MP) — return null.
export function projectPoint(lon, lat, stateAbbr) {
  const inset =
    stateAbbr === 'AK' ? PROJECTIONS.alaska
      : stateAbbr === 'HI' ? PROJECTIONS.hawaii
        : PROJECTIONS.lower48;
  const [x, y] = inset.project([lon, lat]);
  const [x0, y0, x1, y1] = inset.clip;
  if (x < x0 || x > x1 || y < y0 || y > y1 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return [x, y];
}
