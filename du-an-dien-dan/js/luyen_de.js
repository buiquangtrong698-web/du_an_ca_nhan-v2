const examsByGrade = {
  10: [],
  11: [],
  12: [],
};

const gradeButtons = [...document.querySelectorAll("[data-grade]")];
const subjectButtons = [...document.querySelectorAll("[data-subject]")];
const practiceList = document.querySelector("#practice-list");
const resultsTitle = document.querySelector("#results-title");
const practiceCount = document.querySelector("#practice-count");
const searchInput = document.querySelector("#practice-search");
const emptyState = document.querySelector("#empty-state");
const subjectNames = subjectButtons
  .map((button) => button.dataset.subject)
  .filter((subject) => subject !== "all");
const subjectVisuals = {
  "Toán": { icon: "∑", variant: "math" },
  "Vật Lý": { icon: "✳", variant: "physics" },
  "Hóa Học": { icon: "⚗", variant: "chemistry" },
  "Tiếng Anh": { icon: "A", variant: "english" },
  "Ngữ Văn": { icon: "✎", variant: "literature" },
  "Sinh Học": { icon: "❋", variant: "biology" },
};
const addExamButton = document.querySelector("#add-exam-button");
const examDialog = document.querySelector("#exam-dialog");
const examForm = document.querySelector("#exam-form");
const examFormMessage = document.querySelector("#exam-form-message");
const examPageMessage = document.querySelector("#exam-page-message");

let selectedGrade = "10";
let selectedSubject = "all";
let searchTerm = "";
let loadError = null;
let canAddExam = false;

function createExamCard(exam, grade) {
  const card = document.createElement("article");
  card.className = "practice-card";

  const head = document.createElement("div");
  head.className = "practice-card-head";

  const icon = document.createElement("span");
  icon.className = `practice-subject-icon subject-${exam.variant}`;
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = exam.icon;

  const category = document.createElement("div");
  const subject = document.createElement("div");
  subject.className = "practice-card-subject";
  subject.textContent = `${exam.subject} · Lớp ${grade}`;
  const level = document.createElement("div");
  level.className = "practice-card-level";
  level.textContent = exam.level;
  category.append(subject, level);
  head.append(icon, category);

  const title = document.createElement("h3");
  title.textContent = exam.title;
  const description = document.createElement("p");
  description.className = "practice-card-description";
  description.textContent = exam.description;

  const meta = document.createElement("div");
  meta.className = "practice-meta";
  if (exam.file_key && exam.file_name) {
    const fileLink = document.createElement("a");
    fileLink.className = "catalog-file-download";
    fileLink.href = `/api/catalog/files/${encodeURIComponent(exam.file_key)}`;
    fileLink.textContent = `Tải đề: ${exam.file_name}`;
    meta.append(fileLink);
  }

  const outline = document.createElement("details");
  outline.className = "practice-outline";
  const summary = document.createElement("summary");
  const fileExtension = exam.file_name?.split(".").pop()?.toUpperCase();
  const hasPreviewableFile = exam.file_key
    && ["PDF", "DOC", "DOCX"].includes(fileExtension);
  summary.textContent = hasPreviewableFile ? "Chủ đề ôn tập" : "Xem nội dung ôn tập";
  outline.append(summary);
  let fileOpenButton = null;
  let fileOpenMessage = null;
  if (hasPreviewableFile) {
    fileOpenButton = document.createElement("button");
    fileOpenButton.className = "catalog-file-open-button";
    fileOpenButton.type = "button";
    fileOpenButton.textContent = "Xem nội dung đề";
    fileOpenMessage = document.createElement("p");
    fileOpenMessage.className = "resource-preview-note is-error";
    fileOpenMessage.hidden = true;
    fileOpenButton.addEventListener("click", () => {
      if (fileExtension === "PDF") {
        const filePreviewUrl = `/api/catalog/files/${encodeURIComponent(exam.file_key)}?inline=true`;
        window.openCatalogPdfViewer(exam.title, exam.file_name, filePreviewUrl);
        return;
      }
      window.openCatalogWordPreview(
        { ...exam, type: fileExtension },
        fileOpenButton,
        fileOpenMessage,
      );
    });
  }
  const topics = document.createElement("ul");
  exam.topics.forEach((topic) => {
    const item = document.createElement("li");
    item.textContent = topic;
    topics.append(item);
  });
  outline.append(topics);

  card.append(head, title, description, meta);
  if (fileOpenButton) card.append(fileOpenButton, fileOpenMessage);
  card.append(outline);
  if (canAddExam) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "catalog-delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Xóa";
    deleteButton.setAttribute("aria-label", `Xóa đề luyện tập: ${exam.title}`);
    deleteButton.addEventListener("click", () => deleteExam(exam, deleteButton));
    card.append(deleteButton);
  }
  return card;
}

