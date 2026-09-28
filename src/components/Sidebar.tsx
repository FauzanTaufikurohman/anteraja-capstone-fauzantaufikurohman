import logo from '../assets/logo.png'
import type { Shipment } from '../lib/shipments'
import { rangeFor } from '../lib/shipments'

type Props = { path: string; shipments: Shipment[]; navigate: (href: string) => void }

const links = [
  { href: '/', label: 'Dashboard', icon: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" /> },
  { href: '/monitoring', label: 'Monitoring', icon: <path d="M3 12h4l2-7 4 14 2-7h6" /> },
  { href: '/simulation', label: 'Simulation', icon: <path d="M12 3 2.8 20h18.4L12 3Z" /> },
  { href: '/notifications', label: 'Notifikasi', icon: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /><path d="M12 4v4M12 11v.01" /></> },
]

export default function Sidebar({ path, shipments, navigate }: Props) {
  const alerts = shipments.filter((shipment) => { const range = rangeFor(shipment); return shipment.temperature < range.min || shipment.temperature > range.max }).length
  return <aside className="fixed inset-x-0 bottom-0 z-40 flex h-[76px] border-t border-line bg-white shadow-[0_-8px_24px_rgba(33,33,33,0.08)] lg:inset-y-0 lg:left-0 lg:right-auto lg:bottom-auto lg:h-screen lg:w-64 lg:flex-col lg:border-r lg:border-t-0 lg:shadow-none" aria-label="Navigasi utama">
    <div className="hidden border-b border-line px-6 py-5 lg:block"><a href="/" onClick={(event) => { event.preventDefault(); navigate('/') }} className="flex items-center gap-3" aria-label="Anteraja Pharma Dashboard"><img src={logo} alt="Anteraja Pharma" className="h-20 w-40 object-contain" /></a></div>
    <nav className="flex w-full items-stretch justify-around gap-1 p-2 text-sm lg:block lg:space-y-1 lg:p-4">
      {links.map((link) => <a key={link.href} href={link.href} data-route={link.href} onClick={(event) => { event.preventDefault(); navigate(link.href) }} aria-label={link.href === '/notifications' ? `Notifications, ${alerts} unread` : undefined} className={`nav-item relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold lg:flex-row lg:gap-3 lg:px-4 lg:py-3 lg:text-sm ${path === link.href ? 'active' : ''}`}>
        <svg className="nav-icon h-5 w-5" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{link.icon}</svg><span>{link.label}</span>{link.href === '/notifications' && alerts > 0 && <span className="notification-badge absolute right-2 top-1 lg:right-3 lg:top-1/2 lg:-translate-y-1/2" aria-hidden="true">{alerts}</span>}
      </a>)}
    </nav>
  </aside>
}