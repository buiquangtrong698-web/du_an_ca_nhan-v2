const coursesByGrade = {
  10: [],
  11: [],
  12: [],
};

const gradeButtons = [...document.querySelectorAll("[data-grade]")];
const subjectButtons = [...document.querySelectorAll("[data-subject]")];
const courseList = document.querySelector("#course-list");
const resultsTitle = document.querySelector("#results-title");
const courseCount = document.querySelector("#course-count");
const searchInput = document.querySelector("#course-search");
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
let selectedGrade = "10";
let selectedSubject = "all";
let searchTerm = "";
let loadError = null;
const addCourseButton = document.querySelector("#add-course-button");
const courseForm = document.querySelector("#course-form");
const courseDialog = document.querySelector("#course-dialog");
const courseFormMessage = document.querySelector("#course-form-message");
const coursePageMessage = document.querySelector("#course-page-message");
let canAddCourse = false;
addCourseButton.disabled = true;

function createCourseCard(course, grade) {
  const card = document.createElement("article");
  card.className = "catalog-course-card";

  const head = document.createElement("div");
  head.className = "catalog-course-head";

  const icon = document.createElement("span");
  icon.className = `catalog-course-icon subject-${course.variant}`;
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = course.icon;

  const category = document.createElement("div");
  const subject = document.createElement("div");
  subject.className = "catalog-course-category";
  subject.textContent = `${course.subject} · Lớp ${grade}`;
  const level = document.createElement("div");
  level.className = "catalog-course-level";
  level.textContent = course.level;
  category.append(subject, level);
  head.append(icon, category);

  const title = document.createElement("h3");
  title.textContent = course.title;
  const description = document.createElement("p");
  description.className = "catalog-course-description";
  description.textContent = course.description;

  const meta = document.createElement("div");
  meta.className = "catalog-course-meta";
  const lessons = document.createElement("span");
  lessons.textContent = `${course.lessons} bài giảng`;
  meta.append(lessons);

  const outline = document.createElement("details");
  outline.className = "course-outline";
  const summary = document.createElement("summary");
  summary.textContent = "Nội dung khóa học";
  const topicList = document.createElement("ul");
  course.topics.forEach((topic) => {
    const item = document.createElement("li");
    item.textContent = topic;
    topicList.append(item);
  });
  outline.append(summary, topicList);

  card.append(head, title, description, meta, outline);
  if (canAddCourse) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "catalog-delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Xóa";
    deleteButton.setAttribute("aria-label", `Xóa khóa học: ${course.title}`);
    deleteButton.addEventListener("click", () => deleteCourse(course, deleteButton));
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
  document.querySelectorAll("[data-practice-page-link]").forEach((link) => {
    const practiceUrl = new URL("luyen_de.html", window.location.href);
    practiceUrl.searchParams.set("grade", selectedGrade);
    if (selectedSubject !== "all") practiceUrl.searchParams.set("subject", selectedSubject);
    link.href = `luyen_de.html${practiceUrl.search}`;
  });
  document.querySelectorAll("[data-resource-page-link]").forEach((link) => {
    const resourceUrl = new URL("tai_lieu.html", window.location.href);
    resourceUrl.searchParams.set("grade", selectedGrade);
    if (selectedSubject !== "all") resourceUrl.searchParams.set("subject", selectedSubject);
    link.href = `tai_lieu.html${resourceUrl.search}`;
  });
}

function renderCourses() {
  const availableCourses = coursesByGrade[selectedGrade];
  const query = searchTerm.trim().toLocaleLowerCase("vi");
  const filteredCourses = availableCourses.filter((course) => {
    const matchesSubject = selectedSubject === "all" || course.subject === selectedSubject;
    const searchableText = `${course.subject} ${course.title} ${course.description}`.toLocaleLowerCase("vi");
    return matchesSubject && searchableText.includes(query);
  });

  const fragment = document.createDocumentFragment();
  filteredCourses.forEach((course) => fragment.append(createCourseCard(course, selectedGrade)));
  courseList.replaceChildren(fragment);
  resultsTitle.textContent = selectedSubject === "all"
    ? `Khóa học lớp ${selectedGrade}`
    : `${selectedSubject} · Lớp ${selectedGrade}`;
  courseCount.textContent = loadError ? "Không tải được dữ liệu" : `${filteredCourses.length} khóa học`;
  emptyState.textContent = loadError || "Chưa tìm thấy khóa học phù hợp. Hãy thử chọn môn học hoặc từ khóa khác.";
  emptyState.hidden = filteredCourses.length > 0 && !loadError;
  updateAddressBar();
}

