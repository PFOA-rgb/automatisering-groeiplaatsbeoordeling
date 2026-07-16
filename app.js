const STORAGE_KEY = "groeiplaats-inspectie-v1";
const INSPECTIONS_STORAGE_KEY = "groeiplaats-inspecties-v1";

const form = document.querySelector("#inspectionForm");
const panels = [...document.querySelectorAll("[data-panel]")];
const stepButtons = [...document.querySelectorAll("[data-step]")];
const previousButton = document.querySelector("#previousButton");
const nextButton = document.querySelector("#nextButton");
const saveStatus = document.querySelector("#saveStatus");
const layersBody = document.querySelector("#layersTable tbody");
const layerTemplate = document.querySelector("#layerRowTemplate");
const importFile = document.querySelector("#importFile");
const inspectionSelect = document.querySelector("#inspectionSelect");
const openInspectionButton = document.querySelector("#openInspectionButton");
const newInspectionButton = document.querySelector("#newInspectionButton");
const copyInspectionButton = document.querySelector("#copyInspectionButton");
const deleteInspectionButton = document.querySelector("#deleteInspectionButton");
const keepGeneralData = document.querySelector("#keepGeneralData");

let currentStep = 1;
let currentInspectionId = null;
const photoData = {
  photo1: null,
  photo2: null
};

const GENERAL_FIELD_NAMES = [
  "project",
  "locatie",
  "plantplaatsnummer",
  "gemeente",
  "xy",
  "datum",
  "onderzoeker",
  "versie"
];

