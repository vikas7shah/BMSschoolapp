import test from 'node:test';
import assert from 'node:assert/strict';
import { tidyName } from '../dist/index.js';

test('all-lowercase and ALL-CAPS names get capitals', () => {
  assert.equal(tidyName('vansh'), 'Vansh');
  assert.equal(tidyName('sayantani tuya'), 'Sayantani Tuya');
  assert.equal(tidyName('SURBHI JAIN'), 'Surbhi Jain');
  assert.equal(tidyName("mary-jane o'neil"), "Mary-Jane O'Neil");
  assert.equal(tidyName('  veer   shah '), 'Veer Shah');
});

test('a name with its own capitals is kept as typed', () => {
  assert.equal(tidyName('McDonald'), 'McDonald');
  assert.equal(tidyName('de la Cruz'), 'de la Cruz');
  assert.equal(tidyName('Veer'), 'Veer');
  assert.equal(tidyName(''), '');
});
