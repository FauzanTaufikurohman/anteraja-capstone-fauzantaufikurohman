import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import CorrectiveSimulation from "./components/partials/CorrectiveSimulation";
import Dashboard from "./components/partials/Dashboard";
import Monitoring from "./components/partials/Monitoring";
import Notifications from "./components/partials/Notifications";
import Report from "./components/partials/Report";
import ThermalSimulation from "./components/partials/ThermalSimulation";
import { ShipmentProvider } from "./contexts/ShipmentContext";
import { useShipments } from "./hooks/useShipments";
import { navigateTo } from "./lib/navigation";

const routeTitles: Record<string, string> = {
  "/": "Dashboard",
  "/monitoring": "Pemantauan Suhu",
  "/simulation": "Simulasi Termal",
  "/correction": "Perbaikan",
  "/report": "Laporan",
  "/notifications": "Notifikasi",
};

function AppContent() {
  const [path, setPath] = useState(window.location.pathname);
  const [toast, setToast] = useState("");
  const { shipments, loading, error, refresh } = useShipments();
  const initialLoad = loading && shipments.length === 0;
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    document.title = `Anteraja Pharma | ${routeTitles[path] || routeTitles["/"]}`;
    return () => window.removeEventListener("popstate", onPopState);
  }, [path]);

  const navigate = (href: string) => {
    navigateTo(href);
  };
  const page =
    path === "/monitoring" ? (
      <Monitoring onNotify={notify} />
    ) : path === "/simulation" ? (
      <ThermalSimulation onNotify={notify} />
    ) : path === "/correction" ? (
      <CorrectiveSimulation onNotify={notify} />
    ) : path === "/report" ? (
      <Report />
    ) : path === "/notifications" ? (
      <Notifications />
    ) : (
      <Dashboard onNotify={notify} />
    );

  return (
    <>
      <a className="skip-link" href="#main-content">
        Lewati ke konten utama
      </a>
      <div className="min-h-screen lg:flex">
        <Sidebar path={path} shipments={shipments} navigate={navigate} />
        <main
          id="main-content"
          className="min-w-0 flex-1 pb-24 lg:ml-64 lg:pb-0"
        >
          <div className="mx-auto max-w-[1480px] space-y-10 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
            {error && (
              <div
                className="rounded-lg border border-danger/30 bg-[#fff6f5] px-4 py-3 text-sm text-danger"
                role="alert"
              >
                {error}
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="ml-3 font-bold underline"
                >
                  Coba lagi
                </button>
              </div>
            )}
            {initialLoad ? (
              <div className="py-12 text-center text-sm text-muted" role="status">
                Memuat data shipment dari server...
              </div>
            ) : page}
          </div>
        </main>
      </div>
      <div
        className={`pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all ${toast ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
        role="status"
      >
        {toast}
      </div>
    </>
  );
}

function App() {
  return (
    <ShipmentProvider>
      <AppContent />
    </ShipmentProvider>
  );
}

export default App;
