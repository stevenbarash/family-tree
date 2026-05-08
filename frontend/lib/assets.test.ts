import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWikiAssetPath, contentTypeForAsset } from './assets';

test('resolveWikiAssetPath maps /assets parts under the wiki asset root', () => {
  assert.equal(
    resolveWikiAssetPath('/wiki', ['portraits', 'sofia-krasnova.jpg']),
    '/wiki/assets/portraits/sofia-krasnova.jpg',
  );
});

test('resolveWikiAssetPath rejects traversal and path separators', () => {
  assert.equal(resolveWikiAssetPath('/wiki', ['..', 'secret.jpg']), null);
  assert.equal(resolveWikiAssetPath('/wiki', ['portraits/secret.jpg']), null);
  assert.equal(resolveWikiAssetPath('/wiki', ['portraits', '..', 'secret.jpg']), null);
});

test('contentTypeForAsset recognizes common image formats', () => {
  assert.equal(contentTypeForAsset('x.JPG'), 'image/jpeg');
  assert.equal(contentTypeForAsset('x.png'), 'image/png');
  assert.equal(contentTypeForAsset('x.webp'), 'image/webp');
  assert.equal(contentTypeForAsset('x.gif'), 'image/gif');
  assert.equal(contentTypeForAsset('x.svg'), 'image/svg+xml');
});
