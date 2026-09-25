import test from 'node:test';
import assert from 'node:assert/strict';
import { manualRoute } from '../lib/install.ts';

const UA = {
  iphoneSafari18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  // iOS 26 freezes the OS at 18_6; only Safari's Version moves.
  iphoneSafari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  ipadSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

test('each browser gets steps for the browser it actually is', () => {
  assert.equal(manualRoute(UA.iphoneSafari18, 5), 'ios-safari');
  assert.equal(manualRoute(UA.iphoneSafari26, 5), 'ios-safari-26');
  assert.equal(manualRoute(UA.ipadSafari, 5), 'ios-safari');
  assert.equal(manualRoute(UA.iphoneChrome, 5), 'ios-chrome');
  assert.equal(manualRoute(UA.iphoneFirefox, 5), 'ios-other');
  assert.equal(manualRoute(UA.androidChrome, 5), 'android');
  assert.equal(manualRoute(UA.androidSamsung, 5), 'android-samsung');
  assert.equal(manualRoute(UA.androidFirefox, 5), 'android');
});

test('desktops get no steps (and no Home popup)', () => {
  assert.equal(manualRoute(UA.macSafari, 0), null);
  assert.equal(manualRoute(UA.desktopChrome, 0), null);
});
