const STORAGE_KEY = "groeiplaats-inspectie-v1";
const INSPECTIONS_STORAGE_KEY = "groeiplaats-inspecties-v1";
const DATABASE_NAME = "groeiplaatsbeoordeling";
const DATABASE_VERSION = 1;
const INSPECTIONS_STORE = "inspections";
const PHOTO_MAX_SIZE = 1200;
const PHOTO_QUALITY = 0.75;

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
const storageStatus = document.querySelector("#storageStatus");

let currentStep = 1;
let currentInspectionId = null;
const photoData = {
  photo1: null,
  photo2: null
};
const photoPreviewUrls = {
  photo1: null,
  photo2: null
};

let databasePromise;

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

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(INSPECTIONS_STORE)) {
          database.createObjectStore(INSPECTIONS_STORE, { keyPath: "id" });
        }
      });

      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
      request.addEventListener("blocked", () => reject(new DOMException(
        "Een ander tabblad gebruikt nog een oudere versie van de database.",
        "InvalidStateError"
      )));
    });
  }

  return databasePromise;
}

async function runInspectionRequest(mode, execute) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(INSPECTIONS_STORE, mode);
    const store = transaction.objectStore(INSPECTIONS_STORE);
    const request = execute(store);
    let result;

    request.addEventListener("success", () => {
      result = request.result;
      if (mode === "readonly") resolve(result);
    });
    request.addEventListener("error", () => reject(request.error));
    transaction.addEventListener("complete", () => {
      if (mode !== "readonly") resolve(result);
    });
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

function loadInspections() {
  return runInspectionRequest("readonly", store => store.getAll());
}

function loadInspection(id) {
  return runInspectionRequest("readonly", store => store.get(id));
}

function saveInspection(inspection) {
  return runInspectionRequest("readwrite", store => store.put(inspection));
}

function removeInspection(id) {
  return runInspectionRequest("readwrite", store => store.delete(id));
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
  const photos = { ...(data.fotos || {}) };
  const clone = JSON.parse(JSON.stringify({ ...data, fotos: undefined }));
  clone.fotos = photos;
  return clone;
}

async function renderInspectionList() {
  const inspections = await loadInspections();
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
  restorePhoto("photo1", "#preview1", null);
  restorePhoto("photo2", "#preview2", null);

  ["#photo1Camera", "#photo1File", "#photo2Camera", "#photo2File"].forEach(selector => {
    document.querySelector(selector).value = "";
  });
}

async function resetCurrentForm(message = "Nieuw onderzoek") {
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
  await renderInspectionList();
}

async function openInspection(id) {
  const inspection = await loadInspection(id);
  if (!inspection) return;

  currentInspectionId = inspection.id;
  form.reset();
  restoreForm(inspection.data);
  showStep(1);
  saveStatus.textContent = "Onderzoek geopend";
  await renderInspectionList();
}

async function copyInspection(id) {
  const source = await loadInspection(id);
  if (!source) return;

  const data = cloneData(source.data);
  currentInspectionId = createInspectionId();

  const copiedInspection = {
    id: currentInspectionId,
    title: `Kopie van ${source.title}`,
    updatedAt: new Date().toISOString(),
    data
  };

  try {
    await saveInspection(copiedInspection);
  } catch (error) {
    console.warn("Onderzoek kon niet worden gekopieerd.", error);
    showStorageError("Kopiëren", error);
    return;
  }

  form.reset();
  restoreForm(data);
  showStep(1);
  saveStatus.textContent = "Onderzoek gekopieerd";
  await renderInspectionList();
  await updateStorageStatus();
}

