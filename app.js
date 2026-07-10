const STORAGE_KEY = "groeiplaats-inspectie-v1";

const form = document.querySelector("#inspectionForm");
const panels = [...document.querySelectorAll("[data-panel]")];
const stepButtons = [...document.querySelectorAll("[data-step]")];
const previousButton = document.querySelector("#previousButton");
const nextButton = document.querySelector("#nextButton");
const saveStatus = document.querySelector("#saveStatus");
const layersBody = document.querySelector("#layersTable tbody");
const layerTemplate = document.querySelector("#layerRowTemplate");
const importFile = document.querySelector("#importFile");

let currentStep = 1;
const photoData = {
  photo1: null,
  photo2: null
};

function showStep(step) {
  currentStep = Math.max(1, Math.min(5, Number(step)));

  panels.forEach(panel => {
    panel.classList.toggle("active", Number(panel.dataset.panel) === currentStep);
  });

  stepButtons.forEach(button => {
    button.classList.toggle("active", Number(button.dataset.step) === currentStep);
  });

  previousButton.disabled = currentStep === 1;
  nextButton.hidden = currentStep === 5;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

stepButtons.forEach(button => {
  button.addEventListener("click", () => showStep(button.dataset.step));
});

previousButton.addEventListener("click", () => showStep(currentStep - 1));
nextButton.addEventListener("click", () => showStep(currentStep + 1));

function addLayer(layer = {}) {
  const row = layerTemplate.content.firstElementChild.cloneNode(true);

  row.querySelector(".layer-from").value = layer.from ?? "";
  row.querySelector(".layer-to").value = layer.to ?? "";
  row.querySelector(".layer-type").value = layer.type ?? "";
  row.querySelector(".layer-note").value = layer.note ?? "";

  row.querySelector(".remove-layer").addEventListener("click", () => {
    row.remove();
    markUnsaved();
  });

  row.querySelectorAll("input, select").forEach(element => {
    element.addEventListener("input", markUnsaved);
  });

  layersBody.appendChild(row);
}

document.querySelector("#addLayer").addEventListener("click", () => addLayer());

function collectLayers() {
  return [...layersBody.querySelectorAll("tr")].map(row => ({
    from: row.querySelector(".layer-from").value,
    to: row.querySelector(".layer-to").value,
    type: row.querySelector(".layer-type").value,
    note: row.querySelector(".layer-note").value
  }));
}

function calculateVolume() {
  const length = Number(document.querySelector("#lengte").value) || 0;
  const width = Number(document.querySelector("#breedte").value) || 0;
  const depth = Number(document.querySelector("#bewortelbareDiepteM").value) || 0;
  const volume = length * width * depth;

  document.querySelector("#volumeOutput").textContent = volume.toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return volume;
}

["#lengte", "#breedte", "#bewortelbareDiepteM"].forEach(selector => {
  document.querySelector(selector).addEventListener("input", calculateVolume);
});

document.querySelector("#bewortelbareDiepteCm").addEventListener("input", event => {
  const metres = (Number(event.target.value) || 0) / 100;
  document.querySelector("#bewortelbareDiepteM").value = metres || "";
  calculateVolume();
});

function formToObject() {
  const data = new FormData(form);
  const result = {};

  for (const [key, value] of data.entries()) {
    if (key === "maatregelen") {
      result[key] ??= [];
      result[key].push(value);
    } else if (!(value instanceof File)) {
      result[key] = value;
    }
  }

  result.bodemlagen = collectLayers();
  result.fotos = { ...photoData };
  result.potentieel_volume = Number(calculateVolume().toFixed(2));
  result.laatst_opgeslagen = new Date().toISOString();

  return result;
}

function restoreForm(data) {
  if (!data) return;

  Object.entries(data).forEach(([name, value]) => {
    if (name === "bodemlagen" || name === "maatregelen") return;

    const fields = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);

    fields.forEach(field => {
      if (field.type === "radio") {
        field.checked = field.value === value;
      } else if (field.type !== "file") {
        field.value = value ?? "";
      }
    });
  });

  const measures = Array.isArray(data.maatregelen) ? data.maatregelen : [];

  form.querySelectorAll('[name="maatregelen"]').forEach(box => {
    box.checked = measures.includes(box.value);
  });

  layersBody.innerHTML = "";
  (data.bodemlagen?.length ? data.bodemlagen : [{}]).forEach(addLayer);

  restorePhoto("photo1", "#preview1", data.fotos?.photo1);
  restorePhoto("photo2", "#preview2", data.fotos?.photo2);

  calculateVolume();
  saveStatus.textContent = "Lokaal geladen";
}

