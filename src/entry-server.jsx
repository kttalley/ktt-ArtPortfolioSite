import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { AppShell } from './App.jsx'
import { allArtworks, MEDIUMS } from './data/artworks'

export function render(url) {
  return renderToString(
    <StaticRouter location={url}>
      <AppShell />
    </StaticRouter>
  )
}

// Every route worth prerendering: the home gallery, each medium, each artwork.
export function routes() {
  return [
    '/',
    ...Object.keys(MEDIUMS).map((m) => `/tagged/${m}`),
    ...allArtworks.map((a) => `/post/${a.id}`),
  ]
}
