/** Lecteur technique uniquement : le serveur décide de l’effet du scan. */
export function readQrCode() {
  return new Promise((resolve, reject) => {
    const dialog = document.createElement("dialog");
    dialog.className = "qr-scanner-dialog";
    const title = document.createElement("h2");
    title.textContent = "Scanner un QR code";
    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    const status = document.createElement("p");
    status.textContent = "Autorisez la caméra, puis cadrez le QR code.";
    const manual = document.createElement("input");
    manual.placeholder = "Ou saisir le code imprimé RPGGPS|…";
    manual.setAttribute("aria-label", "Code imprimé");
    const validate = document.createElement("button");
    validate.textContent = "Utiliser ce code";
    const close = document.createElement("button");
    close.textContent = "Annuler";
    dialog.append(title, video, status, manual, validate, close);
    document.body.append(dialog);
    let stream,
      frame,
      done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      dialog.close();
      dialog.remove();
      value ? resolve(value) : reject(new Error("Scan annulé."));
    };
    close.onclick = () => finish(null);
    dialog.onclose = () => finish(null);
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(null);
    };
    validate.onclick = () => {
      if (manual.value.trim()) finish(manual.value.trim());
    };
    dialog.showModal();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    function scan() {
      if (done) return;
      if (video.readyState >= 2 && globalThis.jsQR) {
        canvas.width = Math.min(video.videoWidth, 720);
        canvas.height = Math.round(
          (video.videoHeight * canvas.width) / video.videoWidth,
        );
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const qr = globalThis.jsQR(pixels.data, pixels.width, pixels.height);
        if (qr) {
          finish(qr.data);
          return;
        }
      }
      frame = requestAnimationFrame(scan);
    }
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      })
      .then((result) => {
        if (done) {
          result.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = result;
        video.srcObject = stream;
        void video.play();
        scan();
      })
      .catch(() => {
        status.textContent =
          "Caméra indisponible. Saisissez le code imprimé sous le QR code.";
      });
    if (!navigator.mediaDevices)
      status.textContent = "Caméra indisponible. Saisissez le code imprimé.";
  });
}

export function parsePartyQr(value, code) {
  const parts = String(value).split("|");
  if (
    parts.length !== 3 ||
    parts[0] !== "RPGGPS" ||
    parts[1] !== code ||
    !parts[2]
  )
    throw new Error("Ce QR code ne correspond pas à cette partie.");
  return parts[2];
}

export function measureGps() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Géolocalisation indisponible."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        }),
      () => reject(new Error("Position GPS refusée ou indisponible.")),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  });
}
