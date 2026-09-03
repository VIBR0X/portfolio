import { resume } from '../content/resume.js'
import { EventEmitter } from '../core/EventEmitter.js'

const $ = (id) => document.getElementById(id)

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/**
 * All DOM overlays: start screen, HUD, detail panel, map, help, text résumé, toast, touch action button.
 * Emits: 'start', 'teleport' (section), 'mute', 'respawn', 'panel-open', 'panel-close'.
 */
export class UI extends EventEmitter {
  constructor({ isTouch }) {
    super()
    this.isTouch = isTouch
    this.el = {
      start: $('start'), startBar: $('start-bar'), startBtn: $('start-btn'), startHint: $('start-hint'), startTextLink: $('start-text-link'),
      hud: $('hud'), btnMap: $('btn-map'), btnText: $('btn-text'), btnHelp: $('btn-help'), btnMute: $('btn-mute'),
      action: $('action-btn'), toast: $('toast'),
      panel: $('panel'), panelInner: $('panel-inner'), panelClose: $('panel-close'),
      map: $('map'), mapList: $('map-list'), help: $('help'), resume: $('resume'), resumeBody: $('resume-body'),
    }
    this.openModal = null
    this._toastTimer = null
    this._bind()
    this._renderResume()
    if (isTouch) {
      this.el.startHint.innerHTML = 'Drag the joystick to drive · tap <b>BOOST</b> and <b>JUMP</b>'
      $('keys-desktop').classList.add('hidden')
    } else {
      $('keys-touch').classList.add('hidden')
    }
  }

