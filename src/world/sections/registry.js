import { palette } from '../Materials.js'

/** Car faces -z at yaw 0. */
export const HEADING_YAW = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }

/**
 * Section registry (from the panel spec §3): centre, teleport spawn, heading, AABB, colour, copy.
 *
 * Two rules bind every row and are checked by scripts/unit/registry.test.mjs: `sectionAt` returns the
 * FIRST row whose AABB contains a point, and each teleport key drops the car on that row's `spawn` —
 * so a spawn inside an earlier row's AABB teleports the visitor into the wrong section. The Skills
 * AABB reaches z -91 and Education's spawn used to sit at z -88, inside it.
 */
export const SECTION_DEFS = [
  { id: 'intro', key: '1', short: 'Intro', label: 'INTRO — Runway 00', hint: 'summary & résumé', color: palette.terracotta, centre: [0, 0], spawn: [0, 4], heading: 'N', aabb: [-20, -20, 16, 14],
    card: 'Vedant Thakre. Engineer — autonomous decision systems and the data infrastructure under them. Drive north, or press M for the map.' },
  { id: 'crossroads', key: '2', short: 'Crossroads', label: 'CROSSROADS — Signpost', hint: 'the hub', color: palette.cobalt, centre: [0, -30], spawn: [0, -22], heading: 'N', aabb: [-12, -40, 12, -20],
    card: 'North: Skills, Education. West: Experience. East: Projects. South: Contact, Playground. Press 1–8 to teleport.' },
  { id: 'experience', key: '3', short: 'Experience', label: 'EXPERIENCE — Bay Row', hint: 'Tark · Epik · Consulting · DevCom', color: palette.cobalt, centre: [-62, -32], spawn: [-38, -31], heading: 'N', aabb: [-100, -52, -20, -20],
    card: 'Newest nearest the crossroads: Tark (founder) · Epik (founding data engineer) · independent consulting · DevCom, IIT Bombay. The aircraft at the west end flies.' },
  { id: 'projects', key: '4', short: 'Projects', label: 'PROJECTS — Test Stands', hint: 'Screening · InstiApp · Trading · Drone', color: palette.terracotta, centre: [60, -30], spawn: [40, -31], heading: 'N', aabb: [12, -50, 100, -12],
    card: 'Four test stands, one working model each: Rural Patient Screening, InstiApp, Intelligent Trading Agent, On-Device Drone Autonomy. Press ↵ on a pad to open one.' },
  { id: 'skills', key: '5', short: 'Skills', label: 'SKILLS — Pipeline Yard', hint: 'Languages · Data · Pipelines · Cloud · AI', color: palette.steel, centre: [0, -70], spawn: [0, -52], heading: 'N', aabb: [-21, -91, 18, -44],
    card: 'Five tanks, one per group: Languages, Data, Pipelines, Google Cloud, AI. Press ↵ on the pad for the full list.' },
  { id: 'education', key: '6', short: 'Education', label: 'EDUCATION — Control Tower', hint: 'IIT Bombay · Aerospace', color: palette.lamp, centre: [0, -100], spawn: [0, -93], heading: 'N', aabb: [-18, -114, 18, -86],
    card: 'IIT Bombay, B.Tech Aerospace Engineering · Minor in Machine Intelligence and Data Science · Game Dev Hackathon winner.' },
  { id: 'contact', key: '7', short: 'Contact', label: 'CONTACT — Ground Control', hint: 'Email · LinkedIn · GitHub · PDF', color: palette.terracotta, centre: [0, 44], spawn: [0, 50], heading: 'N', aabb: [-20, 32, 20, 60],
    card: 'thakrevedant63@gmail.com · +91 9145190310 — press ↵ on a pad to open.' },
  { id: 'playground', key: '8', short: 'Playground', label: 'PLAYGROUND — Test Range', hint: 'slalom · big air · bowling', color: palette.lamp, centre: [52, 40], spawn: [52, 49], heading: 'N', aabb: [26, 16, 100, 64],
    card: 'Just for fun. Shift to boost, Space to jump.' },
].map((d) => ({ ...d, yaw: HEADING_YAW[d.heading] }))

