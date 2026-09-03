import { resume } from '../content/resume.js'
import { renderResumeHtml, esc } from '../content/renderResume.js'
import { EventEmitter } from '../core/EventEmitter.js'

const $ = (id) => document.getElementById(id)

/** Resume order for the detail panel's prev/next. */
export const ENTRY_ORDER = ['tark', 'epik', 'consulting', 'devcom', 'screening', 'instiapp', 'trading', 'drone', 'skills', 'education', 'contact']
const ENTRY_TITLES = { tark: 'Tark', epik: 'Epik', consulting: 'Consulting', devcom: 'DevCom', screening: 'Rural Screening', instiapp: 'InstiApp', trading: 'Trading Agent', drone: 'Drone', skills: 'Skills', education: 'Education', contact: 'Contact' }
const STRIP = { experience: '#3D5A80', project: '#E07A5F', skills: '#81B29A', education: '#FFD166', contact: '#E07A5F', about: '#3D5A80' }

/**
 * All DOM overlays: start screen, top bar, section label, chips, card, detail panel, map, help,
 * text resume, toasts, touch action button.
 * Emits: 'start', 'teleport' ({id}), 'mute', 'interact', 'reset-section', 'reset-all', 'card-details',
 *        'modal-open', 'modal-close', 'panel-open', 'panel-close', 'resume-open', 'resume-close'.
 */
export class UI extends EventEmitter {
  constructor({ isTouch }) {
    super()
    this.isTouch = isTouch
    this.el = {
      start: $('start'), startBar: $('start-bar'), startBtn: $('start-btn'), startHint: $('start-hint'), startTextLink: $('start-text-link'),
      hud: $('hud'), btnMap: $('btn-map'), btnText: $('btn-text'), btnHelp: $('btn-help'), btnMute: $('btn-mute'), btnContact: $('btn-contact'),
      action: $('action-btn'), toast: $('toast'), sectionLabel: $('section-label'), chips: $('chips'), fade: $('fade'),
      card: $('card'), cardText: $('card-text'), cardDetails: $('card-details'), cardNoAuto: $('card-noauto'), cardClose: $('card-close'),
      panel: $('panel'), panelInner: $('panel-inner'), panelClose: $('panel-close'),
      map: $('map'), mapList: $('map-list'), mapResetSection: $('map-reset-section'), mapResetAll: $('map-reset-all'),
      help: $('help'), resume: $('resume'), resumeBody: $('resume-body'),
    }
    this.openModal = null
    this.panelOpen = false
    this.currentEntry = null
    this.chips = new Map()
    this._toastTimer = null
    this._cardTimer = null
    this._labelTimer = null
    this._bind()
    if (!this.el.resumeBody.children.length) this.el.resumeBody.innerHTML = renderResumeHtml(resume)
    if (isTouch) {
      this.el.startHint.innerHTML = 'Drag the joystick to drive · tap <b>BOOST</b> and <b>JUMP</b>'
      $('keys-desktop').classList.add('hidden')
    } else {
      $('keys-touch').classList.add('hidden')
    }
    try { this.el.cardNoAuto.checked = localStorage.getItem('portfolio-noauto') === '1' } catch { /* ignore */ }
  }

