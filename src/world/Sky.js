import * as THREE from 'three'
import { palette } from './Materials.js'

/**
 * Distance-graded fog.
 *
 * `THREE.Fog` mixes towards one flat colour, so from every viewpoint the far distance was a single
 * band of `skyBottom` — measured at the aircraft's 34 m ceiling, the top 58 rows of the frame were
 * exactly [229,184,141], the fog colour, and the sky gradient the README promises "only the plane
 * brings into view" was never once drawn. It cannot be fixed by trimming ground: the camera's top ray
 * is 22.9° below horizontal, so at the ceiling it still meets ground 160 m out, and any edge close
 * enough to show sky would also be visible from Education at zoom 1.9.
 *
 * So put the sky into the fog instead. This overrides three's `fog_fragment` chunk so the fog colour
 * is itself a gradient from the haze band to the zenith with distance, which costs no draw calls, no
 * uniforms and no geometry, and applies to every lit material — distant hills and mesas now grade
 * into the sky rather than floating on it, which is why they read as hard dark lumps today.
 *
 * Unlit `MeshBasicMaterial` faces (every board face, label, stencil and decal) have no fog chunk at
 * all, so printed copy is provably unaffected and the board-cream pixel gate cannot move.
 *
 * Call once, before any material compiles.
 */

/** Where the grade runs, in metres of view depth. Below `near` it is pure haze; above `far`, zenith. */
export const FOG_GRADE = { near: 110, far: 240 }

let installed = false

export function installGradedFog({ bottom = palette.skyBottom, top = palette.skyTop, grade = FOG_GRADE } = {}) {
  if (installed) return false
  const b = new THREE.Color(bottom)
  const t = new THREE.Color(top)
  const f3 = (v) => v.toFixed(4)
  // three's own chunk, with the constant `fogColor` replaced by a depth-graded mix. `vFogDepth` is
  // already a varying in the standard chunk (three 0.185), so nothing else has to change.
  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG

	#ifdef FOG_EXP2

		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );

	#else

		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );

	#endif

	vec3 gradedFogColor = mix(
		vec3( ${f3(b.r)}, ${f3(b.g)}, ${f3(b.b)} ),
		vec3( ${f3(t.r)}, ${f3(t.g)}, ${f3(t.b)} ),
		smoothstep( ${grade.near.toFixed(1)}, ${grade.far.toFixed(1)}, vFogDepth )
	);

	gl_FragColor.rgb = mix( gl_FragColor.rgb, gradedFogColor, fogFactor );

#endif
`
  installed = true
  return true
}

/** Test seam: lets a suite install a second time with different colours. */
export function _resetGradedFog() {
  installed = false
}
