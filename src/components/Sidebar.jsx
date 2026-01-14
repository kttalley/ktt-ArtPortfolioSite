import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MEDIUMS } from '../data/artworks'

function Sidebar() {
  const [aboutOpen, setAboutOpen] = useState(false)
  const [linksOpen, setLinksOpen] = useState(false)
  const [mediumOpen, setMediumOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()

  // Check if a medium is currently active
  const currentMedium = location.pathname.startsWith('/tagged/')
    ? location.pathname.split('/tagged/')[1]
    : null

  const mediumsList = Object.values(MEDIUMS)

  return (
    <>
      {/* Mobile Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white z-[9999] flex items-center justify-between px-4 border-b border-[#0c0c0c]/10 md:hidden">
        <Link to="/" className="text-2xl font-light tracking-wider hover:text-[#00deff] transition-colors">
          KTT
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 hover:text-[#00deff] transition-colors"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[9998] md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Desktop Sidebar / Mobile Slide-out */}
      <aside
        className={`
          fixed top-0 left-0 h-screen w-[250px] bg-white z-[9999] flex flex-col p-6 border-r border-[#0c0c0c]/10
          transition-transform duration-300 ease-out
          max-md:top-16 max-md:h-[calc(100vh-4rem)]
          ${mobileMenuOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}
        `}
      >
        {/* Title - Desktop only */}
        <div className="mb-8 max-md:hidden">
          <Link to="/">
            <h1 className="text-4xl font-light tracking-wider cursor-pointer hover:text-[#00deff] transition-colors duration-300">
              KTT
            </h1>
          </Link>
        </div>

        {/* About Section */}
        <div
          className="mb-6"
          onMouseEnter={() => setAboutOpen(true)}
          onMouseLeave={() => setAboutOpen(false)}
          onClick={() => setAboutOpen(!aboutOpen)}
        >
          <h4 className="text-sm font-bold uppercase tracking-widest cursor-pointer hover:text-[#00deff] transition-colors duration-300">
            About
          </h4>
          <div
            className={`overflow-hidden transition-all duration-700 ease-out ${
              aboutOpen ? 'max-h-[500px] opacity-100 mt-3' : 'max-h-0 opacity-0'
            }`}
          >
            <p className="text-sm leading-relaxed text-gray-700">
              Kristian Talley is a visual artist and illustrator based in the Bay Area.
              Working across digital and traditional mediums, exploring themes of identity,
              nature, and the surreal.
            </p>
          </div>
        </div>

        {/* Links Section */}
        <div
          className="mb-6"
          onMouseEnter={() => setLinksOpen(true)}
          onMouseLeave={() => setLinksOpen(false)}
          onClick={() => setLinksOpen(!linksOpen)}
        >
          <h4 className="text-sm font-bold uppercase tracking-widest cursor-pointer hover:text-[#00deff] transition-colors duration-300">
            Links
          </h4>
          <div
            className={`overflow-hidden transition-all duration-700 ease-out ${
              linksOpen ? 'max-h-[500px] opacity-100 mt-3' : 'max-h-0 opacity-0'
            }`}
          >
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://instagram.com/kristian.talley"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#00deff] transition-colors duration-300"
                >
                  Instagram
                </a>
              </li>
              <li>
                <a
                  href="https://tumblr.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#00deff] transition-colors duration-300"
                >
                  Tumblr
                </a>
              </li>
              <li>
                <a
                  href="mailto:contact@kristiantalley.com"
                  className="hover:text-[#00deff] transition-colors duration-300"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Medium Section with filter links */}
        <div
          className="mb-6"
          onMouseEnter={() => setMediumOpen(true)}
          onMouseLeave={() => setMediumOpen(false)}
          onClick={() => setMediumOpen(!mediumOpen)}
        >
          <h4 className="text-sm font-bold uppercase tracking-widest cursor-pointer hover:text-[#00deff] transition-colors duration-300">
            Medium
          </h4>
          <div
            className={`overflow-hidden transition-all duration-700 ease-out ${
              mediumOpen ? 'max-h-[500px] opacity-100 mt-3' : 'max-h-0 opacity-0'
            }`}
          >
            <ul className="space-y-2 text-sm">
              {mediumsList.map(medium => (
                <li key={medium}>
                  <Link
                    to={`/tagged/${medium}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`capitalize transition-colors duration-300 ${
                      currentMedium === medium
                        ? 'text-[#00deff]'
                        : 'hover:text-[#00deff]'
                    }`}
                  >
                    {medium}
                  </Link>
                </li>
              ))}
              <li className="pt-2 border-t border-gray-200 mt-2">
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`transition-colors duration-300 ${
                    location.pathname === '/' && !currentMedium
                      ? 'text-[#00deff]'
                      : 'hover:text-[#00deff]'
                  }`}
                >
                  All Works
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-auto text-xs text-gray-400">
          <p>talleykristian@gmail.com</p>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