function saveForm() {
  const data = formToObject();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Formulier kon niet lokaal worden opgeslagen.", error);
    alert("Opslaan is mislukt. De foto's zijn mogelijk te groot voor lokale opslag. Probeer kleinere foto's of exporteer direct naar JSON.");
    return;
  }

  const savedMessage = `Opgeslagen ${new Date().toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;

  saveStatus.textContent = savedMessage;
  alert(`${savedMessage}. Het formulier staat nu in deze browser opgeslagen.`);
}

function markUnsaved() {
  saveStatus.textContent = "Wijzigingen niet opgeslagen";
}

document.querySelector("#saveButton").addEventListener("click", saveForm);
form.addEventListener("input", markUnsaved);
form.addEventListener("change", markUnsaved);

document.querySelector("#resetButton").addEventListener("click", event => {
  const confirmed = window.confirm(
    "Weet je zeker dat je een nieuw formulier wilt starten?"
  );

  if (!confirmed) {
    event.preventDefault();
    return;
  }

  localStorage.removeItem(STORAGE_KEY);
  photoData.photo1 = null;
  photoData.photo2 = null;
  document.querySelector("#preview1").hidden = true;
  document.querySelector("#preview1").removeAttribute("src");
  document.querySelector("#preview2").hidden = true;
  document.querySelector("#preview2").removeAttribute("src");
  layersBody.innerHTML = "";
  addLayer();

  setTimeout(() => {
    document.querySelector("#datum").valueAsDate = new Date();
    calculateVolume();
    showStep(1);
    saveStatus.textContent = "Nieuw formulier";
  });
});

document.querySelector("#gpsButton").addEventListener("click", () => {
  const button = document.querySelector("#gpsButton");

  if (!navigator.geolocation) {
    alert("GPS wordt niet ondersteund op dit apparaat.");
    return;
  }

  button.disabled = true;
  button.textContent = "GPS ophalen…";

  navigator.geolocation.getCurrentPosition(
    position => {
      const { latitude, longitude } = position.coords;
      document.querySelector("#xy").value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      button.disabled = false;
      button.textContent = "Gebruik GPS";
      markUnsaved();
    },
    error => {
      alert(`GPS kon niet worden opgehaald: ${error.message}`);
      button.disabled = false;
      button.textContent = "Gebruik GPS";
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000
    }
  );
});

function restorePhoto(key, previewSelector, value) {
  photoData[key] = value || null;

  const preview = document.querySelector(previewSelector);
  if (value) {
    preview.src = value;
    preview.hidden = false;
  } else {
    preview.hidden = true;
    preview.removeAttribute("src");
  }
}

function resizePhoto(file, maxSize = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      const image = new Image();

      image.addEventListener("load", () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      });

      image.addEventListener("error", reject);
      image.src = reader.result;
    });

    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function setupPhotoInput(inputSelector, previewSelector, key) {
  const input = document.querySelector(inputSelector);
  const preview = document.querySelector(previewSelector);

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await resizePhoto(file);
      photoData[key] = dataUrl;
      preview.src = dataUrl;
      preview.hidden = false;
      markUnsaved();
    } catch (error) {
      console.warn("Foto kon niet worden verwerkt.", error);
      alert("De foto kon niet worden verwerkt. Probeer een andere foto.");
    }
  });
}

setupPhotoInput("#photo1", "#preview1", "photo1");
setupPhotoInput("#photo2", "#preview2", "photo2");

function loadImportedData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Ongeldig JSON-bestand.");
  }

  form.reset();
  restoreForm(data);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formToObject()));
  } catch (error) {
    console.warn("Geïmporteerd formulier kon niet lokaal worden opgeslagen.", error);
    alert("JSON is geïmporteerd, maar lokaal opslaan is mislukt. De foto's zijn mogelijk te groot.");
    return;
  }

  showStep(1);
  saveStatus.textContent = "JSON geïmporteerd en lokaal opgeslagen";
}

importFile.addEventListener("change", () => {
  const file = importFile.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.addEventListener("load", () => {
    try {
      loadImportedData(JSON.parse(reader.result));
    } catch (error) {
      console.warn("JSON kon niet worden geïmporteerd.", error);
      alert("Dit JSON-bestand kon niet worden geïmporteerd. Controleer of het uit deze app komt.");
    } finally {
      importFile.value = "";
    }
  });

  reader.addEventListener("error", () => {
    alert("Het JSON-bestand kon niet worden gelezen.");
    importFile.value = "";
  });

  reader.readAsText(file);
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatReportValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  return value || "-";
}

function reportRow(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(formatReportValue(value))}</td></tr>`;
}