function createInspectionId() {
  return `inspectie-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getInspectionTitle(data) {
  return [data.plantplaatsnummer, data.project, data.locatie]
    .map(value => value?.toString().trim())
    .filter(Boolean)
    .join(" - ") || `Onderzoek ${new Date().toLocaleDateString("nl-NL")}`;
}

function loadInspections() {
  try {
    const parsed = JSON.parse(localStorage.getItem(INSPECTIONS_STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Opgeslagen onderzoeken konden niet worden geladen.", error);
    return [];
  }
}

function saveInspections(inspections) {
  localStorage.setItem(INSPECTIONS_STORAGE_KEY, JSON.stringify(inspections));
}

function collectGeneralData() {
  return GENERAL_FIELD_NAMES.reduce((values, name) => {
    const field = form.elements[name];
    if (field) values[name] = field.value;
    return values;
  }, {});
}

function restoreGeneralData(values) {
  Object.entries(values).forEach(([name, value]) => {
    const field = form.elements[name];
    if (field) field.value = value ?? "";
  });
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function renderInspectionList() {
  const inspections = loadInspections();
  inspectionSelect.innerHTML = "";

  if (!inspections.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Geen opgeslagen onderzoeken";
    inspectionSelect.appendChild(option);
    inspectionSelect.disabled = true;
    openInspectionButton.disabled = true;
    copyInspectionButton.disabled = true;
    deleteInspectionButton.disabled = true;
    return;
  }

  inspectionSelect.disabled = false;
  openInspectionButton.disabled = false;
  copyInspectionButton.disabled = false;
  deleteInspectionButton.disabled = false;

  inspections
    .slice()
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
    .forEach(inspection => {
      const option = document.createElement("option");
      option.value = inspection.id;
      option.textContent = `${inspection.title} (${new Date(inspection.updatedAt).toLocaleString("nl-NL")})`;
      option.selected = inspection.id === currentInspectionId;
      inspectionSelect.appendChild(option);
    });
}

function clearPhotos() {
  photoData.photo1 = null;
  photoData.photo2 = null;

  ["#photo1", "#photo2"].forEach(selector => {
    document.querySelector(selector).value = "";
  });

  ["#preview1", "#preview2"].forEach(selector => {
    const preview = document.querySelector(selector);
    preview.hidden = true;
    preview.removeAttribute("src");
  });
}

function resetCurrentForm(message = "Nieuw onderzoek") {
  const shouldKeepGeneralData = keepGeneralData.checked;
  const preservedGeneralData = shouldKeepGeneralData ? collectGeneralData() : null;

  currentInspectionId = null;
  localStorage.removeItem(STORAGE_KEY);
  form.reset();
  keepGeneralData.checked = shouldKeepGeneralData;
  if (preservedGeneralData) restoreGeneralData(preservedGeneralData);
  clearPhotos();
  layersBody.innerHTML = "";
  addLayer();
  if (!preservedGeneralData?.datum) {
    document.querySelector("#datum").valueAsDate = new Date();
  }
  calculateVolume();
  showStep(1);
  saveStatus.textContent = message;
  renderInspectionList();
}

function openInspection(id) {
  const inspection = loadInspections().find(item => item.id === id);
  if (!inspection) return;

  currentInspectionId = inspection.id;
  form.reset();
  restoreForm(inspection.data);
  showStep(1);
  saveStatus.textContent = "Onderzoek geopend";
  renderInspectionList();
}

async function copyInspection(id) {
  const source = loadInspections().find(item => item.id === id);
  if (!source) return;

  const data = await compressDataPhotos(cloneData(source.data));
  currentInspectionId = createInspectionId();

  const copiedInspection = {
    id: currentInspectionId,
    title: `Kopie van ${source.title}`,
    updatedAt: new Date().toISOString(),
    data
  };

  const inspections = loadInspections();
  inspections.push(copiedInspection);

  try {
    saveInspections(inspections);
  } catch (error) {
    console.warn("Onderzoek kon niet worden gekopieerd.", error);
    alert("Kopiëren is mislukt. De foto's zijn mogelijk te groot voor lokale opslag.");
    return;
  }

  form.reset();
  restoreForm(data);
  showStep(1);
  saveStatus.textContent = "Onderzoek gekopieerd";
  renderInspectionList();
}

function deleteInspection(id) {
  const inspections = loadInspections();
  const inspection = inspections.find(item => item.id === id);
  if (!inspection) return;

  const confirmed = window.confirm(`Onderzoek "${inspection.title}" verwijderen?`);
  if (!confirmed) return;

  saveInspections(inspections.filter(item => item.id !== id));

  if (currentInspectionId === id) {
    resetCurrentForm("Onderzoek verwijderd");
  } else {
    renderInspectionList();
    saveStatus.textContent = "Onderzoek verwijderd";
  }
}

function migrateSingleSavedInspection() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved || loadInspections().length) return false;

  try {
    const data = JSON.parse(saved);
    currentInspectionId = createInspectionId();
    saveInspections([{
      id: currentInspectionId,
      title: getInspectionTitle(data),
      updatedAt: data.laatst_opgeslagen || new Date().toISOString(),
      data
    }]);
    restoreForm(data);
    saveStatus.textContent = "Bestaand formulier gemigreerd";
    renderInspectionList();
    return true;
  } catch (error) {
    console.warn("Bestaand formulier kon niet worden gemigreerd.", error);
    return false;
  }
}

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

  document.querySelector(".steps").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
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

async function saveForm() {
  await compressCurrentPhotos();
  const data = formToObject();
  const inspections = loadInspections();
  const now = new Date().toISOString();

  if (!currentInspectionId) {
    currentInspectionId = createInspectionId();
  }

  const inspection = {
    id: currentInspectionId,
    title: getInspectionTitle(data),
    updatedAt: now,
    data
  };

  const existingIndex = inspections.findIndex(item => item.id === currentInspectionId);
  if (existingIndex >= 0) {
    inspections[existingIndex] = inspection;
  } else {
    inspections.push(inspection);
  }

  try {
    saveInspections(inspections);
  } catch (error) {
    console.warn("Formulier kon niet lokaal worden opgeslagen.", error);
    alert("Opslaan is mislukt. De foto's zijn mogelijk te groot voor lokale opslag. Probeer kleinere foto's of exporteer direct naar JSON.");
    return;
  }

  const savedMessage = `Opgeslagen ${new Date().toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;

  renderInspectionList();
  saveStatus.textContent = savedMessage;
  alert(`${savedMessage}. Het onderzoek staat nu in deze browser opgeslagen.`);
}

function markUnsaved() {
  saveStatus.textContent = "Wijzigingen niet opgeslagen";
}

document.querySelector("#saveButton").addEventListener("click", saveForm);
openInspectionButton.addEventListener("click", () => openInspection(inspectionSelect.value));
newInspectionButton.addEventListener("click", () => {
  const confirmed = !currentInspectionId || window.confirm("Nieuw onderzoek starten? Niet-opgeslagen wijzigingen gaan verloren.");
  if (confirmed) resetCurrentForm();
});
copyInspectionButton.addEventListener("click", () => copyInspection(inspectionSelect.value));
deleteInspectionButton.addEventListener("click", () => deleteInspection(inspectionSelect.value));
form.addEventListener("input", markUnsaved);
form.addEventListener("change", markUnsaved);


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

function resizePhoto(file, maxSize = 900, quality = 0.65) {
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

function compressPhotoDataUrl(dataUrl, maxSize = 900, quality = 0.65) {
  if (!dataUrl) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
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
    image.src = dataUrl;
  });
}

async function compressCurrentPhotos() {
  photoData.photo1 = await compressPhotoDataUrl(photoData.photo1);
  photoData.photo2 = await compressPhotoDataUrl(photoData.photo2);
  restorePhoto("photo1", "#preview1", photoData.photo1);
  restorePhoto("photo2", "#preview2", photoData.photo2);
}

