import { defineConfig } from 'vite'
import { resume } from './src/content/resume.js'
import { renderResumeHtml } from './src/content/renderResume.js'

/** Injects the rendered resume into index.html so the built page carries the full text. */
function resumeHtml() {
  return {
    name: 'resume-html',
    transformIndexHtml(html) {
      return html.replace('<!-- resume:injected -->', renderResumeHtml(resume))
    },
  }
}

export default defineConfig({
  base: '/',
  plugins: [resumeHtml()],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/cannon-es')) return 'physics'
          return undefined
        },
      },
    },
  },
  server: { port: 5173, strictPort: false },
})
