(() => {
  "use strict";

  const SEARCH_URL = "https://www.google.com/search?q=";
  const wallpaperKey = "helium-dither-wallpaper-v1";
  const generatedWallpaper = "__generated__";
  const defaultWallpaper = "wallpaper.jpg";
  const storage = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* Keep it for this tab. */ }
    },
  };
  const clock = document.getElementById("clock");
  const date = document.getElementById("date");
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const appearanceButton = document.getElementById("appearance-button");
  const appearancePanel = document.getElementById("appearance-panel");
  const wallpaperInput = document.getElementById("wallpaper-input");
  const resetWallpaper = document.getElementById("reset-wallpaper");

  const updateTime = () => {
    const now = new Date();
    clock.textContent = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    date.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(now);
  };

  const looksLikeUrl = (value) => {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return true;
    if (/^localhost(?::\d+)?(?:\/|$)/i.test(value)) return true;
    return /^[^\s]+\.[a-z]{2,}(?::\d+)?(?:\/[^\s]*)?$/i.test(value);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    location.href = looksLikeUrl(value)
      ? (/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`)
      : SEARCH_URL + encodeURIComponent(value);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== input) {
      event.preventDefault();
      input.focus();
    }
    if (event.key === "Escape") {
      input.value = "";
      appearancePanel.hidden = true;
      appearanceButton.setAttribute("aria-expanded", "false");
    }
  });

  appearanceButton.addEventListener("click", () => {
    const willOpen = appearancePanel.hidden;
    appearancePanel.hidden = !willOpen;
    appearanceButton.setAttribute("aria-expanded", String(willOpen));
  });

  const resizeWallpaper = (file) => new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const maxDimension = 2200;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const output = document.createElement("canvas");
      output.width = Math.max(1, Math.round(image.naturalWidth * scale));
      output.height = Math.max(1, Math.round(image.naturalHeight * scale));
      output.getContext("2d", { alpha: false }).drawImage(image, 0, 0, output.width, output.height);
      URL.revokeObjectURL(url);
      resolve(output.toDataURL("image/jpeg", 0.84));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    image.src = url;
  });

  wallpaperInput.addEventListener("change", async () => {
    const [file] = wallpaperInput.files;
    if (!file) return;
    try {
      const dataUrl = await resizeWallpaper(file);
      storage.set(wallpaperKey, dataUrl);
      await window.heliumDither?.setImage(dataUrl);
      appearancePanel.hidden = true;
      appearanceButton.setAttribute("aria-expanded", "false");
    } catch (error) {
      console.error(error);
    } finally {
      wallpaperInput.value = "";
    }
  });

  resetWallpaper.addEventListener("click", async () => {
    storage.set(wallpaperKey, generatedWallpaper);
    await window.heliumDither?.setImage(null);
  });

  updateTime();
  setInterval(updateTime, 15_000);
  const savedWallpaper = storage.get(wallpaperKey);
  if (savedWallpaper !== generatedWallpaper) {
    window.heliumDither?.setImage(savedWallpaper || defaultWallpaper).catch(console.error);
  }
})();