  _bind() {
    const e = this.el
    e.startBtn.addEventListener('click', () => this.emit('start'))
    e.startTextLink.addEventListener('click', (ev) => { ev.preventDefault(); this.showResume() })
    e.btnMap.addEventListener('click', () => this.toggleModal('map'))
    e.btnHelp.addEventListener('click', () => this.toggleModal('help'))
    e.btnText.addEventListener('click', () => this.showResume())
    e.btnMute.addEventListener('click', () => this.emit('mute'))
    e.panelClose.addEventListener('click', () => this.closePanel())
    e.action.addEventListener('click', () => this.emit('interact'))
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => this.closeModal())
    })
    for (const name of ['map', 'help']) {
      e[name].addEventListener('click', (ev) => { if (ev.target === e[name]) this.closeModal() })
    }
    if (location.hash === '#resume') {
      // Deep link straight to the text résumé (crawlers, screen readers, low-end devices)
      setTimeout(() => this.showResume(), 0)
    }
  }

  /* ---------------- start screen ---------------- */

  setProgress(p) {
    this.el.startBar.style.width = `${Math.round(p * 100)}%`
  }

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

  /* ---------------- HUD ---------------- */

  setMuted(muted) {
    this.el.btnMute.setAttribute('aria-pressed', muted ? 'true' : 'false')
    this.el.btnMute.title = muted ? 'Unmute (L)' : 'Mute (L)'
  }

  setActionVisible(visible, label = 'OPEN') {
    if (!this.isTouch) return
    this.el.action.textContent = label
    this.el.action.classList.toggle('hidden', !visible)
  }

  toast(message, ms = 2600) {
    const t = this.el.toast
    t.innerHTML = message
    t.classList.remove('hidden')
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => t.classList.add('hidden'), ms)
  }

  /* ---------------- modals ---------------- */

  get anyOpen() {
    return !!this.openModal || !this.el.panel.classList.contains('hidden') || !this.el.resume.classList.contains('hidden')
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
    if (!this.openModal) {
      if (!this.el.resume.classList.contains('hidden')) this.hideResume()
      return
    }
    this.el[this.openModal].classList.add('hidden')
    this.openModal = null
    this.emit('modal-close')
  }

  /** Escape / back handling: closes whatever is on top. Returns true if something closed. */
  closeTop() {
    if (!this.el.resume.classList.contains('hidden')) { this.hideResume(); return true }
    if (this.openModal) { this.closeModal(); return true }
    if (!this.el.panel.classList.contains('hidden')) { this.closePanel(); return true }
    return false
  }

  setMapSections(sections) {
    this.el.mapList.innerHTML = ''
    for (const s of sections) {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.innerHTML = `<span class="dot" style="background:${esc(s.color)}"></span>${esc(s.label)}<small>${esc(s.hint || '')}</small>`
      btn.addEventListener('click', () => { this.closeModal(); this.emit('teleport', s) })
      li.appendChild(btn)
      this.el.mapList.appendChild(li)
    }
  }

  /* ---------------- detail panel ---------------- */

  showPanel(html) {
    this.closeModal()
    this.el.panelInner.innerHTML = html
    this.el.panel.classList.remove('hidden')
    this.el.panelInner.scrollTop = 0
    this.emit('panel-open')
  }

  closePanel() {
    if (this.el.panel.classList.contains('hidden')) return
    this.el.panel.classList.add('hidden')
    this.emit('panel-close')
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
      <p class="hint">${this.isTouch ? 'Tap × or drive away to close.' : 'Press <kbd>Esc</kbd> or drive away to close.'}</p>
    `)
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
      <p class="hint">${this.isTouch ? 'Tap × or drive away to close.' : 'Press <kbd>Esc</kbd> or drive away to close.'}</p>
    `)
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
    `)
  }

  showAbout() {
    this.showPanel(`
      <p class="kicker">About</p>
      <h2>${esc(resume.name)}</h2>
      <p class="role">${esc(resume.tagline)}</p>
      <p style="margin-top:14px">${esc(resume.summary)}</p>
      <div class="links">
        <a class="link primary" href="${esc(resume.contact.resumePdf)}" download>Download résumé <small>PDF</small></a>
        <a class="link" href="mailto:${esc(resume.contact.email)}">Email <small>${esc(resume.contact.email)}</small></a>
      </div>
    `)
  }

  showContact() {
    const c = resume.contact
    this.showPanel(`
      <p class="kicker">Say hello</p>
      <h2>Let’s build something.</h2>
      <p>Open to roles and collaborations in autonomous decision systems, data infrastructure and applied AI.</p>
      <div class="links">
        <a class="link primary" href="mailto:${esc(c.email)}">Email <small>${esc(c.email)}</small></a>
        <a class="link" href="${esc(c.linkedin)}" target="_blank" rel="noopener">LinkedIn <small>${esc(c.linkedinLabel)}</small></a>
        <a class="link" href="${esc(c.github)}" target="_blank" rel="noopener">GitHub <small>${esc(c.githubLabel)}</small></a>
        <a class="link" href="tel:${esc(c.phone.replace(/\s+/g, ''))}">Phone <small>${esc(c.phone)}</small></a>
        <a class="link" href="${esc(c.resumePdf)}" download>Résumé <small>PDF</small></a>
      </div>
    `)
  }

  /* ---------------- text résumé ---------------- */

  showResume() {
    this.closeModal()
    this.closePanel()
    this.el.resume.classList.remove('hidden')
    this.el.resume.focus({ preventScroll: true })
    if (location.hash !== '#resume') history.replaceState(null, '', '#resume')
    this.emit('resume-open')
  }

  hideResume() {
    this.el.resume.classList.add('hidden')
    if (location.hash === '#resume') history.replaceState(null, '', location.pathname)
    this.emit('resume-close')
  }

  _renderResume() {
    const r = resume
    const exp = r.experience.map((x) => `
      <h4>${esc(x.company)} — ${esc(x.role)}</h4>
      <p class="meta">${esc(x.period)}</p>
      <ul>${x.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`).join('')
    const projects = r.projects.map((p) => `<li><b>${esc(p.title)}</b> (${esc(p.subtitle)}): ${esc(p.description)}</li>`).join('')
    const skills = r.skills.map((g) => `<div class="skill-row"><b>${esc(g.group)}</b>${g.items.map((i) => `<span class="tag">${esc(i)}</span>`).join('')}</div>`).join('')
    this.el.resumeBody.innerHTML = `
      <h3>Summary</h3><p>${esc(r.summary)}</p>
      <h3>Experience</h3>${exp}
      <h3>Selected projects</h3><ul>${projects}</ul>
      <h3>Technical skills</h3>${skills}
      <h3>Education &amp; awards</h3>
      <h4>${esc(r.education.school)}</h4>
      <p class="meta">${esc(r.education.degree)} · ${esc(r.education.minor)}</p>
      <p>${esc(r.education.coursework)}</p>
      <ul>${r.awards.map((a) => `<li><b>${esc(a.title)}.</b> ${esc(a.description)}</li>`).join('')}</ul>
    `
  }
}
