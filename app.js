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
