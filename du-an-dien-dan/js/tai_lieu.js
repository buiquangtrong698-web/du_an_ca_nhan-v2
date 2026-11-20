const materialsByGrade = {
  10: [],
  11: [],
  12: [],
};

const gradeButtons = [...document.querySelectorAll("[data-grade]")];
const subjectButtons = [...document.querySelectorAll("[data-subject]")];
const typeButtons = [...document.querySelectorAll("[data-type]")];
const resourceList = document.querySelector("#resources-list");
const resultsTitle = document.querySelector("#results-title");
const resourcesCount = document.querySelector("#resources-count");
const searchInput = document.querySelector("#resources-search");
const emptyState = document.querySelector("#empty-state");
const subjectNames = subjectButtons
  .map((button) => button.dataset.subject)
  .filter((subject) => subject !== "all");
const addMaterialButton = document.querySelector("#add-material-button");
const materialDialog = document.querySelector("#material-dialog");
const materialForm = document.querySelector("#material-form");
const materialFormMessage = document.querySelector("#material-form-message");
const materialPageMessage = document.querySelector("#material-page-message");

let selectedGrade = "10";
let selectedSubject = "all";
let selectedType = "all";
let searchTerm = "";
let loadError = null;
let canAddMaterial = false;

function createResourceCard(resource, grade) {
  const card = document.createElement("article");
  card.className = "resource-card";

  const head = document.createElement("div");
  head.className = "resource-card-head";

  const icon = document.createElement("span");
  const typeClass = ["DOC", "DOCX"].includes(resource.type)
    ? "type-doc"
    : resource.type === "Bài tập" ? "type-exercise" : "";
  icon.className = `resource-card-icon ${typeClass}`;
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = resource.type === "Bài tập" ? "BÀI TẬP" : resource.type;

  const category = document.createElement("div");
  const subject = document.createElement("div");
  subject.className = "resource-card-subject";
  subject.textContent = `${resource.subject} · Lớp ${grade}`;
  const level = document.createElement("div");
  level.className = "resource-card-level";
  level.textContent = resource.level;
  category.append(subject, level);
  head.append(icon, category);

  const title = document.createElement("h3");
  title.textContent = resource.title;
  const description = document.createElement("p");
  description.className = "resource-card-description";
  description.textContent = resource.description;

  const meta = document.createElement("div");
  meta.className = "resource-card-meta";
  const fileType = document.createElement("span");
  fileType.textContent = resource.type;
  const pages = document.createElement("span");
  pages.textContent = `${resource.pages} trang`;
  meta.append(fileType, pages);

  if (resource.file_key && resource.file_name) {
    const fileLink = document.createElement("a");
    fileLink.className = "catalog-file-download";
    fileLink.href = `/api/catalog/files/${encodeURIComponent(resource.file_key)}`;
    fileLink.textContent = `Tải tài liệu: ${resource.file_name}`;
    meta.append(fileLink);
  }

  const outline = document.createElement("details");
  outline.className = "resource-outline";
  const summary = document.createElement("summary");
  const hasPreviewableFile = resource.file_key
    && resource.file_name
    && ["PDF", "DOC", "DOCX"].includes(resource.type);
  summary.textContent = hasPreviewableFile ? "Chủ đề tài liệu" : "Xem nội dung tài liệu";
  outline.append(summary);
  let fileOpenButton = null;
  let fileOpenMessage = null;

  if (resource.file_key && resource.file_name && ["PDF", "DOC", "DOCX"].includes(resource.type)) {
    if (resource.type === "PDF") {
      const filePreviewUrl = `/api/catalog/files/${encodeURIComponent(resource.file_key)}?inline=true`;
      fileOpenButton = document.createElement("button");
      fileOpenButton.className = "catalog-file-open-button";
      fileOpenButton.type = "button";
      fileOpenButton.textContent = "Xem nội dung tài liệu";
      fileOpenButton.addEventListener("click", () => {
        window.openCatalogPdfViewer(resource.title, resource.file_name, filePreviewUrl);
      });
    } else {
      fileOpenButton = document.createElement("button");
      fileOpenButton.className = "catalog-file-open-button";
      fileOpenButton.type = "button";
      fileOpenButton.textContent = "Xem nội dung tài liệu";
      fileOpenMessage = document.createElement("p");
      fileOpenMessage.className = "resource-preview-note is-error";
      fileOpenMessage.hidden = true;
      fileOpenButton.addEventListener("click", () => {
        window.openCatalogWordPreview(resource, fileOpenButton, fileOpenMessage);
      });
    }
  } else if (resource.file_key && resource.file_name) {
    const note = document.createElement("p");
    note.className = "resource-preview-note";
    note.textContent = "Định dạng tệp này chưa hỗ trợ xem trực tiếp. Hãy tải xuống để mở nội dung.";
    const downloadLink = document.createElement("a");
    downloadLink.className = "resource-preview-download";
    downloadLink.href = `/api/catalog/files/${encodeURIComponent(resource.file_key)}`;
    downloadLink.download = resource.file_name;
    downloadLink.textContent = `Tải xuống ${resource.file_name}`;
    outline.append(note, downloadLink);
  } else {
    const note = document.createElement("p");
    note.className = "resource-preview-note";
    note.textContent = "Tài liệu này chưa có tệp đính kèm để xem.";
    outline.append(note);
  }

  const topicsHeading = document.createElement("p");
  topicsHeading.className = "resource-preview-topics-heading";
  topicsHeading.textContent = "Nội dung chính";
  const topics = document.createElement("ul");
  resource.topics.forEach((topic) => {
    const item = document.createElement("li");
    item.textContent = topic;
    topics.append(item);
  });
  outline.append(topicsHeading, topics);

  card.append(head, title, description, meta);
  if (fileOpenButton) card.append(fileOpenButton);
  if (fileOpenMessage) card.append(fileOpenMessage);
  card.append(outline);
  if (canAddMaterial) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "catalog-delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Xóa";
    deleteButton.setAttribute("aria-label", `Xóa tài liệu: ${resource.title}`);
    deleteButton.addEventListener("click", () => deleteMaterial(resource, deleteButton));
    card.append(deleteButton);
  }
  return card;
}

