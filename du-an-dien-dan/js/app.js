const gradeContent = {
  10: {
    subjects: [
      { name: "Toán", icon: "∑", variant: "math", updates: "10 bài mới" },
      { name: "Vật Lý", icon: "✳", variant: "physics", updates: "8 bài mới" },
      { name: "Hóa Học", icon: "⚗", variant: "chemistry", updates: "7 bài mới" },
      { name: "Tiếng Anh", icon: "A", variant: "english", updates: "9 bài mới" },
      { name: "Ngữ Văn", icon: "✎", variant: "literature", updates: "6 bài mới" },
      { name: "Sinh Học", icon: "❋", variant: "biology", updates: "5 bài mới" },
    ],
    courses: [],
    exams: [],
    resources: [],
  },
  11: {
    subjects: [
      { name: "Toán", icon: "∑", variant: "math", updates: "11 bài mới" },
      { name: "Vật Lý", icon: "✳", variant: "physics", updates: "9 bài mới" },
      { name: "Hóa Học", icon: "⚗", variant: "chemistry", updates: "8 bài mới" },
      { name: "Tiếng Anh", icon: "A", variant: "english", updates: "7 bài mới" },
      { name: "Ngữ Văn", icon: "✎", variant: "literature", updates: "8 bài mới" },
      { name: "Sinh Học", icon: "❋", variant: "biology", updates: "6 bài mới" },
    ],
    courses: [],
    exams: [],
    resources: [],
  },
  12: {
    subjects: [
      { name: "Toán", icon: "∑", variant: "math", updates: "12 bài mới" },
      { name: "Vật Lý", icon: "✳", variant: "physics", updates: "8 bài mới" },
      { name: "Hóa Học", icon: "⚗", variant: "chemistry", updates: "10 bài mới" },
      { name: "Tiếng Anh", icon: "A", variant: "english", updates: "6 bài mới" },
      { name: "Ngữ Văn", icon: "✎", variant: "literature", updates: "9 bài mới" },
      { name: "Sinh Học", icon: "❋", variant: "biology", updates: "5 bài mới" },
    ],
    courses: [],
    exams: [],
    resources: [],
  },
};

const gradeButtons = document.querySelectorAll(".grade-filter [data-grade]");
const gradeStatus = document.querySelector(".grade-current");
const subjectTitle = document.querySelector("#subjects-title");
const subjectGrid = document.querySelector("#subject-grid");
const courseTitle = document.querySelector("#course-catalog-title");
const courseList = document.querySelector("#course-catalog-list");
const examTitle = document.querySelector("#exam-title");
const examList = document.querySelector("#exam-list");
const resourcesTitle = document.querySelector("#resources-title");
const resourceList = document.querySelector("#resource-list");

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderSubjects(subjects, grade) {
  const fragment = document.createDocumentFragment();

  subjects.forEach((subject) => {
    const card = createElement("a", `subject-card subject-${subject.variant}`);
    card.href = `khoa_hoc.html?grade=${grade}&subject=${encodeURIComponent(subject.name)}`;
    card.append(
      createElement("span", "subject-icon", subject.icon),
      createElement("span", "subject-name", subject.name),
      createElement("span", "subject-meta", subject.updates),
      createElement("span", "subject-arrow", "↗"),
    );
    card.querySelector(".subject-icon").setAttribute("aria-hidden", "true");
    card.querySelector(".subject-arrow").setAttribute("aria-hidden", "true");
    fragment.append(card);
  });

  subjectGrid.replaceChildren(fragment);
}

function renderExams(exams, grade) {
  const fragment = document.createDocumentFragment();

  exams.forEach((exam) => {
    const row = createElement("article", "exam-row");
    const badge = createElement("span", `exam-subject-badge badge-${exam.variant}`, exam.badge);
    const info = createElement("div", "exam-info");
    const details = createElement("span");
    const durationSeparator = createElement("i", null, "·");
    const action = createElement("a", "button button-soft", "Thi thử");
    const arrow = createElement("span", null, "→");

    badge.setAttribute("aria-hidden", "true");
    info.append(createElement("strong", null, exam.title));
    details.append(
      document.createTextNode(`${exam.questions} câu `),
      durationSeparator,
      document.createTextNode(` ${exam.duration} phút`),
    );
    info.append(details);
    const subjectByVariant = {
      math: "Toán",
      physics: "Vật Lý",
      chemistry: "Hóa Học",
      english: "Tiếng Anh",
    };
    action.href = `luyen_de.html?grade=${grade}&subject=${encodeURIComponent(subjectByVariant[exam.variant])}`;
    arrow.setAttribute("aria-hidden", "true");
    action.append(arrow);
    row.append(badge, info, action);
    fragment.append(row);
  });

  examList.replaceChildren(fragment);
}

