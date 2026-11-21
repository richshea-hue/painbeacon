import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withoutLegalForm, practiceTitle, fillDescription, TITLE_MAX } from './page-meta.js';

test('legal forms come off the end only', () => {
  assert.equal(withoutLegalForm('Comprehensive Pain Care Medical Centers Inc'), 'Comprehensive Pain Care Medical Centers');
  assert.equal(withoutLegalForm('Knee Shoulder Back Orthopedic Medical Group, A Professional Corporatio'), 'Knee Shoulder Back Orthopedic Medical Group');
  assert.equal(withoutLegalForm('Gold Coast Pain And Wellness Center, A Medical Corporation'), 'Gold Coast Pain And Wellness Center');
  assert.equal(withoutLegalForm('Colorado Spine Pain Sports Medicine PC'), 'Colorado Spine Pain Sports Medicine');
  assert.equal(withoutLegalForm('Expert Pain, P.L.L.C.'), 'Expert Pain');
  assert.equal(withoutLegalForm('Solar Health P A'), 'Solar Health');
  assert.equal(withoutLegalForm('TLC Pain Management Sleep Restoration SC'), 'TLC Pain Management Sleep Restoration');
  assert.equal(withoutLegalForm('Pain Associates'), 'Pain Associates');
  assert.equal(withoutLegalForm('Inc'), 'Inc');
});

test('short titles keep the site name', () => {
  assert.equal(practiceTitle('Orthopedic Surgeons Ltd', 'Harrisburg, PA', 'PainBeacon'),
    'Orthopedic Surgeons Ltd — Harrisburg, PA — PainBeacon');
});

test('a long name loses its legal form first', () => {
  const t = practiceTitle('Atlanta Interventional Pain Management LLC', 'Woodstock, GA', 'PainBeacon');
  assert.equal(t, 'Atlanta Interventional Pain Management — Woodstock, GA — PainBeacon');
});

test('then the site name, then the name is clipped; never over the limit', () => {
  const t1 = practiceTitle('Knee Shoulder Back Orthopedic Medical Group, A Professional Corporatio', 'Huntington Park, CA', 'PainBeacon');
  assert.equal(t1, 'Knee Shoulder Back Orthopedic Medical Group — Huntington Park, CA');
  const t2 = practiceTitle('Louisiana Institute Of Physical Medicine Family Practice And Rehabilitation Services', 'Baton Rouge, LA', 'PainBeacon');
  assert.ok(t2.length <= TITLE_MAX, t2);
  assert.match(t2, /… — Baton Rouge, LA$/);
});

test('descriptions are filled to the minimum and never past the maximum', () => {
  const base = 'Orthopedic Surgeons Ltd, a pain medicine practice in Harrisburg, PA: address and phone.';
  const d = fillDescription(base, [null, 'Compare it with other pain clinics near Harrisburg.', 'Registered specialty: Orthopaedic Surgery.']);
  assert.ok(d.length >= 120 && d.length <= 160, `${d.length}: ${d}`);
  assert.ok(d.startsWith(base));
  assert.equal(fillDescription('x'.repeat(130), ['more']), 'x'.repeat(130));
  assert.equal(fillDescription('short', ['y'.repeat(200)]), 'short');
});