function updateAddressBar() {
  const url = new URL(window.location.href);
  url.searchParams.set("grade", selectedGrade);
  if (selectedSubject === "all") url.searchParams.delete("subject");
  else url.searchParams.set("subject", selectedSubject);
  if (selectedType === "all") url.searchParams.delete("type");
  else url.searchParams.set("type", selectedType);
  if (searchTerm.trim()) url.searchParams.set("q", searchTerm.trim());
  else url.searchParams.delete("q");
  window.history.replaceState(null, "", url);

  document.querySelectorAll("[data-course-page-link]").forEach((link) => {
    const courseUrl = new URL("khoa_hoc.html", window.location.href);
    courseUrl.searchParams.set("grade", selectedGrade);
    if (selectedSubject !== "all") courseUrl.searchParams.set("subject", selectedSubject);
    link.href = `khoa_hoc.html${courseUrl.search}`;
  });
  document.querySelectorAll("[data-practice-page-link]").forEach((link) => {
    const practiceUrl = new URL("luyen_de.html", window.location.href);
    practiceUrl.searchParams.set("grade", selectedGrade);
    if (selectedSubject !== "all") practiceUrl.searchParams.set("subject", selectedSubject);
    link.href = `luyen_de.html${practiceUrl.search}`;
  });
}

function renderResources() {
  const query = searchTerm.trim().toLocaleLowerCase("vi");
  const filteredResources = materialsByGrade[selectedGrade].filter((resource) => {
    const matchesSubject = selectedSubject === "all" || resource.subject === selectedSubject;
    const matchesType = selectedType === "all" || resource.type === selectedType;
    const searchableText = `${resource.subject} ${resource.title} ${resource.description} ${resource.type}`.toLocaleLowerCase("vi");
    return matchesSubject && matchesType && searchableText.includes(query);
  });

  const fragment = document.createDocumentFragment();
  filteredResources.forEach((resource) => fragment.append(createResourceCard(resource, selectedGrade)));
  resourceList.replaceChildren(fragment);
  resultsTitle.textContent = selectedSubject === "all"
    ? `Tài liệu lớp ${selectedGrade}`
    : `${selectedSubject} · Lớp ${selectedGrade}`;
  resourcesCount.textContent = loadError ? "Không tải được dữ liệu" : `${filteredResources.length} tài liệu`;
  emptyState.textContent = loadError || "Chưa tìm thấy tài liệu phù hợp. Hãy thử đổi bộ lọc hoặc từ khóa.";
  emptyState.hidden = filteredResources.length > 0 && !loadError;
  updateAddressBar();
}

async function loadResources() {
  try {
    const response = await fetch("/api/catalog/materials", { credentials: "same-origin" });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = "tai_khoan.html";
        return;
      }
      throw new Error(data.detail || `Máy chủ trả về lỗi ${response.status}.`);
    }
    data.forEach((resource) => {
      materialsByGrade[resource.grade].push(resource);
    });
    renderResources();
  } catch (error) {
    loadError = `Không thể tải danh sách tài liệu: ${error.message}`;
    renderResources();
  }
}

async function checkAdminAccess() {
  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (response.status === 401) {
      window.location.href = "tai_khoan.html";
      return;
    }
    if (!response.ok) throw new Error(`Máy chủ trả về lỗi ${response.status}.`);
    const user = await response.json();
    canAddMaterial = user.role === "admin";
    renderResources();
  } catch (error) {
    showMaterialFormMessage(`Không thể kiểm tra quyền thêm tài liệu: ${error.message}`, true);
  } finally {
    addMaterialButton.disabled = false;
  }
}

function showMaterialFormMessage(message, isError = false) {
  materialFormMessage.textContent = message;
  materialFormMessage.classList.toggle("is-error", isError);
}

