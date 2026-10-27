// node --test src/lib/display-name.test.mjs
// How federal records print. NPPES sends names and addresses in capitals, and
// before 2026-10-27 3,196 practice names printed as "Pllc", "Md" or "Do" and
// 3,227 phones as bare digits. Every case below is a real record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { titleCase, displayName, formatPhone, slugify } from './data.js';

test('business suffixes print in capitals', () => {
  assert.equal(displayName('FIRST CHOICE MEDICAL SOLUTIONS PLLC'), 'First Choice Medical Solutions PLLC');
  assert.equal(displayName('INTERVENTIONAL SPINE AND PAIN, LLP'), 'Interventional Spine And Pain, LLP');
  assert.equal(displayName('GREEN BAY ANESTHESIA ASSOC SC'), 'Green Bay Anesthesia Assoc SC');
});

test('every suffix is fixed, not just the first', () => {
  assert.equal(displayName('ALAN D SILBERBERG, MD PA'), 'Alan D Silberberg, MD PA');
  assert.equal(displayName('E. R. MCANALLEY, M.D., P.A.'), 'E. R. McAnalley, M.D., P.A.');
});

test('credentials in a practice name print in capitals', () => {
  assert.equal(displayName('STUART L BLOOM DO A PROFFESSIONAL CORPORATION'), 'Stuart L Bloom DO A Proffessional Corporation');
  assert.equal(displayName('ROBERT HUGHES MILLWEE, IV, MD'), 'Robert Hughes Millwee, IV, MD');
  assert.equal(displayName('LOCKWOOD & STEELY, MD\'S, PA'), "Lockwood & Steely, MD's, PA");
});

test('US and IV are the country and the therapy', () => {
  assert.equal(displayName('US PAIN RELIEF PLLC'), 'US Pain Relief PLLC');
  assert.equal(displayName('PROSPER KETAMINE & IV NUTRITION THERAPY LLC'), 'Prosper Ketamine & IV Nutrition Therapy LLC');
});

test("a possessive keeps a lowercase s", () => {
  assert.equal(displayName("PHYSICIAN'S PAIN AND SPINE CENTER, LLC"), "Physician's Pain And Spine Center, LLC");
  assert.equal(titleCase("3459 ST. JOHN'S LANE"), "3459 St. John's Lane");
});

test('Mc names, but not a three-letter acronym that starts with MC', () => {
  assert.equal(titleCase('MCALLEN'), 'McAllen');
  assert.equal(titleCase('MCKINNEY'), 'McKinney');
  assert.equal(displayName('MCREYNOLDS ANESTHESIA, PA'), 'McReynolds Anesthesia, PA');
  assert.equal(displayName('MCR HEALTH, INC.'), 'Mcr Health, Inc.');
});

test('addresses never get the name acronyms: Pt is Point, Pl is Place', () => {
  assert.equal(titleCase('1200 PT LOMA AVE'), '1200 Pt Loma Ave');
  assert.equal(titleCase('45 ORCHARD PL'), '45 Orchard Pl');
});

test('display changes never move a city URL', () => {
  for (const city of ['MCALLEN', 'MCKINNEY', 'MCALESTER', "COEUR D'ALENE"]) {
    assert.equal(slugify(titleCase(city)), slugify(city));
  }
});

test('phones print one way', () => {
  assert.equal(formatPhone('8178775353'), '817-877-5353');
  assert.equal(formatPhone('214-265-9991'), '214-265-9991');
  assert.equal(formatPhone('(214) 265-9991'), '214-265-9991');
  assert.equal(formatPhone('18178775353'), '817-877-5353');
});

test('a phone that is not a plain US number is left alone', () => {
  assert.equal(formatPhone('817-877-5353 x204'), '817-877-5353 x204');
  assert.equal(formatPhone('12345'), '12345');
  assert.equal(formatPhone(null), null);
  assert.equal(formatPhone(''), '');
});
