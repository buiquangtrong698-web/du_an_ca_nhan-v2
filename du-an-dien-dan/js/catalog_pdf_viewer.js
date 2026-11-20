(() => {
  let dialog;
  let badgeElement;
  let titleElement;
  let fileNameElement;
  let frame;
  let activeObjectUrl = null;

  function createDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "catalog-pdf-viewer-dialog";
    dialog.setAttribute("aria-labelledby", "catalog-pdf-viewer-title");

    const header = document.createElement("header");
    header.className = "catalog-pdf-viewer-header";

    const badge = document.createElement("span");
    badge.className = "catalog-pdf-viewer-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = "PDF";
    badgeElement = badge;

    const identity = document.createElement("div");
    identity.className = "catalog-pdf-viewer-identity";

    titleElement = document.createElement("h2");
    titleElement.className = "catalog-pdf-viewer-title";
    titleElement.id = "catalog-pdf-viewer-title";

    fileNameElement = document.createElement("p");
    fileNameElement.className = "catalog-pdf-viewer-filename";
    identity.append(titleElement, fileNameElement);

    const closeButton = document.createElement("button");
    closeButton.className = "catalog-pdf-viewer-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Đóng trình xem tài liệu");
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => dialog.close());

    frame = document.createElement("iframe");
    frame.className = "catalog-pdf-viewer-frame";
    frame.title = "Nội dung tệp PDF";

    header.append(badge, identity, closeButton);
    dialog.append(header, frame);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      frame.removeAttribute("srcdoc");
      frame.removeAttribute("sandbox");
      frame.src = "about:blank";
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
      }
    });
    document.body.append(dialog);
  }

  function showViewer(badge, title, fileName) {
    if (!dialog) createDialog();
    badgeElement.textContent = badge;
    titleElement.textContent = title;
    fileNameElement.textContent = fileName;
    if (!dialog.open) dialog.showModal();
  }

  window.openCatalogPdfViewer = (title, fileName, sourceUrl, badge = "PDF") => {
    showViewer(badge, title, fileName);
    frame.removeAttribute("srcdoc");
    frame.removeAttribute("sandbox");
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
    if (sourceUrl.startsWith("blob:")) activeObjectUrl = sourceUrl;
    frame.src = sourceUrl;
  };

  window.openCatalogDocViewer = (title, fileName, pdfBlob) => {
    const previewUrl = URL.createObjectURL(pdfBlob);
    window.openCatalogPdfViewer(title, fileName, previewUrl, "DOC");
  };

  window.openCatalogDocumentViewer = (title, fileName, safeHtml) => {
    showViewer("DOCX", title, fileName);
    frame.removeAttribute("src");
    frame.removeAttribute("sandbox");
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
    frame.setAttribute("sandbox", "");
    frame.srcdoc = `<!doctype html>
      <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * { box-sizing: border-box; }
            html, body { min-height: 100%; margin: 0; }
            body { padding: clamp(12px, 3vw, 32px); background: #e7ebf2; color: #242a3a; font: 16px/1.75 Georgia, "Times New Roman", serif; }
            .resource-docx-page { width: min(100%, 900px); min-height: calc(100vh - 64px); margin: 0 auto; padding: clamp(22px, 5vw, 64px); background: #fff; box-shadow: 0 4px 18px rgb(22 35 62 / 12%); overflow-wrap: anywhere; }
            .resource-docx-page > * { max-width: 100%; }
            .resource-docx-page h1, .resource-docx-page h2, .resource-docx-page h3, .resource-docx-page h4, .resource-docx-page h5, .resource-docx-page h6 { color: #1d3768; line-height: 1.35; }
            .resource-docx-page img { display: block; max-width: 100%; height: auto; margin: 16px auto; }
            .resource-docx-page table { width: 100%; border-collapse: collapse; }
            .resource-docx-page th, .resource-docx-page td { padding: 7px; border: 1px solid #cdd4df; text-align: left; vertical-align: top; }
            @media (max-width: 560px) { body { padding: 8px; } .resource-docx-page { min-height: calc(100vh - 16px); padding: 20px; } }
          </style>
        </head>
        <body><article class="resource-docx-page">${safeHtml}</article></body>
      </html>`;
  };
})();