  _bind() {
    const e = this.el
    e.startBtn.addEventListener('click', () => this.emit('start'))
    e.startTextLink.addEventListener('click', (ev) => { ev.preventDefault(); this.showResume() })
    e.btnMap.addEventListener('click', () => this.toggleModal('map'))
    e.btnHelp.addEventListener('click', () => this.toggleModal('help'))
    e.btnText.addEventListener('click', () => this.showResume())
    e.btnMute.addEventListener('click', () => this.emit('mute'))
    e.btnContact.addEventListener('click', () => this.showEntry('contact'))
    e.panelClose.addEventListener('click', () => this.closePanel())
    e.action.addEventListener('click', () => this.emit('interact'))
    e.mapResetSection.addEventListener('click', () => { this.closeModal(); this.emit('reset-section') })
    e.mapResetAll.addEventListener('click', () => { this.closeModal(); this.emit('reset-all') })
    e.cardClose.addEventListener('click', () => this.hideCard())
    e.cardDetails.addEventListener('click', () => { const id = e.card.dataset.section; this.hideCard(); this.emit('card-details', id) })
    e.cardNoAuto.addEventListener('change', () => { try { localStorage.setItem('portfolio-noauto', e.cardNoAuto.checked ? '1' : '0') } catch { /* ignore */ } })
    document.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => this.closeModal()))
    for (const name of ['map', 'help']) {
      e[name].addEventListener('click', (ev) => { if (ev.target === e[name]) this.closeModal() })
    }
    if (location.hash === '#resume') setTimeout(() => this.showResume(), 0)
  }

  /* ---------------- start screen ---------------- */

  setProgress(p) { this.el.startBar.style.width = `${Math.round(p * 100)}%` }

  setReady() {
    this.el.startBtn.disabled = false
    this.el.startBtn.textContent = 'Start driving'
    this.el.startBtn.focus({ preventScroll: true })
  }

  hideStart() {
    this.el.start.classList.add('leaving')
    setTimeout(() => this.el.start.classList.add('hidden'), 700)
    this.el.hud.classList.remove('hidden')
  }

  /** Start-screen fallback when WebGL/font fails: send people to the text resume. */
  failToText(message) {
    this.el.startBtn.textContent = 'Read the resume'
    this.el.startBtn.disabled = false
    this.el.startBtn.onclick = () => this.showResume()
    this.el.startHint.textContent = message
  }

  /* ---------------- HUD ---------------- */

  setMuted(muted) {
    this.el.btnMute.setAttribute('aria-pressed', muted ? 'true' : 'false')
    this.el.btnMute.title = muted ? 'Unmute (L)' : 'Mute (L)'
  }

  setActionVisible(visible, label = 'OPEN') {
    if (!this.isTouch) return
    if (this.el.action.textContent !== label) this.el.action.textContent = label
    this.el.action.classList.toggle('hidden', !visible)
  }

  toast(message, ms = 2200) {
    const t = this.el.toast
    t.innerHTML = message
    t.classList.remove('hidden')
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => t.classList.add('hidden'), ms)
  }

  showSectionLabel(text) {
    const el = this.el.sectionLabel
    el.textContent = text
    el.classList.remove('hidden')
    el.style.animation = 'none'
    void el.offsetWidth
    el.style.animation = ''
    clearTimeout(this._labelTimer)
    this._labelTimer = setTimeout(() => el.classList.add('hidden'), 1250)
  }

  /** Chips are small counters (PINS 3 / 10). Pass null to remove. */
  setChip(id, text) {
    let el = this.chips.get(id)
    if (text == null) {
      if (el) { el.remove(); this.chips.delete(id) }
      return
    }
    if (!el) {
      el = document.createElement('div')
      el.className = 'chip'
      this.el.chips.appendChild(el)
      this.chips.set(id, el)
    }
    if (el.textContent !== text) el.textContent = text
  }

  showCard(def) {
    if (this.el.cardNoAuto.checked) return
    const e = this.el
    e.cardText.textContent = def.card
    e.card.dataset.section = def.id
    e.cardDetails.classList.toggle('hidden', !['intro', 'experience', 'projects', 'skills', 'education', 'contact'].includes(def.id))
    e.card.classList.remove('hidden')
    clearTimeout(this._cardTimer)
    this._cardTimer = setTimeout(() => this.hideCard(), 6000)
  }

  hideCard() { this.el.card.classList.add('hidden') }

  /** Brief flash used on teleports. */
  fade() {
    const f = this.el.fade
    f.classList.add('on')
    setTimeout(() => f.classList.remove('on'), 140)
  }

  /* ---------------- modals ---------------- */

  get anyOpen() {
    return !!this.openModal || this.panelOpen || !this.el.resume.classList.contains('hidden')
  }

  toggleModal(name) {
    if (this.openModal === name) this.closeModal()
    else this.showModal(name)
  }

  showModal(name) {
    this.closeModal()
    this.closePanel()
    this.openModal = name
    this.el[name].classList.remove('hidden')
    this.emit('modal-open', name)
  }

  closeModal() {
    if (!this.openModal) return
    this.el[this.openModal].classList.add('hidden')
    this.openModal = null
    this.emit('modal-close')
  }

  closeTop() {
    if (!this.el.resume.classList.contains('hidden')) { this.hideResume(); return true }
    if (this.openModal) { this.closeModal(); return true }
    if (this.panelOpen) { this.closePanel(); return true }
    return false
  }

  setMapSections(sections) {
    this.el.mapList.innerHTML = ''
    sections.forEach((s, i) => {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.innerHTML = `<span class="dot" style="background:${esc(s.color)}"></span><kbd>${i + 1}</kbd>&nbsp;${esc(s.label)}<small>${esc(s.hint || '')}</small>`
      btn.addEventListener('click', () => { this.closeModal(); this.emit('teleport', s) })
      li.appendChild(btn)
      this.el.mapList.appendChild(li)
    })
  }

  /* ---------------- detail panel ---------------- */

  showPanel(html, { entry = null, strip = null } = {}) {
    this.closeModal()
    this.currentEntry = entry
    const nav = entry ? this._navHtml(entry) : ''
    const stripHtml = strip ? `<div class="section-strip" style="background:${strip}"></div>` : ''
    this.el.panelInner.innerHTML = stripHtml + html + nav
    this.el.panelInner.querySelectorAll('[data-entry]').forEach((b) => b.addEventListener('click', () => this.showEntry(b.dataset.entry)))
    const wasOpen = this.panelOpen
    this.panelOpen = true
    this.el.panel.classList.remove('hidden')
    this.el.panelInner.scrollTop = 0
    if (!wasOpen) this.emit('panel-open')
  }

  _navHtml(entry) {
    const i = ENTRY_ORDER.indexOf(entry)
    if (i < 0) return ''
    const prev = ENTRY_ORDER[(i - 1 + ENTRY_ORDER.length) % ENTRY_ORDER.length]
    const next = ENTRY_ORDER[(i + 1) % ENTRY_ORDER.length]
    return `<div class="panel-nav"><button type="button" data-entry="${prev}">‹ ${esc(ENTRY_TITLES[prev])}</button><button type="button" data-entry="${next}">${esc(ENTRY_TITLES[next])} ›</button></div>`
  }

  closePanel() {
    if (!this.panelOpen) return
    this.panelOpen = false
    this.currentEntry = null
    this.el.panel.classList.add('hidden')
    this.emit('panel-close')
  }

  /** Toggle semantics for pads: pressing again on the same entry closes it. */
  togglePanel(entry) {
    if (this.panelOpen && this.currentEntry === entry) this.closePanel()
    else this.showEntry(entry)
  }

  showEntry(id) {
    if (resume.experience.some((x) => x.id === id)) return this.showExperience(id)
    if (resume.projects.some((p) => p.id === id)) return this.showProject(id)
    if (id === 'skills') return this.showSkills()
    if (id === 'education') return this.showEducation()
    if (id === 'contact') return this.showContact()
    if (id === 'about') return this.showAbout()
    return undefined
  }

  _closeHint() {
    return `<p class="hint">${this.isTouch ? 'Tap × or drive away to close.' : 'Press <kbd>Esc</kbd> or drive away to close.'}</p>`
  }

  showExperience(id) {
    const x = resume.experience.find((e) => e.id === id)
    if (!x) return
    this.showPanel(`
      <p class="kicker">Experience</p>
      <h2>${esc(x.company)}</h2>
      <p class="role">${esc(x.role)}</p>
      <p class="period">${esc(x.period)}</p>
      ${x.stats ? `<div class="stats">${x.stats.map((s) => `<div class="stat"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>` : ''}
      <ul>${x.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      ${this._closeHint()}
    `, { entry: id, strip: STRIP.experience })
  }

  showProject(id) {
    const p = resume.projects.find((e) => e.id === id)
    if (!p) return
    this.showPanel(`
      <p class="kicker">Project</p>
      <h2>${esc(p.title)}</h2>
      <p class="role">${esc(p.subtitle)}</p>
      <div class="tags" style="margin-top:12px">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <p>${esc(p.description)}</p>
      <div class="links"><a class="link" href="${esc(resume.contact.github)}" target="_blank" rel="noopener">GitHub <small>${esc(resume.contact.githubLabel)}</small></a></div>
      ${this._closeHint()}
    `, { entry: id, strip: STRIP.project })
  }

  showSkills() {
    const groups = resume.skills.map((g) => `<p class="kicker" style="margin-top:14px">${esc(g.group)}</p><div class="tags">${g.items.map((i) => `<span class="tag">${esc(i)}</span>`).join('')}</div>`).join('')
    this.showPanel(`
      <p class="kicker">Technical skills</p>
      <h2>Skills</h2>
      ${groups}
      <p style="margin-top:16px">Python, TypeScript/JavaScript, SQL, Bash, Dart; Trino, BigQuery, Snowflake, PostgreSQL, Firestore, Redis; warehouse &amp; star-schema design, ETL/ELT, event-driven pipelines, semantic layers, query optimisation; GCP (Cloud Functions, Cloud Run, Cloud Scheduler, Pub/Sub, BigQuery, Compute Engine), Firebase; LLM agent systems, text-to-SQL, MCP servers, ML pipelines.</p>
      ${this._closeHint()}
    `, { entry: 'skills', strip: STRIP.skills })
  }

  showEducation() {
    const e = resume.education
    this.showPanel(`
      <p class="kicker">Education</p>
      <h2>${esc(e.school)}</h2>
      <p class="role">${esc(e.degree)}</p>
      <p class="period">${esc(e.minor)}</p>
      <p>${esc(e.coursework)}</p>
      <p class="kicker" style="margin-top:20px">Award</p>
      ${resume.awards.map((a) => `<h2 style="font-size:1.2rem">${esc(a.title)}</h2><p>${esc(a.description)}</p>`).join('')}
      ${this._closeHint()}
    `, { entry: 'education', strip: STRIP.education })
  }

  showAbout() {
    this.showPanel(`
      <p class="kicker">About</p>
      <h2>${esc(resume.name)}</h2>
      <p class="role">${esc(resume.tagline)}</p>
      <p style="margin-top:14px">${esc(resume.summary)}</p>
      <div class="links">
        <a class="link primary" href="${esc(resume.contact.resumePdf)}" download>Download resume <small>PDF</small></a>
        <a class="link" href="mailto:${esc(resume.contact.email)}">Email <small>${esc(resume.contact.email)}</small></a>
      </div>
    `, { entry: 'about', strip: STRIP.about })
  }

  showContact() {
    const c = resume.contact
    this.showPanel(`
      <p class="kicker">Say hello</p>
      <h2>Let’s talk.</h2>
      <p>Open to roles and collaborations in autonomous decision systems, data infrastructure and applied AI.</p>
      <div class="links">
        <a class="link primary" href="mailto:${esc(c.email)}">Email <small>${esc(c.email)}</small></a>
        <a class="link" href="${esc(c.linkedin)}" target="_blank" rel="noopener">LinkedIn <small>${esc(c.linkedinLabel)}</small></a>
        <a class="link" href="${esc(c.github)}" target="_blank" rel="noopener">GitHub <small>${esc(c.githubLabel)}</small></a>
        <a class="link" href="tel:${esc(c.phone.replace(/\s+/g, ''))}">Phone <small>${esc(c.phone)}</small></a>
        <a class="link" href="${esc(c.resumePdf)}" download>Resume <small>PDF</small></a>
      </div>
    `, { entry: 'contact', strip: STRIP.contact })
  }

  /* ---------------- text resume ---------------- */

  toggleResume() {
    if (this.el.resume.classList.contains('hidden')) this.showResume()
    else this.hideResume()
  }

  showResume() {
    this.closeModal()
    this.closePanel()
    this.el.resume.classList.remove('hidden')
    this.el.resume.focus({ preventScroll: true })
    if (location.hash !== '#resume') history.replaceState(null, '', '#resume')
    this.emit('resume-open')
  }

  hideResume() {
    if (this.el.resume.classList.contains('hidden')) return
    this.el.resume.classList.add('hidden')
    if (location.hash === '#resume') history.replaceState(null, '', location.pathname)
    this.emit('resume-close')
  }
}
