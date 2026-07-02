// 301 redirects: old city URLs -> new zone URLs.
//
// Runs on every request under /pain-clinics/. If the path matches an entry in
// /city-redirects.json (generated at build time from live clinic data), issue
// a permanent redirect to the zone page that now covers that city; otherwise
// fall through to the static page (state hubs, zone pages, real 404s).
//
// Fails open: if the map can't be loaded for any reason, requests pass
// through untouched — the site never breaks because of this file.

let mapPromise = null;

async function loadMap(env, requestUrl) {
  if (!mapPromise) {
    mapPromise = env.ASSETS.fetch(new URL('/city-redirects.json', requestUrl))
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => {
        mapPromise = null; // retry on the next request
        return {};
      });
  }
  return mapPromise;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Only /pain-clinics/{state}/{segment}/ (trailing slash optional) is a
  // candidate. State hubs, deeper paths, and anything else pass straight through.
  const m = url.pathname.match(/^\/pain-clinics\/([a-z]{2})\/([a-z0-9-]+)\/?$/);
  if (!m) return next();

  try {
    const map = await loadMap(env, url);
    const zone = map[`${m[1]}/${m[2]}`];
    if (zone && zone !== m[2]) {
      return Response.redirect(
        `${url.origin}/pain-clinics/${m[1]}/${zone}/${url.search}`,
        301
      );
    }
  } catch (e) {
    // fail open
  }
  return next();
}