function renderCourses(courses, grade) {
  const fragment = document.createDocumentFragment();

  courses.forEach((course) => {
    const card = createElement("article", "course-card");
    const head = createElement("div", "course-card-head");
    const icon = createElement("span", `course-card-icon subject-${course.variant}`, course.icon);
    const category = createElement("div");
    const footer = createElement("div", "course-card-footer");
    const practiceLink = createElement("a", "course-card-link", "Luyện đề →");

    icon.setAttribute("aria-hidden", "true");
    category.append(
      createElement("div", "course-card-category", `${course.subject} · LỚP ${grade}`),
      createElement("div", "course-card-level", course.level),
    );
    head.append(icon, category);
    footer.append(
      createElement("span", "course-card-lessons", `${course.lessons} bài giảng`),
      practiceLink,
    );
    practiceLink.href = `luyen_de.html?grade=${grade}&subject=${encodeURIComponent(course.subject)}`;
    card.append(
      head,
      createElement("h3", null, course.title),
      createElement("p", "course-card-description", course.description),
      footer,
    );
    fragment.append(card);
  });

  courseList.replaceChildren(fragment);
}

function renderResources(resources, grade) {
  const fragment = document.createDocumentFragment();

  resources.forEach((resource) => {
    const item = createElement("a", "resource-item");
    const icon = createElement("span", `resource-icon ${resource.variant}`, resource.icon);
    const content = createElement("span");
    const openLibrary = createElement("span", "resource-download", "→");

    item.href = `tai_lieu.html?grade=${grade}&q=${encodeURIComponent(resource.title)}`;
    icon.setAttribute("aria-hidden", "true");
    content.append(
      createElement("strong", null, resource.title),
      createElement("small", null, resource.details),
    );
    openLibrary.setAttribute("aria-hidden", "true");
    item.append(icon, content, openLibrary);
    fragment.append(item);
  });

  resourceList.replaceChildren(fragment);
}

function selectGrade(grade) {
  const content = gradeContent[grade];
  if (!content) throw new RangeError(`Không có dữ liệu cho lớp ${grade}.`);

  gradeButtons.forEach((button) => {
    const isSelected = button.dataset.grade === grade;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });

  gradeStatus.textContent = `ĐANG XEM LỚP ${grade}`;
  subjectTitle.textContent = `Môn học của bạn · Lớp ${grade}`;
  courseTitle.textContent = `Khám phá khóa học · Lớp ${grade}`;
  examTitle.textContent = `Đề thi thử nổi bật · Lớp ${grade}`;
  resourcesTitle.textContent = `Tài liệu mới · Lớp ${grade}`;
  document.querySelectorAll("[data-course-page-link]").forEach((link) => {
    link.href = `khoa_hoc.html?grade=${grade}`;
  });
  document.querySelectorAll("[data-practice-page-link]").forEach((link) => {
    link.href = `luyen_de.html?grade=${grade}`;
  });
  document.querySelectorAll("[data-resource-page-link]").forEach((link) => {
    link.href = `tai_lieu.html?grade=${grade}`;
  });
  renderSubjects(content.subjects, grade);
  renderCourses(content.courses, grade);
  renderExams(content.exams, grade);
  renderResources(content.resources, grade);
}

gradeButtons.forEach((button) => {
  button.addEventListener("click", () => selectGrade(button.dataset.grade));
});

document.querySelectorAll(".main-nav .nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    const activeLink = document.querySelector(".main-nav .is-active");
    if (activeLink) activeLink.classList.remove("is-active");
    link.classList.add("is-active");
  });
});

selectGrade("12");

const accountPanel = document.querySelector("#account-card");
const accountToggleButtons = document.querySelectorAll("[data-account-toggle]");
const accountCloseButton = document.querySelector(".account-close");
const accountLogoutButton = document.querySelector("#logout-button");
const profileName = document.querySelector("#profile-name");
const profileRole = document.querySelector("#profile-role");
const profileAvatar = document.querySelector("#profile-avatar");
const accountAvatar = document.querySelector("#account-avatar");
const accountName = document.querySelector("#account-name");
const accountStatus = document.querySelector("#account-status");
const accountUsername = document.querySelector("#account-username");
const accountRole = document.querySelector("#account-role");
const accountLink = document.querySelector("#account-link");
let lastAccountToggle = null;

