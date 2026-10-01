// The universal search's matcher (src/search/fuzzy.js), with the cases of
// the Blender add-on it was ported from (Wooctrl's tests/test_fuzzy.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FuzzyIndex } from '../src/search/fuzzy.js';

const RECORDS = [
  ['Add Cube', 'mesh.primitive_cube_add mesh', 'Construct a cube mesh'],
  ['Cube', '3D Viewport › Add › Mesh mesh.primitive_cube_add', ''],
  ['Shade Smooth', 'object.shade_smooth object', 'Set the shading mode to smooth'],
  ['Shade Flat', 'object.shade_flat object', 'Set the shading mode to flat'],
  ['Subdivide', 'mesh.subdivide mesh', 'Subdivide selected edges'],
  ['Subdivision Set', 'object.subdivision_set object', 'Sets a Subdivision Surface level'],
  ['Subdivision Surface', '3D Viewport › Object › Add Modifier', ''],
  ['Render Image', 'render.render render', 'Render active scene'],
  ['Render Samples', 'Setting · Render › EEVEE taa_render_samples', 'Number of samples per pixel for rendering'],
  ['Camera', '3D Viewport › Add object.camera_add', 'Add a camera object'],
  ['View Camera', 'view3d.view_camera', 'Toggle the camera view'],
  ['Delete', 'object.delete', 'Delete selected objects'],
  ['Select All', 'object.select_all', 'Change selection of all visible objects'],
];
const index = new FuzzyIndex(RECORDS);
const titles = (q, n = 3) => index.search(q).slice(0, n).map(([, i]) => RECORDS[i][0]);

test('partial words', () => assert.ok(titles('subd').every((t) => t.startsWith('Subdivi'))));
test('two partial words', () => assert.equal(titles('shade sm')[0], 'Shade Smooth'));
test('exact words', () => assert.equal(titles('add cube')[0], 'Add Cube'));
test('any word order', () => assert.ok(titles('cube add', 2).includes('Add Cube')));
test('missing spaces', () => assert.equal(titles('shadesmooth')[0], 'Shade Smooth'));
test('initials', () => assert.ok(titles('ss').includes('Shade Smooth')));
test('typos', () => {
  assert.ok(titles('subdivsion')[0].startsWith('Subdivision'));
  assert.ok(titles('camra').includes('Camera'));
});
test('several good matches', () => {
  const top = titles('render');
  assert.ok(top.includes('Render Image') && top.includes('Render Samples'));
});
test('the exact title first', () => {
  const top = titles('camera');
  assert.equal(top[0], 'Camera');
  assert.ok(top.includes('View Camera'));
});
test('nothing for nonsense', () => assert.deepEqual(index.search('zzqqxx'), []));
test('a filter', () => assert.deepEqual(index.search('cube', (i) => i === 1).map(([, i]) => i), [1]));
