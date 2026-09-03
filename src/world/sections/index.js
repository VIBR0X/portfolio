import { SECTION_DEFS } from './registry.js'
import { IntroSection } from './Intro.js'
import { CrossroadsSection } from './Crossroads.js'
import { ExperienceSection } from './Experience.js'
import { ProjectsSection } from './Projects.js'
import { SkillsSection } from './Skills.js'
import { EducationSection } from './Education.js'
import { ContactSection } from './Contact.js'
import { PlaygroundSection } from './Playground.js'

export { SECTION_DEFS, HEADING_YAW } from './registry.js'

const CLASSES = {
  intro: IntroSection,
  crossroads: CrossroadsSection,
  experience: ExperienceSection,
  projects: ProjectsSection,
  skills: SkillsSection,
  education: EducationSection,
  contact: ContactSection,
  playground: PlaygroundSection,
}

export function buildSections(world) {
  for (const def of SECTION_DEFS) {
    const Cls = CLASSES[def.id]
    try {
      world.addSection(new Cls(world, def))
    } catch (err) {
      console.error(`Section ${def.id} failed to build`, err)
      if (world.strict) throw err
    }
  }
}
