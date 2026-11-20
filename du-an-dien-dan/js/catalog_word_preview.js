(() => {
  const safeTags = new Set([
    "A", "B", "BLOCKQUOTE", "BR", "CAPTION", "CODE", "DD", "DEL", "DIV", "DL",
    "DT", "EM", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "I", "IMG", "LI",
    "OL", "P", "PRE", "S", "SPAN", "STRONG", "SUB", "SUP", "TABLE", "TBODY",
    "TD", "TFOOT", "TH", "THEAD", "TR", "U", "UL",
  ]);
  const unsafeTags = new Set(["IFRAME", "OBJECT", "SCRIPT", "STYLE", "SVG"]);

  function sanitizeWordHtml(markup) {
    const parsed = new DOMParser().parseFromString(markup, "text/html");
    const fragment = document.createDocumentFragment();

    function copySafeNode(source, target) {
      if (source.nodeType === Node.TEXT_NODE) {
        target.append(document.createTextNode(source.textContent || ""));
        return;
      }
      if (source.nodeType !== Node.ELEMENT_NODE || unsafeTags.has(source.tagName)) return;
      if (!safeTags.has(source.tagName)) {
        source.childNodes.forEach((child) => copySafeNode(child, target));
        return;
      }

      const element = document.createElement(source.tagName.toLowerCase());
      if (source.tagName === "A") {
        try {
          const href = source.getAttribute("href");
          if (href) {
            const url = new URL(href, window.location.href);
            if (["http:", "https:", "mailto:"].includes(url.protocol)) {
              element.href = url.href;
              element.rel = "noopener noreferrer";
              element.target = "_blank";
            }
          }
        } catch {
          // Ignore invalid links from the document.
        }
      } else if (source.tagName === "IMG") {
        const imageSource = source.getAttribute("src") || "";
        if (/^data:image\/(?:png|jpeg|gif|bmp|webp);base64,/i.test(imageSource)) {
          element.src = imageSource;
        }
        const altText = source.getAttribute("alt");
        if (altText) element.alt = altText;
      } else if (source.tagName === "TD" || source.tagName === "TH") {
        for (const attribute of ["colspan", "rowspan"]) {
          const value = source.getAttribute(attribute);
          if (value && /^\d{1,2}$/.test(value) && Number(value) > 0) {
            element.setAttribute(attribute, value);
          }
        }
      }

      target.append(element);
      source.childNodes.forEach((child) => copySafeNode(child, element));
    }

    parsed.body.childNodes.forEach((child) => copySafeNode(child, fragment));
    return fragment;
  }

  window.openCatalogWordPreview = async (resource, button, status) => {
    button.disabled = true;
    button.textContent = resource.type === "DOC"
      ? "Đang chuyển DOC thành PDF..."
      : "Đang chuyển DOCX thành HTML...";
    status.hidden = true;
    status.textContent = "";

    try {
      if (resource.type === "DOCX" && !window.mammoth) {
        throw new Error("Không tải được bộ chuyển đổi DOCX. Hãy kiểm tra kết nối rồi thử lại.");
      }
      const previewPath = resource.type === "DOC"
        ? `/api/catalog/files/${encodeURIComponent(resource.file_key)}/preview`
        : `/api/catalog/files/${encodeURIComponent(resource.file_key)}`;
      const response = await fetch(previewPath, { credentials: "same-origin" });
      if (response.status === 401) {
        window.location.href = "tai_khoan.html";
        return;
      }
      if (!response.ok) {
        let detail = "";
        try {
          detail = (await response.json()).detail || "";
        } catch {
          detail = "";
        }
        throw new Error(detail || `Không tải được tài liệu (lỗi ${response.status}).`);
      }

      if (resource.type === "DOC") {
        const pdf = await response.blob();
        if (!pdf.type.startsWith("application/pdf")) {
          throw new Error("Máy chủ không trả về PDF xem trước hợp lệ.");
        }
        window.openCatalogDocViewer(resource.title, resource.file_name, pdf);
      } else {
        const result = await window.mammoth.convertToHtml({
          arrayBuffer: await response.arrayBuffer(),
        });
        const content = sanitizeWordHtml(result.value);
        if (!content.childNodes.length) {
          throw new Error("Tệp DOCX không có nội dung để hiển thị.");
        }
        const page = document.createElement("article");
        page.className = "resource-docx-page";
        page.append(content);
        window.openCatalogDocumentViewer(resource.title, resource.file_name, page.innerHTML);
      }
    } catch (error) {
      status.textContent = `Không thể xem tài liệu: ${error.message}`;
      status.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "Xem nội dung tài liệu";
    }
  };
})();