function setAccountOpen(isOpen, restoreFocus = false) {
  accountPanel.hidden = !isOpen;
  accountToggleButtons.forEach((button) => {
    button.setAttribute("aria-expanded", String(isOpen));
  });
  if (!isOpen && restoreFocus && lastAccountToggle) lastAccountToggle.focus();
}

accountToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const shouldOpen = accountPanel.hidden;
    if (shouldOpen) lastAccountToggle = button;
    setAccountOpen(shouldOpen);
  });
});

accountCloseButton.addEventListener("click", () => setAccountOpen(false, true));

document.addEventListener("click", (event) => {
  const target = event.target;
  if (
    !accountPanel.hidden &&
    target instanceof Element &&
    !target.closest("#account-card") &&
    !target.closest("[data-account-toggle]")
  ) {
    setAccountOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !accountPanel.hidden) setAccountOpen(false, true);
});

function updateAccount(user, message = "Đăng nhập để sử dụng tài khoản của bạn.") {
  if (!user) {
    profileName.textContent = "Tài khoản";
    profileRole.textContent = "Chưa đăng nhập";
    profileAvatar.textContent = "HV";
    accountAvatar.textContent = "HV";
    accountName.textContent = "Chưa đăng nhập";
    accountStatus.textContent = message;
    accountUsername.textContent = "—";
    accountRole.textContent = "Khách";
    accountLink.textContent = "Đăng nhập / đăng ký →";
    accountLink.href = "tai_khoan.html";
    accountLogoutButton.hidden = true;
    return;
  }
  const initials = user.display_name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join("").toLocaleUpperCase("vi");
  profileName.textContent = user.display_name;
  profileRole.textContent = user.role;
  profileAvatar.textContent = initials;
  accountAvatar.textContent = initials;
  accountName.textContent = user.display_name;
  accountStatus.textContent = "Tài khoản Học Cùng Vui";
  accountUsername.textContent = user.username;
  accountRole.textContent = user.role;
  accountLink.textContent = "Thông tin tài khoản →";
  accountLink.href = "tai_khoan.html";
  accountLogoutButton.hidden = false;
}

async function loadAccount() {
  try {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (response.status === 401) {
      updateAccount(null);
      return;
    }
    if (!response.ok) throw new Error(`Máy chủ trả về lỗi ${response.status}.`);
    updateAccount(await response.json());
  } catch (error) {
    updateAccount(null, `Không thể tải tài khoản: ${error.message}`);
  }
}

accountLogoutButton.addEventListener("click", async () => {
  accountLogoutButton.disabled = true;
  try {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Máy chủ trả về lỗi ${response.status}.`);
    updateAccount(null, "Bạn đã đăng xuất.");
  } catch (error) {
    accountStatus.textContent = `Đăng xuất không thành công: ${error.message}`;
  } finally {
    accountLogoutButton.disabled = false;
  }
});

loadAccount();

const notificationPanel = document.querySelector("#notification-panel");
const notificationToggle = document.querySelector("[data-notifications-toggle]");
const notificationDot = document.querySelector(".notification-dot");
const notificationCount = document.querySelector("#notification-count");
const markAllReadButton = document.querySelector("[data-mark-all-read]");
const notificationItems = [...document.querySelectorAll("[data-notification]")];

function updateNotificationState() {
  const unreadCount = notificationItems.filter((item) => item.classList.contains("is-unread")).length;
  notificationDot.hidden = unreadCount === 0;
  notificationCount.textContent = unreadCount ? `${unreadCount} mới` : "Đã xem hết";
  markAllReadButton.disabled = unreadCount === 0;
  markAllReadButton.textContent = unreadCount ? "Đánh dấu đã đọc" : "Đã đọc hết";
}

function setNotificationsOpen(isOpen) {
  notificationPanel.hidden = !isOpen;
  notificationToggle.setAttribute("aria-expanded", String(isOpen));
}

notificationToggle.addEventListener("click", () => {
  setNotificationsOpen(notificationPanel.hidden);
});

markAllReadButton.addEventListener("click", () => {
  notificationItems.forEach((item) => item.classList.remove("is-unread"));
  updateNotificationState();
});

notificationItems.forEach((item) => {
  item.addEventListener("click", () => {
    item.classList.remove("is-unread");
    updateNotificationState();
    setNotificationsOpen(false);
  });
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (
    !notificationPanel.hidden &&
    target instanceof Element &&
    !target.closest("#notification-panel") &&
    !target.closest("[data-notifications-toggle]")
  ) {
    setNotificationsOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !notificationPanel.hidden) {
    setNotificationsOpen(false);
    notificationToggle.focus();
  }
});

updateNotificationState();
