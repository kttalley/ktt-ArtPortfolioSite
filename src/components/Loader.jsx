import { useState, useEffect } from 'react'

function Loader({ onComplete }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // Simulate initial load
    const timer = setTimeout(() => {
      setVisible(false)
      if (onComplete) onComplete()
    }, 1500)

    return () => clearTimeout(timer)
  }, [onComplete])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-[999999] bg-white flex items-center justify-center transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex flex-col items-center">
        <div className="loader mb-4"></div>
        <p className="text-sm text-gray-500 tracking-wider">Loading...</p>
      </div>
    </div>
  )
}

export default Loader
