#!/usr/bin/env node
// prerender.mjs: runs after `vite build` and the SSR build (see package.json "build").
// Writes dist/<route>/index.html for the home gallery, every /tagged/:medium page and every
// /post/:id page, so crawlers and visitors without JavaScript get real content instead of
// "Loading...". The browser still mounts the app with createRoot, replacing this markup.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DIST = 'dist'
const SSR_ENTRY = pathToFileURL(path.resolve('dist-ssr/entry-server.js')).href
const { render, routes } = await import(SSR_ENTRY)
const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1]

// Key identifying a head tag, so a page's tag can replace the template's default.
function keyOf(tag) {
  if (/^<title/i.test(tag)) return 'title'
  if (/^<link/i.test(tag)) return `link:${attr(tag, 'rel')}`
  const name = attr(tag, 'name'); if (name) return `name:${name}`
  const prop = attr(tag, 'property'); if (prop) return `property:${prop}`
  return null
}

const HEAD_TAG = /<title>[\s\S]*?<\/title>|<meta\s[^>]*?(?:name|property)="[^"]*"[^>]*\/?>|<link\s[^>]*?rel="canonical"[^>]*\/?>/gi

function buildPage(url) {
  let body = render(url)
  const pageTags = new Map()
  body = body.replace(HEAD_TAG, (tag) => { const k = keyOf(tag); if (k) pageTags.set(k, tag); return '' })

  // Fill in social-preview tags the page didn't set from its own title/description/canonical.
  const title = (pageTags.get('title') || '').replace(/<\/?title>/g, '')
  const desc = pageTags.has('name:description') ? attr(pageTags.get('name:description'), 'content') : null
  const canon = pageTags.has('link:canonical') ? attr(pageTags.get('link:canonical'), 'href') : null
  const fill = (k, tag) => { if (!pageTags.has(k)) pageTags.set(k, tag) }
  if (title) { fill('property:og:title', `<meta property="og:title" content="${title}" />`); fill('name:twitter:title', `<meta name="twitter:title" content="${title}" />`) }
  if (desc) { fill('property:og:description', `<meta property="og:description" content="${desc}" />`); fill('name:twitter:description', `<meta name="twitter:description" content="${desc}" />`) }
  if (canon) fill('property:og:url', `<meta property="og:url" content="${canon}" />`)

  let head = template.slice(0, template.indexOf('</head>'))
  const rest = template.slice(template.indexOf('</head>'))
  head = head.replace(HEAD_TAG, (tag) => (pageTags.has(keyOf(tag)) ? '' : tag))
  head = head.replace(/\n\s*\n\s*\n/g, '\n\n') + '    ' + [...pageTags.values()].join('\n    ') + '\n  '
  return (head + rest).replace('<div id="root"></div>', `<div id="root">${body}</div>`)
}

let count = 0
for (const url of routes()) {
  const html = buildPage(url)
  const out = url === '/' ? path.join(DIST, 'index.html') : path.join(DIST, url, 'index.html')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, html)
  count++
}
console.log(`prerendered ${count} pages`)
