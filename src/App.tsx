import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/partials/Dashboard";
import Monitoring from "./components/partials/Monitoring";
import Notifications from "./components/partials/Notifications";
import Report from "./components/partials/Report";
import ThermalSimulation from "./components/partials/ThermalSimulation";
import { readShipments } from "./lib/shipments";

const routeTitles: Record<string, string> = {
  "/": "Dashboard",
  "/monitoring": "Temperature Monitor",
  "/simulation": "Disturbance Simulation",
  "/report": "Report",
  "/notifications": "Notifications",
};

function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [, setShipmentsVersion] = useState(0);
  const [toast, setToast] = useState("");
  const shipments = readShipments();
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
    window.history.pushState({}, "", href);
    setPath(window.location.pathname);
  };
  const refresh = () => setShipmentsVersion((version) => version + 1);
  const page =
    path === "/monitoring" ? (
      <Monitoring onNotify={notify} onRefresh={refresh} />
    ) : path === "/simulation" ? (
      <ThermalSimulation onNotify={notify} onRefresh={refresh} />
    ) : path === "/report" ? (
      <Report />
    ) : path === "/notifications" ? (
      <Notifications />
    ) : (
      <Dashboard onNotify={notify} onRefresh={refresh} />
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
            {page}
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

export default App;