async function deleteInspection(id) {
  const inspection = await loadInspection(id);
  if (!inspection) return;

  const confirmed = window.confirm(`Onderzoek "${inspection.title}" verwijderen?`);
  if (!confirmed) return;

  try {
    await removeInspection(id);
  } catch (error) {
    console.warn("Onderzoek kon niet worden verwijderd.", error);
    showStorageError("Verwijderen", error);
    return;
  }

  if (currentInspectionId === id) {
    await resetCurrentForm("Onderzoek verwijderd");
  } else {
    await renderInspectionList();
    saveStatus.textContent = "Onderzoek verwijderd";
  }

  await updateStorageStatus();
}

async function migrateLegacyStorageToIndexedDb() {
  const legacyInspections = [];
  const savedList = localStorage.getItem(INSPECTIONS_STORAGE_KEY);
  const savedSingle = localStorage.getItem(STORAGE_KEY);

  const parsedList = savedList ? JSON.parse(savedList) : [];
  if (Array.isArray(parsedList)) legacyInspections.push(...parsedList);

  if (!legacyInspections.length && savedSingle) {
    const data = JSON.parse(savedSingle);
    legacyInspections.push({
      id: createInspectionId(),
      title: getInspectionTitle(data),
      updatedAt: data.laatst_opgeslagen || new Date().toISOString(),
      data
    });
  }

  for (const inspection of legacyInspections) {
    inspection.data = await convertPhotosToBlobs(inspection.data);
    await saveInspection(inspection);
  }

  if (legacyInspections.length) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(INSPECTIONS_STORAGE_KEY);
  }

  return legacyInspections.length;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "kB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);
  return `${value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
}

async function updateStorageStatus() {
  if (!storageStatus || !navigator.storage?.estimate) return;

  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const persistent = navigator.storage.persisted
      ? await navigator.storage.persisted()
      : false;
    storageStatus.textContent = `Browseropslag: ${formatBytes(usage)} gebruikt van circa ${formatBytes(quota)}${persistent ? " · permanent" : ""}`;
  } catch (error) {
    console.warn("Opslaggebruik kon niet worden bepaald.", error);
  }
}

async function requestPersistentStorage() {
  if (!navigator.storage?.persist || !navigator.storage?.persisted) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

function getStorageErrorMessage(action, error) {
  const errorName = error?.name || "Onbekende fout";

  if (errorName === "QuotaExceededError") {
    return `${action} is mislukt omdat de browseropslag voor deze app vol is. Exporteer belangrijke onderzoeken en verwijder oude gegevens of maak opslagruimte vrij.`;
  }

  if (["InvalidStateError", "NotAllowedError", "SecurityError"].includes(errorName)) {
    return `${action} is mislukt omdat lokale opslag niet beschikbaar is. Gebruik geen privévenster, sluit andere tabbladen van de app en controleer of sitegegevens zijn toegestaan. (${errorName})`;
  }

  if (errorName === "AbortError") {
    return `${action} is door de browser onderbroken. Sluit andere tabbladen van de app en probeer het opnieuw. (${errorName})`;
  }

  if (["DataCloneError", "DataError"].includes(errorName)) {
    return `${action} is mislukt omdat een gegeven of foto niet kon worden verwerkt. (${errorName})`;
  }

  if (errorName === "UnknownError") {
    return `${action} is mislukt door een browser- of schijffout. Start de browser opnieuw en probeer het nogmaals. (${errorName})`;
  }

  const detail = error?.message ? `: ${error.message}` : "";
  return `${action} is mislukt (${errorName}${detail}).`;
}

function showStorageError(action, error) {
  alert(getStorageErrorMessage(action, error));
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

function toSafeFilePart(value, fallback) {
  const safeValue = String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safeValue || fallback;
}

function createPhotoFileName(data, number) {
  const plantplaatsnummer = toSafeFilePart(data.plantplaatsnummer, "onbekende-plantplaats");
  const date = toSafeFilePart(data.datum, "onbekende-datum");
  return `${plantplaatsnummer}_${date}_situatiefoto-${number}.jpg`;
}

function updatePhotoName(key) {
  const label = document.querySelector(`[data-photo-name="${key}"]`);
  if (!label) return;

  if (!photoData[key]) {
    label.hidden = true;
    label.textContent = "";
    return;
  }

  const number = key === "photo1" ? 1 : 2;
  label.textContent = createPhotoFileName({
    plantplaatsnummer: form.elements.plantplaatsnummer.value,
    datum: form.elements.datum.value
  }, number);
  label.hidden = false;
}

function updateAllPhotoNames() {
  updatePhotoName("photo1");
  updatePhotoName("photo2");
}

[form.elements.plantplaatsnummer, form.elements.datum].forEach(field => {
  field.addEventListener("input", updateAllPhotoNames);
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
  result.foto_bestandsnamen = {
    photo1: photoData.photo1 ? createPhotoFileName(result, 1) : null,
    photo2: photoData.photo2 ? createPhotoFileName(result, 2) : null
  };
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
  updateAllPhotoNames();

  calculateVolume();
  saveStatus.textContent = "Lokaal geladen";
}

async function saveForm() {
  const data = formToObject();
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

  try {
    await saveInspection(inspection);
  } catch (error) {
    console.warn("Formulier kon niet lokaal worden opgeslagen.", error);
    showStorageError("Opslaan", error);
    return;
  }

  const savedMessage = `Opgeslagen ${new Date().toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;

  await renderInspectionList();
  await updateStorageStatus();
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
  if (photoPreviewUrls[key]) {
    URL.revokeObjectURL(photoPreviewUrls[key]);
    photoPreviewUrls[key] = null;
  }

  if (value) {
    const previewUrl = value instanceof Blob ? URL.createObjectURL(value) : value;
    if (value instanceof Blob) photoPreviewUrls[key] = previewUrl;
    preview.src = previewUrl;
    preview.hidden = false;
  } else {
    preview.hidden = true;
    preview.removeAttribute("src");
  }

  const removeButton = document.querySelector(`[data-remove-photo="${key}"]`);
  if (removeButton) removeButton.hidden = !value;
  updatePhotoName(key);
}

