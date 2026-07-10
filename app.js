const STORAGE_KEY = "groeiplaats-inspectie-v1";

const form = document.querySelector("#inspectionForm");
const panels = [...document.querySelectorAll("[data-panel]")];
const stepButtons = [...document.querySelectorAll("[data-step]")];
const previousButton = document.querySelector("#previousButton");
const nextButton = document.querySelector("#nextButton");
const saveStatus = document.querySelector("#saveStatus");
const layersBody = document.querySelector("#layersTable tbody");
const layerTemplate = document.querySelector("#layerRowTemplate");

let currentStep = 1;

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

  calculateVolume();
  saveStatus.textContent = "Lokaal geladen";
}

function saveForm() {
  const data = formToObject();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

  saveStatus.textContent = `Opgeslagen ${new Date().toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
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

function setupPhotoPreview(inputSelector, previewSelector) {
  const input = document.querySelector(inputSelector);
  const preview = document.querySelector(previewSelector);

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;

    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  });
}

setupPhotoPreview("#photo1", "#preview1");
setupPhotoPreview("#photo2", "#preview2");

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