addMaterialButton.disabled = true;
addMaterialButton.addEventListener("click", () => {
  showMaterialFormMessage("");
  materialPageMessage.textContent = "";
  materialDialog.showModal();
  materialForm.querySelector("[name='title']").focus();
});

function closeMaterialDialog() {
  materialForm.reset();
  materialDialog.close();
  showMaterialFormMessage("");
}

document.querySelector("#cancel-material-button").addEventListener("click", closeMaterialDialog);
document.querySelector("#close-material-dialog").addEventListener("click", closeMaterialDialog);

async function deleteMaterial(resource, deleteButton) {
  if (!canAddMaterial || !window.confirm(`Bạn có chắc muốn xóa tài liệu "${resource.title}"?`)) return;
  deleteButton.disabled = true;
  materialPageMessage.classList.remove("is-error");

  try {
    const response = await fetch(`/api/admin/materials/${resource.id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "tai_khoan.html";
      return;
    }
    if (response.status === 403) {
      canAddMaterial = false;
      renderResources();
      throw new Error("Bạn không có quyền xóa tài liệu. Chỉ admin mới được phép.");
    }
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || `Máy chủ trả về lỗi ${response.status}.`);
    }

    materialsByGrade[resource.grade] = materialsByGrade[resource.grade]
      .filter((item) => item.id !== resource.id);
    renderResources();
    materialPageMessage.textContent = `Đã xóa tài liệu "${resource.title}".`;
  } catch (error) {
    materialPageMessage.textContent = error.message;
    materialPageMessage.classList.add("is-error");
  } finally {
    deleteButton.disabled = false;
  }
}

materialForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!materialForm.reportValidity()) return;
  if (!canAddMaterial) {
    showMaterialFormMessage("Bạn không có quyền thêm tài liệu. Chỉ admin mới được phép.", true);
    return;
  }

  const submitButton = materialForm.querySelector("[type='submit']");
  const formFields = Object.fromEntries(new FormData(materialForm).entries());
  const file = formFields.file;
  delete formFields.file;
  formFields.grade = Number(formFields.grade);
  formFields.pages = Number(formFields.pages);
  formFields.topics = String(formFields.topics || "")
    .split(/\r?\n/)
    .map((topic) => topic.trim())
    .filter(Boolean);
  const values = new FormData();
  values.append("payload", JSON.stringify(formFields));
  values.append("file", file);

  submitButton.disabled = true;
  try {
    const response = await fetch("/api/admin/materials", {
      method: "POST",
      credentials: "same-origin",
      body: values,
    });
    const data = await response.json();
    if (response.status === 401) {
      window.location.href = "tai_khoan.html";
      return;
    }
    if (response.status === 403) {
      canAddMaterial = false;
      throw new Error("Bạn không có quyền thêm tài liệu. Chỉ admin mới được phép.");
    }
    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg).join(" ")
        : data.detail;
      throw new Error(detail || `Máy chủ trả về lỗi ${response.status}.`);
    }

    materialsByGrade[data.grade].unshift(data);
    loadError = null;
    searchTerm = "";
    searchInput.value = "";
    selectGrade(String(data.grade));
    selectSubject(data.subject);
    selectType(data.type);
    materialForm.reset();
    materialDialog.close();
    materialPageMessage.textContent = `Đã thêm tài liệu "${data.title}".`;
  } catch (error) {
    showMaterialFormMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

function selectGrade(grade) {
  if (!Object.hasOwn(materialsByGrade, grade)) return;
  selectedGrade = grade;
  gradeButtons.forEach((button) => {
    const isSelected = button.dataset.grade === grade;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  renderResources();
}

function selectSubject(subject) {
  if (subject !== "all" && !subjectNames.includes(subject)) return;
  selectedSubject = subject;
  subjectButtons.forEach((button) => {
    const isSelected = button.dataset.subject === subject;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  renderResources();
}

function selectType(type) {
  if (type !== "all" && !["PDF", "DOC", "DOCX", "Bài tập"].includes(type)) return;
  selectedType = type;
  typeButtons.forEach((button) => {
    const isSelected = button.dataset.type === type;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  renderResources();
}

gradeButtons.forEach((button) => {
  button.addEventListener("click", () => selectGrade(button.dataset.grade));
});

subjectButtons.forEach((button) => {
  button.addEventListener("click", () => selectSubject(button.dataset.subject));
});

typeButtons.forEach((button) => {
  button.addEventListener("click", () => selectType(button.dataset.type));
});

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value;
  renderResources();
});

const initialParams = new URLSearchParams(window.location.search);
const initialGrade = initialParams.get("grade");
const initialSubject = initialParams.get("subject");
const initialType = initialParams.get("type");
searchTerm = initialParams.get("q") || "";
searchInput.value = searchTerm;

if (initialGrade && Object.hasOwn(materialsByGrade, initialGrade)) {
  selectGrade(initialGrade);
}
if (initialSubject) selectSubject(initialSubject);
if (initialType) selectType(initialType);
renderResources();
loadResources();
checkAdminAccess();