function updateAddressBar() {
  const url = new URL(window.location.href);
  url.searchParams.set("grade", selectedGrade);
  if (selectedSubject === "all") url.searchParams.delete("subject");
  else url.searchParams.set("subject", selectedSubject);
  window.history.replaceState(null, "", url);

  document.querySelectorAll("[data-course-page-link]").forEach((link) => {
    const courseUrl = new URL("khoa_hoc.html", window.location.href);
    courseUrl.searchParams.set("grade", selectedGrade);
    if (selectedSubject !== "all") courseUrl.searchParams.set("subject", selectedSubject);
    link.href = `khoa_hoc.html${courseUrl.search}`;
  });
  document.querySelectorAll("[data-resource-page-link]").forEach((link) => {
    const resourceUrl = new URL("tai_lieu.html", window.location.href);
    resourceUrl.searchParams.set("grade", selectedGrade);
    if (selectedSubject !== "all") resourceUrl.searchParams.set("subject", selectedSubject);
    link.href = `tai_lieu.html${resourceUrl.search}`;
  });
}

function renderExams() {
  const query = searchTerm.trim().toLocaleLowerCase("vi");
  const filteredExams = examsByGrade[selectedGrade].filter((exam) => {
    const matchesSubject = selectedSubject === "all" || exam.subject === selectedSubject;
    const searchableText = `${exam.subject} ${exam.title} ${exam.description}`.toLocaleLowerCase("vi");
    return matchesSubject && searchableText.includes(query);
  });

  const fragment = document.createDocumentFragment();
  filteredExams.forEach((exam) => fragment.append(createExamCard(exam, selectedGrade)));
  practiceList.replaceChildren(fragment);
  resultsTitle.textContent = selectedSubject === "all"
    ? `Đề luyện tập lớp ${selectedGrade}`
    : `${selectedSubject} · Lớp ${selectedGrade}`;
  practiceCount.textContent = loadError ? "Không tải được dữ liệu" : `${filteredExams.length} đề luyện tập`;
  emptyState.textContent = loadError || "Chưa tìm thấy đề phù hợp. Hãy thử chọn môn hoặc từ khóa khác.";
  emptyState.hidden = filteredExams.length > 0 && !loadError;
  updateAddressBar();
}

async function loadExams() {
  try {
    const response = await fetch("/api/catalog/exams", { credentials: "same-origin" });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = "tai_khoan.html";
        return;
      }
      throw new Error(data.detail || `Máy chủ trả về lỗi ${response.status}.`);
    }
    data.forEach((exam) => {
      examsByGrade[exam.grade].push({ ...exam, ...subjectVisuals[exam.subject] });
    });
    renderExams();
  } catch (error) {
    loadError = `Không thể tải danh sách đề luyện tập: ${error.message}`;
    renderExams();
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
    canAddExam = user.role === "admin";
    renderExams();
  } catch (error) {
    showExamFormMessage(`Không thể kiểm tra quyền thêm đề: ${error.message}`, true);
  } finally {
    addExamButton.disabled = false;
  }
}

function showExamFormMessage(message, isError = false) {
  examFormMessage.textContent = message;
  examFormMessage.classList.toggle("is-error", isError);
}

addExamButton.disabled = true;
addExamButton.addEventListener("click", () => {
  showExamFormMessage("");
  examPageMessage.textContent = "";
  examDialog.showModal();
  examForm.querySelector("[name='title']").focus();
});

