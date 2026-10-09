import { rangeFor, statusFor } from "../../lib/shipments";
import { useShipments } from "../../hooks/useShipments";
import { handleInternalLinkClick } from "../../lib/navigation";

export default function Notifications() {
  const { shipments } = useShipments();
  const alerts = shipments.filter((shipment) => {
    const range = rangeFor(shipment);
    return shipment.temperature < range.min || shipment.temperature > range.max;
  });
  return (
    <section id="notifications" className="scroll-mt-24">
      <div className="mb-6">
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          Peringatan suhu
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Daftar ini selalu mengikuti shipment yang berada di luar range
          kategorinya.
        </p>
      </div>
      <div className="grid max-w-4xl gap-4">
        {alerts.length ? (
          alerts.map((shipment) => {
            const range = rangeFor(shipment);
            const status = statusFor(shipment.temperature, shipment);
            const above = shipment.temperature > range.max;
            return (
              <article
                className="overflow-hidden rounded-xl border border-[#e7b4b0] bg-white shadow-panel"
                key={shipment.id}
              >
                <div className="flex gap-4 border-b border-[#f0d3d0] bg-[#fff6f5] p-6">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#b42318] text-xl font-bold text-white"
                    aria-hidden="true"
                  >
                    !
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-danger">
                      Suhu di luar batas
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-[#7a1b14]">
                      {above
                        ? "Melewati batas maksimum"
                        : "Di bawah batas minimum"}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[#7a1b14]">
                      {shipment.id} tercatat {shipment.temperature.toFixed(1)}
                      °C, di luar range {range.label}.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 p-6 sm:grid-cols-3">
                  <div className="rounded-lg bg-[#f8f9fa] p-4">
                    <small className="block text-xs text-muted">
                      Range kategori
                    </small>
                    <strong className="mt-1 block text-lg">
                      {range.label}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-[#fff6f5] p-4">
                    <small className="block text-xs text-muted">Status</small>
                    <strong className="mt-1 block text-lg text-danger">
                      {status.label}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-[#f8f9fa] p-4">
                    <small className="block text-xs text-muted">
                      Suhu aktual
                    </small>
                    <strong className="mt-1 block text-lg">
                      {shipment.temperature.toFixed(1)}°C
                    </strong>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 border-t border-line p-6">
                  <a
                    href={`/monitoring?shipment=${encodeURIComponent(shipment.id)}`}
                    onClick={(event) =>
                      handleInternalLinkClick(
                        event,
                        `/monitoring?shipment=${encodeURIComponent(shipment.id)}`,
                      )
                    }
                    className="inline-flex items-center rounded-lg bg-anteraja px-5 py-3 text-sm font-bold text-white hover:bg-anteraja-dark"
                  >
                    Buka monitoring
                  </a>
                  <a
                    href={`/report?shipment=${encodeURIComponent(shipment.id)}`}
                    onClick={(event) =>
                      handleInternalLinkClick(
                        event,
                        `/report?shipment=${encodeURIComponent(shipment.id)}`,
                      )
                    }
                    className="inline-flex items-center rounded-lg border border-line px-5 py-3 text-sm font-bold hover:bg-[#f8f9fa]"
                  >
                    Buka report
                  </a>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-xl border border-[#bdebdc] bg-white p-8 shadow-panel">
            <p className="text-xs font-bold uppercase tracking-wide text-success">
              Kondisi terkendali
            </p>
            <h2 className="mt-2 text-xl font-bold">
              Tidak ada notifikasi suhu aktif
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Semua shipment berada di dalam range suhu kategorinya.
            </p>
            <a
              href="/monitoring"
              onClick={(event) => handleInternalLinkClick(event, "/monitoring")}
              className="mt-5 inline-flex items-center rounded-lg border border-line px-5 py-3 text-sm font-bold hover:bg-[#f8f9fa]"
            >
              Buka monitoring
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
