/**
 * Renders the resume data as semantic HTML. Used at build time (Vite plugin) so the shipped
 * index.html carries the full text for crawlers, and at runtime as a fallback.
 */
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function renderResumeHtml(r) {
  const exp = r.experience.map((x) => `
      <h4>${esc(x.company)} — ${esc(x.role)}</h4>
      <p class="meta">${esc(x.period)}</p>
      <ul>${x.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`).join('')
  const projects = r.projects.map((p) => `<li><b>${esc(p.title)}</b> (${esc(p.subtitle)}): ${esc(p.description)}</li>`).join('')
  const skills = r.skills.map((g) => `<div class="skill-row"><b>${esc(g.group)}</b>${g.items.map((i) => `<span class="tag">${esc(i)}</span>`).join('')}</div>`).join('')
  return `
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