async function loadCourses() {
  try {
    const response = await fetch("/api/catalog/courses", { credentials: "same-origin" });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = "tai_khoan.html";
        return;
      }
      throw new Error(data.detail || `Máy chủ trả về lỗi ${response.status}.`);
    }
    data.forEach((course) => {
      coursesByGrade[course.grade].push({ ...course, ...subjectVisuals[course.subject] });
    });
    renderCourses();
  } catch (error) {
    loadError = `Không thể tải danh sách khóa học: ${error.message}`;
    renderCourses();
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
    canAddCourse = user.role === "admin";
    renderCourses();
  } catch (error) {
    courseFormMessage.textContent = `Không thể kiểm tra quyền thêm khóa học: ${error.message}`;
    courseFormMessage.classList.add("is-error");
  } finally {
    addCourseButton.disabled = false;
  }
}

function showCourseFormMessage(message, isError = false) {
  courseFormMessage.textContent = message;
  courseFormMessage.classList.toggle("is-error", isError);
}

addCourseButton.addEventListener("click", () => {
  showCourseFormMessage("");
  coursePageMessage.textContent = "";
  courseDialog.showModal();
  courseForm.querySelector("[name='title']").focus();
});

function closeCourseDialog() {
  courseForm.reset();
  courseDialog.close();
  showCourseFormMessage("");
}

document.querySelector("#cancel-course-button").addEventListener("click", closeCourseDialog);
document.querySelector("#close-course-dialog").addEventListener("click", closeCourseDialog);

async function deleteCourse(course, deleteButton) {
  if (!canAddCourse || !window.confirm(`Bạn có chắc muốn xóa khóa học "${course.title}"?`)) return;
  deleteButton.disabled = true;
  coursePageMessage.classList.remove("is-error");

  try {
    const response = await fetch(`/api/admin/courses/${course.id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "tai_khoan.html";
      return;
    }
    if (response.status === 403) {
      canAddCourse = false;
      renderCourses();
      throw new Error("Bạn không có quyền xóa khóa học. Chỉ admin mới được phép.");
    }
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || `Máy chủ trả về lỗi ${response.status}.`);
    }

    coursesByGrade[course.grade] = coursesByGrade[course.grade]
      .filter((item) => item.id !== course.id);
    renderCourses();
    coursePageMessage.textContent = `Đã xóa khóa học "${course.title}".`;
  } catch (error) {
    coursePageMessage.textContent = error.message;
    coursePageMessage.classList.add("is-error");
  } finally {
    deleteButton.disabled = false;
  }
}

courseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!courseForm.reportValidity()) return;
  if (!canAddCourse) {
    showCourseFormMessage("Bạn không có quyền thêm khóa học. Chỉ admin mới được phép.", true);
    return;
  }

  const submitButton = courseForm.querySelector("[type='submit']");
  const values = Object.fromEntries(new FormData(courseForm).entries());
  values.grade = Number(values.grade);
  values.lessons = Number(values.lessons);
  values.topics = String(values.topics || "")
    .split(/\r?\n/)
    .map((topic) => topic.trim())
    .filter(Boolean);

  submitButton.disabled = true;
  try {
    const response = await fetch("/api/admin/courses", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json();
    if (response.status === 401) {
      window.location.href = "tai_khoan.html";
      return;
    }
    if (response.status === 403) {
      canAddCourse = false;
      throw new Error("Bạn không có quyền thêm khóa học. Chỉ admin mới được phép.");
    }
    if (!response.ok) {
      const detail = Array.isArray(data.detail)
        ? data.detail.map((item) => item.msg).join(" ")
        : data.detail;
      throw new Error(detail || `Máy chủ trả về lỗi ${response.status}.`);
    }

    const course = { ...data, ...subjectVisuals[data.subject] };
    coursesByGrade[data.grade].unshift(course);
    loadError = null;
    searchTerm = "";
    searchInput.value = "";
    selectGrade(String(data.grade));
    selectSubject(data.subject);
    courseForm.reset();
    courseDialog.close();
    coursePageMessage.textContent = `Đã thêm khóa học "${data.title}".`;
  } catch (error) {
    showCourseFormMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

function selectGrade(grade) {
  if (!Object.hasOwn(coursesByGrade, grade)) return;
  selectedGrade = grade;
  gradeButtons.forEach((button) => {
    const isSelected = button.dataset.grade === grade;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  renderCourses();
}

function selectSubject(subject) {
  if (subject !== "all" && !subjectNames.includes(subject)) return;
  selectedSubject = subject;
  subjectButtons.forEach((button) => {
    const isSelected = button.dataset.subject === subject;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  renderCourses();
}

gradeButtons.forEach((button) => {
  button.addEventListener("click", () => selectGrade(button.dataset.grade));
});

subjectButtons.forEach((button) => {
  button.addEventListener("click", () => selectSubject(button.dataset.subject));
});

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value;
  renderCourses();
});

const initialParams = new URLSearchParams(window.location.search);
const initialGrade = initialParams.get("grade");
const initialSubject = initialParams.get("subject");
if (initialGrade && Object.hasOwn(coursesByGrade, initialGrade)) {
  selectGrade(initialGrade);
}
if (initialSubject) {
  selectSubject(initialSubject);
} else {
  renderCourses();
}
loadCourses();
checkAdminAccess();