function resizePhoto(file, maxSize = PHOTO_MAX_SIZE, quality = PHOTO_QUALITY) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file);
    const image = new Image();

    image.addEventListener("load", () => {
      URL.revokeObjectURL(sourceUrl);
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);

      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error("De foto kon niet naar JPEG worden omgezet."));
      }, "image/jpeg", quality);
    });

    image.addEventListener("error", error => {
      URL.revokeObjectURL(sourceUrl);
      reject(error);
    });
    image.src = sourceUrl;
  });
}

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then(response => response.blob());
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

async function convertPhotosToBlobs(data) {
  const converted = cloneData(data);
  converted.fotos ??= {};

  for (const key of ["photo1", "photo2"]) {
    const photo = converted.fotos[key];
    converted.fotos[key] = typeof photo === "string" && photo
      ? await dataUrlToBlob(photo)
      : photo || null;
  }

  return converted;
}

async function convertPhotosToDataUrls(data) {
  const converted = cloneData(data);
  converted.fotos ??= {};

  for (const key of ["photo1", "photo2"]) {
    const photo = converted.fotos[key];
    converted.fotos[key] = photo instanceof Blob ? await blobToDataUrl(photo) : photo || null;
  }

  return converted;
}

function setupPhotoInput(inputSelector, previewSelector, key) {
  const input = document.querySelector(inputSelector);

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const photoBlob = await resizePhoto(file);
      restorePhoto(key, previewSelector, photoBlob);
      markUnsaved();
    } catch (error) {
      console.warn("Foto kon niet worden verwerkt.", error);
      alert("De foto kon niet worden verwerkt. Probeer een andere foto.");
    }
  });
}

function setupPhotoRemoval(inputSelectors, previewSelector, key) {
  const button = document.querySelector(`[data-remove-photo="${key}"]`);

  button.addEventListener("click", () => {
    inputSelectors.forEach(selector => {
      document.querySelector(selector).value = "";
    });
    restorePhoto(key, previewSelector, null);
    markUnsaved();
  });
}

