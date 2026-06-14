import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MEDIUMS } from '../data/artworks'

// Chevron/carrot SVG for accordion indicators
const CarrotIcon = ({ className = '' }) => (
  <svg
    className={`w-3 h-3 inline-block transition-transform duration-300 ${className}`}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M3 4L6 8L9 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function Sidebar() {
  const [aboutOpen, setAboutOpen] = useState(false)
  const [mediumOpen, setMediumOpen] = useState(false)
  const [socialOpen, setSocialOpen] = useState(false)
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

        {/* Navigation */}
        <nav className="flex flex-col gap-1">
          {/* About (Accordion) */}
          <div className="mb-2">
            <button
              onClick={() => setAboutOpen(!aboutOpen)}
              className="w-full flex items-center justify-between text-sm font-bold uppercase tracking-widest cursor-pointer hover:text-[#00deff] transition-colors duration-300 py-1"
            >
              <span>About</span>
              <CarrotIcon className={aboutOpen ? 'rotate-180' : ''} />
            </button>
            <div
              className={`overflow-hidden transition-all duration-500 ease-out ${
                aboutOpen ? 'max-h-[200px] opacity-100 mt-2' : 'max-h-0 opacity-0'
              }`}
            >
              <p className="text-sm leading-relaxed text-gray-700">
                Kristian Talley is a visual artist and illustrator based in the Bay Area.
                Working across digital and traditional mediums, exploring themes of identity,
                nature, and the surreal.
              </p>
            </div>
          </div>

          {/* Medium (Accordion) */}
          <div className="mb-2">
            <button
              onClick={() => setMediumOpen(!mediumOpen)}
              className="w-full flex items-center justify-between text-sm font-bold uppercase tracking-widest cursor-pointer hover:text-[#00deff] transition-colors duration-300 py-1"
            >
              <span>Medium</span>
              <CarrotIcon className={mediumOpen ? 'rotate-180' : ''} />
            </button>
            <div
              className={`overflow-hidden transition-all duration-500 ease-out ${
                mediumOpen ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0'
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

          {/* Store (Direct Link) */}
          <Link
            to="https://store.kristiantalley.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sm font-bold uppercase tracking-widest cursor-pointer hover:text-[#00deff] transition-colors duration-300 py-1"
          >
            Store
          </Link>

          {/* Social Media (Accordion) */}
          <div className="mt-2">
            <button
              onClick={() => setSocialOpen(!socialOpen)}
              className="w-full flex items-center justify-between text-sm font-bold uppercase tracking-widest cursor-pointer hover:text-[#00deff] transition-colors duration-300 py-1"
            >
              <span>Social media</span>
              <CarrotIcon className={socialOpen ? 'rotate-180' : ''} />
            </button>
            <div
              className={`overflow-hidden transition-all duration-500 ease-out ${
                socialOpen ? 'max-h-[300px] opacity-100 mt-2' : 'max-h-0 opacity-0'
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
                    href="https://design.kristiantalley.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#00deff] transition-colors duration-300"
                  >
                    Web dev portfolio
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/kttalley/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[#00deff] transition-colors duration-300"
                  >
                    Github
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Contact (Direct Link) */}
          <Link
            to="https://store.kristiantalley.com/contact"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sm font-bold uppercase tracking-widest cursor-pointer hover:text-[#00deff] transition-colors duration-300 py-1"
          >
            Contact
          </Link>
        </nav>

        {/* Footer info */}
        <div className="mt-auto text-xs text-gray-400">
          <p>talleykristian@gmail.com</p>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
