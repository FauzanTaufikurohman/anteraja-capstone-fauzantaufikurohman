import { useState } from 'react'
import { createThermalConfig, createThermalState, readShipments, rangeFor, statusFor, writeShipments, type Shipment } from '../../lib/shipments'

type Props = { onNotify: (message: string) => void; onRefresh: () => void }
type FormState = { origin: string; destination: string; weight: string; category: string }
const emptyForm: FormState = { origin: 'APOTEK JAYA ABADI', destination: 'APOTEK MANDIRI', weight: '2.5', category: 'Cold chain' }
const places = ['APOTEK JAYA ABADI', 'APOTEK MANDIRI', 'APOTEK GILA PHARMA']

export default function Dashboard({ onNotify, onRefresh }: Props) {
    const shipments = readShipments()
    const active = shipments.filter((shipment) => shipment.status === 'Dalam pengantaran')
    const alerts = shipments.filter((shipment) => { const range = rangeFor(shipment); return shipment.temperature < range.min || shipment.temperature > range.max })
    const [modalOpen, setModalOpen] = useState(Boolean(new URLSearchParams(window.location.search).get('edit')))
    const editingId = new URLSearchParams(window.location.search).get('edit')
    const editing = shipments.find((shipment) => shipment.id === editingId)
    const [form, setForm] = useState<FormState>(editing ? { origin: editing.origin, destination: editing.destination, weight: String(editing.weight), category: editing.category } : emptyForm)
    const update = (field: keyof FormState, value: string) => setForm((current) => ({ ...current, [field]: value }))
    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const now = new Date().toISOString()
        const id = editing?.id || `DPSVA-${now.slice(0, 10).replaceAll('-', '')}-${String(shipments.length + 1).padStart(3, '0')}`
        const range = rangeFor({ category: form.category })
        const initialTemperature = editing?.thermalState.productC ?? (range.min + range.max) / 2
        const thermalState = editing?.thermalState ?? createThermalState(initialTemperature)
        const thermalConfig = editing?.category === form.category ? editing.thermalConfig : createThermalConfig(form.category)
        const shipment: Shipment = { id, origin: form.origin, destination: form.destination, category: form.category, weight: Number(form.weight) || 0, temperature: thermalState.productC, status: editing?.status ?? 'Dalam persiapan', updatedAt: now, thermalConfig, thermalState }
        writeShipments(editing ? shipments.map((item) => item.id === id ? shipment : item) : [...shipments, shipment])
        setModalOpen(false); onNotify(editing ? 'Shipment diperbarui.' : 'Shipment baru tersimpan.'); onRefresh()
    }
    return <section id="dashboard" className="scroll-mt-24">
        <div className="mb-5"><h2 className="mt-1 text-2xl font-bold">Dashboard</h2><p className="mt-1 text-sm text-muted">Satu tempat untuk menyiapkan, memeriksa, dan melaporkan shipment farmasi.</p></div>
        <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
            <div className="relative overflow-hidden rounded-xl bg-ink p-7 text-white shadow-panel"><div className="relative z-10 max-w-xl"><p className="text-sm font-bold text-[#ff8ec2]">TEMPERATURE COMPLIANCE</p><h3 className="mt-4 max-w-lg text-2xl font-bold leading-tight sm:text-3xl">Pastikan shipment farmasi tetap dalam range suhu.</h3><p className="mt-3 max-w-lg text-sm leading-6 text-white/75">Tambahkan shipment lalu pantau suhunya dari satu ruang kerja.</p><button type="button" onClick={() => setModalOpen(true)} className="mt-6 inline-flex items-center rounded-lg bg-anteraja px-5 py-3 text-sm font-bold text-white hover:bg-anteraja-dark">Tambah shipment</button></div><span className="absolute -bottom-8 right-8 text-8xl font-bold text-[#ed0677]/30" aria-hidden="true">°C</span></div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">{[['Active shipments', active.length, 'Dalam pengantaran', ''], ['Completed', shipments.filter((shipment) => shipment.status === 'Selesai').length, 'Shipment selesai', ''], ['Excursion alerts', alerts.length, 'Perlu perhatian', 'text-anteraja'], ['Total shipments', shipments.length, 'Tersimpan di browser', '']].map(([label, value, note, tone]) => <div className="metric-card" key={String(label)}><p className="text-xs text-muted">{label}</p><strong className={`mt-2 block text-3xl ${tone}`}>{value}</strong><small className="text-xs text-muted">{note}</small></div>)}</div>
        </div>
        <div className="mt-5 rounded-xl border border-line bg-white p-5 shadow-panel"><div className="flex items-center justify-between gap-3"><div><h3 className="font-bold">Shipment dalam pengantaran</h3><p className="mt-1 text-xs text-muted">Data ini berasal dari cookie browser.</p></div><a href="/monitoring" className="rounded-lg border border-line px-4 py-2.5 text-sm font-bold hover:bg-[#f8f9fa]">Buka monitoring</a></div><div className="mt-4 overflow-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#f8f9fa] text-xs text-muted"><tr><th className="px-4 py-3">Shipment</th><th className="px-4 py-3">Rute</th><th className="px-4 py-3">Suhu</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{active.length ? active.map((shipment) => <tr className="border-t border-line" key={shipment.id}><td className="px-4 py-3 font-semibold">{shipment.id}</td><td className="px-4 py-3">{shipment.origin} → {shipment.destination}</td><td className="px-4 py-3">{shipment.temperature.toFixed(1)}°C</td><td className={`px-4 py-3 ${statusFor(shipment.temperature, shipment).tone}`}>{statusFor(shipment.temperature, shipment).label}</td></tr>) : <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">Belum ada shipment dalam pengantaran.</td></tr>}</tbody></table></div></div>
        {modalOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="shipmentModalTitle"><div className="modal-panel max-w-2xl"><div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5"><div><p className="text-xs font-bold text-anteraja">NEW SHIPMENT</p><h2 id="shipmentModalTitle" className="mt-1 text-xl font-bold">{editing ? 'Edit data shipment' : 'Tambah data shipment'}</h2><p className="mt-1 text-sm text-muted">Data baru akan tersimpan di browser dan langsung muncul di monitoring.</p></div><button type="button" onClick={() => setModalOpen(false)} className="modal-close" aria-label="Tutup modal">×</button></div><form onSubmit={submit} className="grid gap-5 p-6 sm:grid-cols-2"><label className="text-sm font-semibold">Asal<select value={form.origin} onChange={(event) => update('origin', event.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-3">{places.map((place) => <option key={place}>{place}</option>)}</select></label><label className="text-sm font-semibold">Tujuan<select value={form.destination} onChange={(event) => update('destination', event.target.value)} className="mt-2 w-full rounded-lg border border-line px-4 py-3">{places.map((place) => <option key={place}>{place}</option>)}</select></label><label className="text-sm font-semibold">Berat paket<input value={form.weight} onChange={(event) => update('weight', event.target.value)} type="number" min="0.1" step="0.1" className="mt-2 w-full rounded-lg border border-line px-4 py-3" /></label><fieldset><legend className="text-sm font-semibold">Kategori produk</legend><div className="mt-2 space-y-2 text-sm">{[['Cold chain', '2°C - 8°C'], ['Ambient', '15°C - 25°C'], ['Frozen', '-20°C - -10°C']].map(([category, range]) => <label className="flex gap-2" key={category}><input type="radio" name="category" value={category} checked={form.category === category} onChange={(event) => update('category', event.target.value)} /> {category} ({range})</label>)}</div></fieldset><div className="flex justify-end gap-3 sm:col-span-2"><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-line px-5 py-3 text-sm font-bold hover:bg-[#f8f9fa]">Batal</button><button className="rounded-lg bg-anteraja px-5 py-3 text-sm font-bold text-white hover:bg-anteraja-dark">{editing ? 'Simpan perubahan' : 'Simpan shipment'}</button></div></form></div></div>}
        <ul className="mt-4 space-y-3 md:hidden" aria-label="Shipment dalam pengantaran">
            {active.length ? active.map((shipment) => {
                const result = statusFor(shipment.temperature, shipment)
                return <li key={shipment.id} className="rounded-lg border border-line bg-white p-4">
                    <div className="flex items-start justify-between gap-3"><strong className="break-all text-sm">{shipment.id}</strong><strong className="shrink-0 text-sm">{shipment.temperature.toFixed(1)}°C</strong></div>
                    <p className="mt-2 break-words text-xs text-muted">{shipment.origin} → {shipment.destination}</p>
                    <p className={`mt-3 text-xs font-bold ${result.tone}`}>{result.label}</p>
                </li>
            }) : <li className="rounded-lg border border-line bg-white px-4 py-6 text-center text-sm text-muted">Belum ada shipment dalam pengantaran.</li>}
        </ul>
    </section>
}