setupPhotoInput("#photo1Camera", "#preview1", "photo1");
setupPhotoInput("#photo1File", "#preview1", "photo1");
setupPhotoInput("#photo2Camera", "#preview2", "photo2");
setupPhotoInput("#photo2File", "#preview2", "photo2");
setupPhotoRemoval(["#photo1Camera", "#photo1File"], "#preview1", "photo1");
setupPhotoRemoval(["#photo2Camera", "#photo2File"], "#preview2", "photo2");

async function loadImportedData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Ongeldig JSON-bestand.");
  }

  const importedData = await convertPhotosToBlobs(data);
  currentInspectionId = createInspectionId();
  form.reset();
  restoreForm(importedData);

  try {
    const restoredData = formToObject();
    await saveInspection({
      id: currentInspectionId,
      title: getInspectionTitle(restoredData),
      updatedAt: new Date().toISOString(),
      data: restoredData
    });
  } catch (error) {
    console.warn("Geïmporteerd formulier kon niet lokaal worden opgeslagen.", error);
    showStorageError("JSON importeren", error);
    return;
  }

  showStep(1);
  await renderInspectionList();
  await updateStorageStatus();
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

  const plantplaatsLabel = data.plantplaatsnummer?.toString().trim() || "onbekend";
  const photoSources = [
    { key: "photo1", number: 1, src: data.fotos?.photo1 },
    { key: "photo2", number: 2, src: data.fotos?.photo2 }
  ].filter(photo => photo.src);
  const photos = photoSources
    .map(({ key, number, src }) => {
      const fileName = data.foto_bestandsnamen?.[key] || createPhotoFileName(data, number);
      return `
      <figure>
        <img src="${src}" alt="Situatiefoto ${number} van plantplaats ${escapeHtml(plantplaatsLabel)}">
        <figcaption>Plantplaats ${escapeHtml(plantplaatsLabel)} – Situatiefoto ${number}<br><small>${escapeHtml(fileName)}</small></figcaption>
      </figure>
    `;
    }).join("") || "<p>Geen foto's toegevoegd.</p>";

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
    <h2>Objecten en dieptes</h2>
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
    <h2>Bodemprofiel</h2>
    <table>
      <tr><th>Van (cm)</th><th>Tot (cm)</th><th>Bodemsoort</th><th>Opmerking</th></tr>
      ${layers}
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

async function openReport() {
  const rawData = formToObject();
  const reportWindow = window.open("", createExportBaseName(rawData));

  if (!reportWindow) {
    alert("Het rapport kon niet worden geopend. Sta pop-ups toe voor deze app en probeer opnieuw.");
    return;
  }

  const data = await convertPhotosToDataUrls(rawData);
  reportWindow.document.open();
  reportWindow.document.write(createReportHtml(data));
  reportWindow.document.close();

  window.setTimeout(() => {
    reportWindow.focus();
    reportWindow.print();
  }, 500);
}

document.querySelector("#reportButton").addEventListener("click", openReport);

document.querySelector("#exportButton").addEventListener("click", async () => {
  const data = await convertPhotosToDataUrls(formToObject());

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

async function initializeApp() {
  try {
    const migratedCount = await migrateLegacyStorageToIndexedDb();
    await requestPersistentStorage();
    const inspections = await loadInspections();
    const message = migratedCount
      ? `${migratedCount} bestaand${migratedCount === 1 ? " onderzoek" : "e onderzoeken"} gemigreerd`
      : inspections.length
        ? "Kies een onderzoek of start nieuw"
        : "Nog niet opgeslagen";

    await resetCurrentForm(message);
    await updateStorageStatus();
  } catch (error) {
    console.error("De lokale opslag kon niet worden gestart.", error);
    saveStatus.textContent = "Opslag niet beschikbaar";
    showStorageError("Lokale opslag starten", error);
  }
}

initializeApp();
