// Schema.org JSON-LD builders. MedicalClinic + LocalBusiness on profiles,
// BreadcrumbList for hierarchy, WebSite on the homepage. Strong structured data
// is both an E-E-A-T signal and a rich-result lever for YMYL.

import { SITE } from './site.js';
import { titleCase } from './data.js';

export function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: new URL(it.href, SITE.url).href,
    })),
  };
}

export function clinicLd(c) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MedicalClinic',
    name: titleCase(c.name),
    url: new URL(`/clinic/${c.slug}/`, SITE.url).href,
    medicalSpecialty: 'PainMedicine',
    address: {
      '@type': 'PostalAddress',
      streetAddress: [c.address_1, c.address_2].filter(Boolean).join(', '),
      addressLocality: titleCase(c.city),
      addressRegion: c.state,
      postalCode: (c.postal_code || '').slice(0, 5),
      addressCountry: c.country || 'US',
    },
  };
  if (c.phone) ld.telephone = c.phone;
  if (c.website && SITE.linkClinicWebsites) ld.sameAs = [c.website];
  if (c.latitude && c.longitude) {
    ld.geo = { '@type': 'GeoCoordinates', latitude: c.latitude, longitude: c.longitude };
  }
  if (c.aggregate_rating && c.review_count) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: c.aggregate_rating,
      reviewCount: c.review_count,
      bestRating: 5,
    };
  }
  return ld;
}

export function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    publisher: { '@type': 'Organization', name: SITE.editorial.publisher },
  };
}

export function itemListLd(clinics, baseName) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: baseName,
    numberOfItems: clinics.length,
    itemListElement: clinics.slice(0, 25).map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: new URL(`/clinic/${c.slug}/`, SITE.url).href,
      name: titleCase(c.name),
    })),
  };
}