function closeExamDialog() {
  examForm.reset();
  examDialog.close();
  showExamFormMessage("");
}

document.querySelector("#cancel-exam-button").addEventListener("click", closeExamDialog);
document.querySelector("#close-exam-dialog").addEventListener("click", closeExamDialog);

async function deleteExam(exam, deleteButton) {
  if (!canAddExam || !window.confirm(`Bạn có chắc muốn xóa đề luyện tập "${exam.title}"?`)) return;
  deleteButton.disabled = true;
  examPageMessage.classList.remove("is-error");

  try {
    const response = await fetch(`/api/admin/exams/${exam.id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "tai_khoan.html";
      return;
    }
    if (response.status === 403) {
      canAddExam = false;
      renderExams();
      throw new Error("Bạn không có quyền xóa đề luyện tập. Chỉ admin mới được phép.");
    }
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || `Máy chủ trả về lỗi ${response.status}.`);
    }

    examsByGrade[exam.grade] = examsByGrade[exam.grade]
      .filter((item) => item.id !== exam.id);
    renderExams();
    examPageMessage.textContent = `Đã xóa đề luyện tập "${exam.title}".`;
  } catch (error) {
    examPageMessage.textContent = error.message;
    examPageMessage.classList.add("is-error");
  } finally {
    deleteButton.disabled = false;
  }
}

examForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!examForm.reportValidity()) return;
  if (!canAddExam) {
    showExamFormMessage("Bạn không có quyền thêm đề luyện tập. Chỉ admin mới được phép.", true);
    return;
  }

  const submitButton = examForm.querySelector("[type='submit']");
  const formFields = Object.fromEntries(new FormData(examForm).entries());
  const file = formFields.file;
  delete formFields.file;
  formFields.grade = Number(formFields.grade);
  formFields.topics = String(formFields.topics || "")
    .split(/\r?\n/)
    .map((topic) => topic.trim())
    .filter(Boolean);
  const values = new FormData();
  values.append("payload", JSON.stringify(formFields));
  values.append("file", file);

  submitButton.disabled = true;
  try {
    const response = await fetch("/api/admin/exams", {
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
      canAddExam = false;
      throw new Error("Bạn không có quyền thêm đề luyện tập. Chỉ admin mới được phép.");
    }
    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg).join(" ")
        : data.detail;
      throw new Error(detail || `Máy chủ trả về lỗi ${response.status}.`);
    }

    examsByGrade[data.grade].unshift({ ...data, ...subjectVisuals[data.subject] });
    loadError = null;
    searchTerm = "";
    searchInput.value = "";
    selectGrade(String(data.grade));
    selectSubject(data.subject);
    examForm.reset();
    examDialog.close();
    examPageMessage.textContent = `Đã thêm đề "${data.title}".`;
  } catch (error) {
    showExamFormMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

function selectGrade(grade) {
  if (!Object.hasOwn(examsByGrade, grade)) return;
  selectedGrade = grade;
  gradeButtons.forEach((button) => {
    const isSelected = button.dataset.grade === grade;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  renderExams();
}

function selectSubject(subject) {
  if (subject !== "all" && !subjectNames.includes(subject)) return;
  selectedSubject = subject;
  subjectButtons.forEach((button) => {
    const isSelected = button.dataset.subject === subject;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  renderExams();
}

gradeButtons.forEach((button) => {
  button.addEventListener("click", () => selectGrade(button.dataset.grade));
});

subjectButtons.forEach((button) => {
  button.addEventListener("click", () => selectSubject(button.dataset.subject));
});

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value;
  renderExams();
});

const initialParams = new URLSearchParams(window.location.search);
const initialGrade = initialParams.get("grade");
const initialSubject = initialParams.get("subject");
if (initialGrade && Object.hasOwn(examsByGrade, initialGrade)) {
  selectGrade(initialGrade);
}
if (initialSubject) {
  selectSubject(initialSubject);
} else {
  renderExams();
}
loadExams();
checkAdminAccess();
