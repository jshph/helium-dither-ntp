(() => {
  "use strict";

  const SEARCH_URL = "https://www.google.com/search?q=";
  const wallpaperKey = "helium-dither-wallpaper-v1";
  const wallpaperDatabase = "helium-dither-wallpapers-v1";
  const generatedWallpaper = "__generated__";
  const defaultWallpaper = "wallpaper.jpg";
  const configuredWallpapers = window.HELIUM_NTP_CONFIG?.wallpapers ?? [];
  const shuffle = (items) => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
  };
  let wallpaperQueue = shuffle(configuredWallpapers);
  const storage = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* Keep it for this tab. */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* Keep it for this tab. */ }
    },
  };
  const clock = document.getElementById("clock");
  const date = document.getElementById("date");
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const appearanceButton = document.getElementById("appearance-button");
  const appearancePanel = document.getElementById("appearance-panel");
  const nextWallpaper = document.getElementById("next-wallpaper");
  const wallpaperInput = document.getElementById("wallpaper-input");
  const wallpaperFolderInput = document.getElementById("wallpaper-folder-input");
  const resetWallpaper = document.getElementById("reset-wallpaper");

  const openWallpaperStore = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(wallpaperDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("wallpapers");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const readFolderWallpapers = async () => {
    const database = await openWallpaperStore();
    return new Promise((resolve, reject) => {
      const request = database.transaction("wallpapers").objectStore("wallpapers").get("folder");
      request.onsuccess = () => {
        database.close();
        resolve(request.result ?? []);
      };
      request.onerror = () => {
        database.close();
        reject(request.error);
      };
    });
  };

  const writeFolderWallpapers = async (wallpapers) => {
    const database = await openWallpaperStore();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("wallpapers", "readwrite");
      const store = transaction.objectStore("wallpapers");
      wallpapers.length ? store.put(wallpapers, "folder") : store.delete("folder");
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
    });
  };

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

  const showNextWallpaper = async () => {
    if (!wallpaperQueue.length) {
      await window.heliumDither?.setImage(defaultWallpaper);
      return;
    }
    const next = wallpaperQueue.shift();
    wallpaperQueue.push(next);
    storage.remove(wallpaperKey);
    await window.heliumDither?.setImage(next);
  };

  nextWallpaper.addEventListener("click", () => {
    showNextWallpaper().catch(console.error);
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
      await writeFolderWallpapers([]);
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

  wallpaperFolderInput.addEventListener("change", async () => {
    const files = [...wallpaperFolderInput.files].filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    try {
      const wallpapers = [];
      for (const file of files) wallpapers.push(await resizeWallpaper(file));
      await writeFolderWallpapers(wallpapers);
      storage.remove(wallpaperKey);
      wallpaperQueue = shuffle(wallpapers);
      await showNextWallpaper();
      appearancePanel.hidden = true;
      appearanceButton.setAttribute("aria-expanded", "false");
    } catch (error) {
      console.error(error);
    } finally {
      wallpaperFolderInput.value = "";
    }
  });

  resetWallpaper.addEventListener("click", async () => {
    await writeFolderWallpapers([]);
    wallpaperQueue = shuffle(configuredWallpapers);
    storage.set(wallpaperKey, generatedWallpaper);
    await window.heliumDither?.setImage(null);
  });

  updateTime();
  setInterval(updateTime, 15_000);
  const loadInitialWallpaper = async () => {
    const savedWallpaper = storage.get(wallpaperKey);
    if (savedWallpaper === generatedWallpaper) return;
    if (savedWallpaper) {
      await window.heliumDither?.setImage(savedWallpaper);
      return;
    }
    const folderWallpapers = await readFolderWallpapers();
    if (folderWallpapers.length) wallpaperQueue = shuffle(folderWallpapers);
    await showNextWallpaper();
  };

  loadInitialWallpaper().catch(console.error);
})();
