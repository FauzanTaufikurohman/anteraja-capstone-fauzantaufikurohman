import {
  useCallback,
  useEffect,
  startTransition,
  useState,
  type ReactNode,
} from "react";
import {
  createShipment as createShipmentRequest,
  advanceThermal as advanceThermalRequest,
  listShipmentPage,
  listShipments,
  runCorrectiveSimulation as runCorrectiveSimulationRequest,
  runThermalSimulation,
  saveCorrectiveSimulation as saveCorrectiveSimulationRequest,
  saveSimulation as saveSimulationRequest,
  updateShipment as updateShipmentRequest,
} from "../services/shipmentApi";
import { ShipmentContext } from "./shipment-context";
import type { SimulationCommand } from "../lib/thermalModel";
import type { Shipment, ThermalConfig, ThermalState } from "../lib/shipments";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Tidak dapat terhubung ke API.";
}

export function ShipmentProvider({ children }: { children: ReactNode }) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [totalShipments, setTotalShipments] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void listShipments()
      .then((page) => {
        if (active) {
          startTransition(() => {
            setShipments(page.data);
            setTotalShipments(page.recordsTotal);
          });
          setError("");
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const refresh = async (): Promise<boolean> => {
    setLoading(true);
    try {
      const page = await listShipments();
      setShipments(page.data);
      setTotalShipments(page.recordsTotal);
      setError("");
      return true;
    } catch (loadError) {
      setError(errorMessage(loadError));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const loadShipmentPage = useCallback(async (start: number, length: number) => {
    const page = await listShipmentPage(start, length);
    setTotalShipments(page.recordsTotal);
    return page;
  }, []);

  const createShipment = async (shipment: Shipment): Promise<Shipment | null> => {
    try {
      const created = await createShipmentRequest(shipment);
      setShipments((current) => [created, ...current]);
      setTotalShipments((current) => current + 1);
      setError("");
      return created;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    }
  };

  const updateShipment = async (
    id: string,
    changes: Partial<Shipment>,
  ): Promise<Shipment | null> => {
    try {
      const updated = await updateShipmentRequest(id, changes);
      setShipments((current) =>
        current.map((shipment) => (shipment.id === id ? updated : shipment)),
      );
      setError("");
      return updated;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    }
  };

  const runSimulation = async (id: string, command: SimulationCommand) => {
    try {
      const result = await runThermalSimulation(id, command);
      setError("");
      return result;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    }
  };

  const runCorrectiveSimulation = async (
    id: string,
    command: SimulationCommand,
  ) => {
    try {
      const result = await runCorrectiveSimulationRequest(id, command);
      setError("");
      return result;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    }
  };

  const advanceThermal = async (id: string): Promise<Shipment | null> => {
    try {
      const updated = await advanceThermalRequest(id);
      setShipments((current) =>
        current.map((shipment) => (shipment.id === id ? updated : shipment)),
      );
      setError("");
      return updated;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return null;
    }
  };

  const saveSimulation = async (
    id: string,
    command: SimulationCommand,
    config: ThermalConfig,
    state: ThermalState,
  ): Promise<boolean> => {
    try {
      const status = await saveSimulationRequest(id, command);
      setShipments((current) =>
        current.map((shipment) =>
          shipment.id === id
            ? {
                ...shipment,
                status,
                thermalConfig: config,
                thermalState: state,
                temperature: state.productC,
                activeDisturbance:
                  command.disturbance === "none" ? null : command.disturbance,
                updatedAt: new Date().toISOString(),
              }
            : shipment,
        ),
      );
      setError("");
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return false;
    }
  };

  const saveCorrectiveSimulation = async (
    id: string,
    command: SimulationCommand,
    config: ThermalConfig,
    state: ThermalState,
  ): Promise<boolean> => {
    try {
      const status = await saveCorrectiveSimulationRequest(id, command);
      setShipments((current) =>
        current.map((shipment) =>
          shipment.id === id
            ? {
                ...shipment,
                status,
                thermalConfig: config,
                thermalState: state,
                temperature: state.productC,
                activeDisturbance: null,
                updatedAt: new Date().toISOString(),
              }
            : shipment,
        ),
      );
      setError("");
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return false;
    }
  };

  return (
    <ShipmentContext.Provider
      value={{
        shipments,
        totalShipments,
        loading,
        error,
        refresh,
        loadShipmentPage,
        createShipment,
        updateShipment,
        runSimulation,
        runCorrectiveSimulation,
        advanceThermal,
        saveSimulation,
        saveCorrectiveSimulation,
      }}
    >
      {children}
    </ShipmentContext.Provider>
  );
}