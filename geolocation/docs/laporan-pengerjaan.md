# Laporan Pengerjaan Project Shipment Tracker

## 1. Ringkasan

Project ini membuat halaman pelacakan pengiriman untuk area Jakarta. Peta menampilkan marker setiap pengiriman; saat marker dipilih, pengguna dapat melihat nomor pelacakan, status, ETA, dan alamat. Koordinat yang belum tersedia dicari berdasarkan alamat.

## 2. Teknologi

- Leaflet untuk menampilkan peta dan marker.
- Tile OpenStreetMap dengan atribusi yang ditampilkan pada peta.
- Nominatim untuk geocoding alamat tanpa koordinat.
- Layanan publik tersebut tidak memerlukan API key untuk penggunaan ringan. Keduanya memiliki kebijakan pemakaian sendiri dan bukan layanan dengan SLA produksi.

## 3. Alur aplikasi

1. Partial header, legenda, dan template detail dimuat dari folder `partials/`.
2. Peta dibuat dengan pusat awal Jakarta menggunakan Leaflet.
3. Tile OpenStreetMap dan atribusinya ditambahkan.
4. Data berkoordinat di `js/shipments.js` langsung ditampilkan sebagai marker berwarna sesuai status.
5. Data yang hanya memiliki alamat dikirim ke Nominatim; hasil koordinat yang valid ditampilkan sebagai marker.
6. Memilih marker membuka popup berisi detail pengiriman. Kegagalan geocoding dicatat dan ditampilkan di status, tanpa menghilangkan marker lain yang berhasil.

## 4. Menjalankan aplikasi

Jalankan dari folder proyek melalui server lokal karena halaman memuat partial dengan `fetch`:

```powershell
python -m http.server 8000
```

Buka `http://localhost:8000/shipment-map.html`. Tidak perlu menyalin file konfigurasi atau menyediakan API key.

## 5. Batasan layanan publik

Tile OpenStreetMap dan Nominatim merupakan layanan komunitas. Penggunaan harus mengikuti [kebijakan tile OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) dan [kebijakan penggunaan Nominatim](https://operations.osmfoundation.org/policies/nominatim/), termasuk batas permintaan dan atribusi. Untuk aplikasi produksi, trafik tinggi, atau kebutuhan SLA, gunakan penyedia tile/geocoding yang sesuai atau host layanan sendiri.
