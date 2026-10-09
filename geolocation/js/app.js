import { initMap } from './map.js';

const statusElement = document.getElementById('status');

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle('error', isError);
}

async function loadPartials() {
  const partialContainers = [...document.querySelectorAll('[data-partial]')];

  await Promise.all(
    partialContainers.map(async (container) => {
      const response = await fetch(container.dataset.partial);
      if (!response.ok) {
        throw new Error(
          `Gagal memuat ${container.dataset.partial}: HTTP ${response.status}`,
        );
      }

      container.innerHTML = await response.text();
    }),
  );
}

async function startApp() {
  try {
    await loadPartials();
  } catch (error) {
    console.error('Gagal memuat partial halaman.', error);
    setStatus('Komponen halaman gagal dimuat. Jalankan halaman melalui server lokal.', true);
    return;
  }

  try {
    await initMap(setStatus);
  } catch (error) {
    console.error('Gagal menginisialisasi peta.', error);
    setStatus('Peta gagal diinisialisasi. Periksa koneksi dan konsol browser.', true);
  }
}

startApp();