function createReportHtml(data) {
  const layers = data.bodemlagen?.length
    ? data.bodemlagen.map(layer => `
      <tr>
        <td>${escapeHtml(layer.from)}</td>
        <td>${escapeHtml(layer.to)}</td>
        <td>${escapeHtml(layer.type)}</td>
        <td>${escapeHtml(layer.note)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="4">Geen bodemlagen ingevuld</td></tr>`;

  const photos = [data.fotos?.photo1, data.fotos?.photo2]
    .filter(Boolean)
    .map((src, index) => `
      <figure>
        <img src="${src}" alt="Situatiefoto ${index + 1}">
        <figcaption>Situatiefoto ${index + 1}</figcaption>
      </figure>
    `).join("") || "<p>Geen foto's toegevoegd.</p>";

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>Groeiplaatsbeoordeling rapport</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2a1a; }
    h1, h2 { color: #355021; }
    h1 { margin-bottom: 0; }
    .subtitle { color: #667060; margin-top: 4px; }
    section { break-inside: avoid; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ccd5c6; padding: 8px; text-align: left; vertical-align: top; }
    th { width: 34%; background: #e8efe3; }
    .photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    figure { margin: 0; break-inside: avoid; }
    img { width: 100%; max-height: 360px; object-fit: contain; border: 1px solid #ccd5c6; }
    figcaption { margin-top: 6px; color: #667060; }
    @media print { body { margin: 12mm; } button { display: none; } }
  </style>
</head>
<body>
  <h1>Groeiplaatsbeoordeling</h1>
  <p class="subtitle">Rapport gegenereerd op ${escapeHtml(new Date().toLocaleString("nl-NL"))}</p>

  <section>
    <h2>Algemene gegevens</h2>
    <table>
      ${reportRow("Project", data.project)}
      ${reportRow("Locatie", data.locatie)}
      ${reportRow("Plantplaatsnummer", data.plantplaatsnummer)}
      ${reportRow("Gemeente", data.gemeente)}
      ${reportRow("XY / GPS", data.xy)}
      ${reportRow("Datum", data.datum)}
      ${reportRow("Onderzoeker", data.onderzoeker)}
      ${reportRow("Versie", data.versie)}
    </table>
  </section>

  <section>
    <h2>Groeiplaatsonderzoek</h2>
    <table>
      ${reportRow("Maaiveld", data.maaiveld)}
      ${reportRow("Bodemtype", data.bodemtype)}
      ${reportRow("Verdichting", data.verdichting)}
      ${reportRow("Vocht", data.vocht)}
      ${reportRow("Reductie", data.reductie)}
    </table>
  </section>

  <section>
    <h2>Bodemprofiel</h2>
    <table>
      <tr><th>Van (cm)</th><th>Tot (cm)</th><th>Bodemsoort</th><th>Opmerking</th></tr>
      ${layers}
    </table>
    <table>
      ${reportRow("Storende laag (cm)", data.storende_laag)}
      ${reportRow("Grondwater (cm)", data.grondwater)}
      ${reportRow("Kabel (cm)", data.kabel)}
      ${reportRow("Leiding (cm)", data.leiding)}
      ${reportRow("Riool (cm)", data.riool)}
      ${reportRow("Fundering (cm)", data.fundering)}
      ${reportRow("Drainage (cm)", data.drainage)}
      ${reportRow("Bewortelbare diepte (cm)", data.bewortelbare_diepte_cm)}
      ${reportRow("Profielopmerking", data.profiel_opmerking)}
    </table>
  </section>

  <section>
    <h2>Foto's</h2>
    <div class="photo-grid">${photos}</div>
  </section>

  <section>
    <h2>Toetsing</h2>
    <table>
      ${reportRow("Lengte (m)", data.lengte)}
      ${reportRow("Breedte (m)", data.breedte)}
      ${reportRow("Bewortelbare diepte (m)", data.bewortelbare_diepte_m)}
      ${reportRow("Potentieel volume (m³)", data.potentieel_volume)}
      ${reportRow("Benodigd volume (m³)", data.benodigd_volume)}
      ${reportRow("Beschikbaar volume (m³)", data.beschikbaar_volume)}
      ${reportRow("Open grond (m²)", data.open_grond)}
      ${reportRow("Boomspiegel (m²)", data.boomspiegel)}
      ${reportRow("Beoordeling", data.beoordeling)}
      ${reportRow("Geschikt voor", data.geschikt_voor)}
    </table>
  </section>

  <section>
    <h2>Advies</h2>
    <table>
      ${reportRow("Aanbevolen boomsoort(en)", data.boomsoorten)}
      ${reportRow("Benodigde plantvakafmetingen", data.plantvakafmetingen)}
      ${reportRow("Maatregelen", data.maatregelen)}
      ${reportRow("Advies / uitwerking", data.advies)}
      ${reportRow("Eindconclusie", data.eindconclusie)}
    </table>
  </section>
</body>
</html>`;
}

function openReport() {
  const reportWindow = window.open("", "_blank");

  if (!reportWindow) {
    alert("Het rapport kon niet worden geopend. Sta pop-ups toe voor deze app en probeer opnieuw.");
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(createReportHtml(formToObject()));
  reportWindow.document.close();
  reportWindow.addEventListener("load", () => {
    reportWindow.focus();
    reportWindow.print();
  });
}

document.querySelector("#reportButton").addEventListener("click", openReport);

document.querySelector("#exportButton").addEventListener("click", () => {
  const data = formToObject();

  const safeName = (data.plantplaatsnummer || data.project || "groeiplaats")
    .toString()
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "_");

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(error => {
      console.warn("Service worker kon niet worden geregistreerd.", error);
    });
  });
}

const saved = localStorage.getItem(STORAGE_KEY);

if (saved) {
  try {
    restoreForm(JSON.parse(saved));
  } catch (error) {
    console.warn("Opgeslagen formulier kon niet worden geladen.", error);
    addLayer();
  }
} else {
  addLayer();
  document.querySelector("#datum").valueAsDate = new Date();
}
