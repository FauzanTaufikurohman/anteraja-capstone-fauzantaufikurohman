import { addressOnlyShipments, shipments } from './shipments.js';

const JAKARTA_CENTER = { lat: -6.2088, lng: 106.8456 };
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

const markerColors = {
  'Dalam perjalanan': '#2563eb',
  Terkirim: '#16a34a',
  'Menunggu pickup': '#f59e0b',
  'Butuh perhatian': '#dc2626',
};

function createInfoWindowContent(shipment) {
  const template = document.querySelector('#shipment-info-template');
  if (!template) {
    throw new Error('Partial shipment-info.html tidak memiliki template yang diperlukan.');
  }

  const content = document.importNode(template.content, true);
  content.querySelector('[data-field="tracking"]').textContent =
    shipment.trackingNumber;
  content.querySelector('[data-field="status"]').textContent = shipment.status;
  content.querySelector('[data-field="eta"]').textContent =
    shipment.eta || 'Belum tersedia';
  content.querySelector('[data-field="address"]').textContent =
    shipment.address || 'Alamat tidak tersedia';

  const infoWindowContent = content.firstElementChild;
  if (!infoWindowContent) {
    throw new Error('Template jendela info kosong.');
  }

  return infoWindowContent;
}

function addMarker(map, bounds, shipment, position) {
  const marker = L.circleMarker(position, {
    radius: 9,
    color: '#ffffff',
    weight: 2,
    fillColor: markerColors[shipment.status] || markerColors['Dalam perjalanan'],
    fillOpacity: 1,
  });

  marker.bindPopup(createInfoWindowContent(shipment));
  marker.addTo(map);
  bounds.push(position);
}

async function geocodeShipment(shipment) {
  const params = new URLSearchParams({
    q: shipment.address,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'id',
  });
  const response = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { 'Accept-Language': 'id' },
  });
  if (!response.ok) {
    throw new Error(`Nominatim merespons HTTP ${response.status}.`);
  }

  const results = await response.json();
  const location = results[0];
  if (!location) {
    throw new Error('Alamat tidak ditemukan.');
  }

  const lat = Number(location.lat);
  const lng = Number(location.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Nominatim mengembalikan koordinat yang tidak valid.');
  }

  return { lat, lng };
}

export async function initMap(setStatus) {
  const map = L.map('map').setView(
    [JAKARTA_CENTER.lat, JAKARTA_CENTER.lng],
    11,
  );
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const bounds = [];
  let markerCount = 0;

  shipments.forEach((shipment) => {
    addMarker(map, bounds, shipment, [shipment.lat, shipment.lng]);
    markerCount += 1;
  });

  if (addressOnlyShipments.length === 0) {
    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
    setStatus(`Peta berhasil dimuat dengan ${markerCount} marker.`);
    return;
  }

  setStatus('Mencari koordinat untuk alamat pengiriman...');
  const failedShipments = [];

  for (const [index, shipment] of addressOnlyShipments.entries()) {
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    try {
      const position = await geocodeShipment(shipment);
      addMarker(map, bounds, shipment, [position.lat, position.lng]);
      markerCount += 1;
    } catch (error) {
      console.error(`Geocoding gagal untuk ${shipment.trackingNumber}.`, error);
      failedShipments.push(shipment.trackingNumber);
    }
  }

  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [24, 24] });
  }

  if (failedShipments.length > 0) {
    setStatus(
      `Geocoding gagal untuk ${failedShipments.join(', ')}. ${markerCount} marker berhasil ditampilkan.`,
      true,
    );
    return;
  }

  setStatus(
    `Peta berhasil dimuat dengan ${markerCount} marker, termasuk hasil geocoding.`,
  );
}
