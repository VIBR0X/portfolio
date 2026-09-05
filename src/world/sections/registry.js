import { palette } from '../Materials.js'

/** Car faces -z at yaw 0. */
export const HEADING_YAW = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }

/**
 * Section registry (from the panel spec §3): centre, teleport spawn, heading, AABB, colour, copy.
 */
export const SECTION_DEFS = [
  { id: 'intro', key: '1', short: 'Intro', label: 'INTRO — Runway 00', hint: 'start', color: palette.terracotta, centre: [0, 0], spawn: [0, 4], heading: 'N', aabb: [-16, -20, 16, 14],
    card: 'Vedant Thakre — engineer, decision systems & data infra. Drive north, or press M for the map.' },
  { id: 'crossroads', key: '2', short: 'Crossroads', label: 'CROSSROADS — Signpost', hint: 'signpost', color: palette.cobalt, centre: [0, -30], spawn: [0, -18], heading: 'N', aabb: [-12, -40, 12, -20],
    card: 'North: Skills, Education. West: Experience. East: Projects. South: Contact, Playground. Press 1–8 to teleport.' },
  { id: 'experience', key: '3', short: 'Experience', label: 'EXPERIENCE — Hangar Row', hint: 'Tark · Epik · consulting · DevCom', color: palette.cobalt, centre: [-60, -30], spawn: [-40, -31], heading: 'N', aabb: [-100, -50, -12, -20],
    card: 'Tark (founder) · Epik (founding data engineer) · independent consulting · DevCom IIT Bombay (lead of 21 devs). Newest nearest the crossroads.' },
  { id: 'projects', key: '4', short: 'Projects', label: 'PROJECTS — Launch Pads', hint: '4 projects', color: palette.terracotta, centre: [60, -30], spawn: [40, -31], heading: 'N', aabb: [12, -50, 100, -12],
    card: 'Rural Patient Screening · InstiApp · Intelligent Trading Agent · On-Device Drone Autonomy.' },
  { id: 'skills', key: '5', short: 'Skills', label: 'SKILLS — Pipeline Yard', hint: 'tanks & pipes', color: palette.steel, centre: [0, -70], spawn: [0, -52], heading: 'N', aabb: [-18, -86, 18, -44],
    card: 'Five tanks, one per category. Press ↵ on the pad for the full list.' },
  { id: 'education', key: '6', short: 'Education', label: 'EDUCATION — Control Tower', hint: 'IIT Bombay', color: palette.lamp, centre: [0, -100], spawn: [0, -88], heading: 'N', aabb: [-18, -114, 18, -86],
    card: 'IIT Bombay, B.Tech Aerospace Engineering · Minor in Machine Intelligence and Data Science · Game Dev Hackathon winner.' },
  { id: 'contact', key: '7', short: 'Contact', label: 'CONTACT — Ground Control', hint: 'say hello', color: palette.terracotta, centre: [0, 44], spawn: [0, 50], heading: 'N', aabb: [-20, 32, 20, 60],
    card: 'thakrevedant63@gmail.com · +91 9145190310 — press ↵ on a pad to open.' },
  { id: 'playground', key: '8', short: 'Playground', label: 'PLAYGROUND — Test Range', hint: 'just for fun', color: palette.lamp, centre: [52, 40], spawn: [52, 49], heading: 'N', aabb: [26, 16, 100, 64],
    card: 'Just for fun. Shift to boost, Space to jump.' },
].map((d) => ({ ...d, yaw: HEADING_YAW[d.heading] }))