async function compressDataPhotos(data) {
  data.fotos ??= {};
  data.fotos.photo1 = await compressPhotoDataUrl(data.fotos.photo1);
  data.fotos.photo2 = await compressPhotoDataUrl(data.fotos.photo2);
  return data;
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

async function loadImportedData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Ongeldig JSON-bestand.");
  }

  currentInspectionId = createInspectionId();
  form.reset();
  restoreForm(data);

  try {
    const importedData = await compressDataPhotos(formToObject());
    const inspections = loadInspections();
    inspections.push({
      id: currentInspectionId,
      title: getInspectionTitle(importedData),
      updatedAt: new Date().toISOString(),
      data: importedData
    });
    saveInspections(inspections);
  } catch (error) {
    console.warn("Geïmporteerd formulier kon niet lokaal worden opgeslagen.", error);
    alert("JSON is geïmporteerd, maar lokaal opslaan is mislukt. De foto's zijn mogelijk te groot.");
    return;
  }

  showStep(1);
  renderInspectionList();
  saveStatus.textContent = "JSON geïmporteerd en lokaal opgeslagen";
}

importFile.addEventListener("change", () => {
  const file = importFile.files?.[0];
  if (!file) return;

  const reader = new FileReader();

  reader.addEventListener("load", async () => {
    try {
      await loadImportedData(JSON.parse(reader.result));
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

function createExportBaseName(data) {
  const project = data.project?.toString().trim() || "Project";
  const plantplaatsnummer = data.plantplaatsnummer?.toString().trim() || "Plantplaats";

  return `${project}_Groeiplaatsbeoordeling_${plantplaatsnummer}`
    .replace(/[^a-z0-9-_]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

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

  const reportName = createExportBaseName(data);

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(reportName)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2a1a; font-size: 12px; }
    h1, h2 { color: #355021; }
    h1 { margin: 0; font-size: 22px; }
    h2 { margin: 0 0 6px; font-size: 15px; }
    .subtitle { color: #667060; margin: 4px 0 0; }
    .report-page:not(:last-child) { break-after: page; page-break-after: always; }
    section { break-inside: avoid; page-break-inside: avoid; margin-top: 10px; }
    .report-layout { display: grid; grid-template-columns: minmax(0, 1fr) 38%; gap: 12px; align-items: start; }
    .report-main { min-width: 0; }
    .report-photos { break-inside: avoid; page-break-inside: avoid; }
    table { width: auto; max-width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #ccd5c6; padding: 3px 5px; text-align: left; vertical-align: top; }
    th { width: 1%; white-space: nowrap; background: #e8efe3; }
    td { min-width: 130px; }
    .photo-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
    figure { margin: 0; break-inside: avoid; page-break-inside: avoid; }
    img { width: 100%; max-height: 235px; object-fit: contain; border: 1px solid #ccd5c6; }
    figcaption { margin-top: 4px; color: #667060; }
    @media print {
      body { margin: 0; }
      button { display: none; }
    }
  </style>
</head>
<body>
  <div class="report-page">
  <h1>${escapeHtml(reportName)}</h1>
  <p class="subtitle">Rapport gegenereerd op ${escapeHtml(new Date().toLocaleString("nl-NL"))}</p>

  <div class="report-layout">
  <div class="report-main">
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

  </div>
  <aside class="report-photos">
    <section>
      <h2>Foto's</h2>
      <div class="photo-grid">${photos}</div>
    </section>
  </aside>
  </div>

  </div>

  <div class="report-page">
  <h1>${escapeHtml(reportName)}</h1>
  <p class="subtitle">Toetsing en advies</p>

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
    <h2>Eindconclusie</h2>
    <table>
      ${reportRow("Eindconclusie", data.eindconclusie)}
    </table>
  </section>

  <section>
    <h2>Advies</h2>
    <table>
      ${reportRow("Aanbevolen boomsoort(en)", data.boomsoorten)}
      ${reportRow("Benodigde plantvakafmetingen", data.plantvakafmetingen)}
      ${reportRow("Maatregelen", data.maatregelen)}
      ${reportRow("Advies / uitwerking", data.advies)}
    </table>
  </section>
  </div>
</body>
</html>`;
}

function openReport() {
  const data = formToObject();
  const reportWindow = window.open("", createExportBaseName(data));

  if (!reportWindow) {
    alert("Het rapport kon niet worden geopend. Sta pop-ups toe voor deze app en probeer opnieuw.");
    return;
  }

  reportWindow.document.open();
  reportWindow.document.write(createReportHtml(data));
  reportWindow.document.close();

  window.setTimeout(() => {
    reportWindow.focus();
    reportWindow.print();
  }, 500);
}

document.querySelector("#reportButton").addEventListener("click", openReport);

document.querySelector("#exportButton").addEventListener("click", () => {
  const data = formToObject();

  const safeName = createExportBaseName(data);

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

renderInspectionList();

if (!migrateSingleSavedInspection()) {
  if (loadInspections().length) {
    localStorage.removeItem(STORAGE_KEY);
  }

  resetCurrentForm(loadInspections().length ? "Kies een onderzoek of start nieuw" : "Nog niet opgeslagen");
}
