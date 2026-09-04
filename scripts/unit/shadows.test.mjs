import '../dom-stub.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { BlobShadows } from '../../src/world/Shadows.js'

test('BlobShadows takes a strength (peak alpha) and defaults to the old 0.34', () => {
  assert.equal(new BlobShadows(new THREE.Scene()).strength, 0.34)
  const faint = new BlobShadows(new THREE.Scene(), { max: 10, strength: 0.16 })
  assert.equal(faint.strength, 0.16)
  assert.equal(faint.max, 10)
  assert.equal(faint.mesh.castShadow, false)
  assert.equal(faint.mesh.receiveShadow, false)
})
