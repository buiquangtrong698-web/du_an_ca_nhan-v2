const subjects = ["Toán", "Vật Lý", "Hóa Học", "Tiếng Anh", "Ngữ Văn", "Sinh Học"];
const subjectColors = { "Toán": "#5c69aa", "Vật Lý": "#5e78c7", "Hóa Học": "#b65d81", "Tiếng Anh": "#b7823e", "Ngữ Văn": "#9a6d53", "Sinh Học": "#4d9b71" };

const seedPosts = [];

let selectedGrade = "12";
let selectedScope = "class";
let selectedSubject = "";
let searchTerm = "";
let sortMode = "latest";

const storageKey = "hocCungVuiForumPosts";
const resetKey = "hocCungVuiForumResetV1";
if (!localStorage.getItem(resetKey)) {
  localStorage.removeItem(storageKey);
  localStorage.setItem(resetKey, "true");
}
let savedPosts = [];
try { savedPosts = JSON.parse(localStorage.getItem(storageKey)) || []; } catch { savedPosts = []; }
const posts = [...seedPosts, ...savedPosts];

const postList = document.querySelector("#forum-post-list");
const forumTitle = document.querySelector("#forum-title");
const forumDescription = document.querySelector("#forum-description");
const sideTitle = document.querySelector("#side-title");
const sideDescription = document.querySelector("#side-description");
const postCount = document.querySelector("#post-count");
const composeLocation = document.querySelector("#compose-location");
const composeDialog = document.querySelector("#compose-dialog");

function visiblePosts() {
  const filtered = posts.filter((post) => {
    const inSpace = post.grade === selectedGrade &&
      ((selectedScope === "class" && post.scope === "class") ||
       (selectedScope === "subject" && post.scope === "subject" && post.subject === selectedSubject));
    const text = `${post.title} ${post.content} ${post.author}`.toLocaleLowerCase("vi");
    return inSpace && text.includes(searchTerm);
  });
  if (sortMode === "popular") filtered.sort((a, b) => b.likes - a.likes);
  if (sortMode === "comment") filtered.sort((a, b) => b.comments - a.comments);
  return filtered;
}

function render() {
  const label = selectedScope === "class" ? `Diễn đàn Lớp ${selectedGrade}` : `${selectedSubject} · Lớp ${selectedGrade}`;
  forumTitle.textContent = label;
  sideTitle.textContent = label;
  forumDescription.textContent = selectedScope === "class"
    ? "Trao đổi chung, chia sẻ kinh nghiệm và hỗ trợ nhau trong học tập."
    : `Không gian thảo luận riêng dành cho môn ${selectedSubject}.`;
  sideDescription.textContent = selectedScope === "class" ? "Không gian trao đổi chung" : `Diễn đàn môn ${selectedSubject}`;
  composeLocation.textContent = label;

  document.querySelectorAll("[data-grade]").forEach((button) => {
    const selected = button.dataset.grade === selectedGrade;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelectorAll("[data-space]").forEach((button) => {
    const selected = selectedScope === "class"
      ? button.dataset.space === "class"
      : button.dataset.space === "subject" && button.dataset.subject === selectedSubject;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  const filtered = visiblePosts();
  postCount.textContent = String(filtered.length);
  if (!filtered.length) {
    postList.innerHTML = `<p class="forum-empty">Chưa có bài viết nào trong không gian này. Hãy là người bắt đầu thảo luận!</p>`;
    return;
  }
  postList.replaceChildren(...filtered.map(createPost));
}

function createPost(post) {
  const article = document.createElement("article");
  article.className = "forum-post";
  const badgeText = post.scope === "class" ? "LỚP" : post.subject;
  article.innerHTML = `
    <div class="forum-post-head">
      <span class="forum-avatar"></span>
      <div class="forum-author"><strong></strong><span></span></div>
      <span class="forum-badge"></span>
    </div>
    <h2></h2><p class="forum-post-text"></p>
    <div class="forum-post-actions">
      <button type="button" class="forum-action" data-like="${post.id}">♡ <span>${post.likes}</span> thích</button>
      <button type="button" class="forum-action" data-comment="${post.id}">💬 ${post.comments} bình luận</button>
    </div>`;
  article.querySelector(".forum-avatar").textContent = post.avatar;
  article.querySelector(".forum-author strong").textContent = post.author;
  article.querySelector(".forum-author span").textContent = post.time;
  article.querySelector(".forum-badge").textContent = badgeText;
  article.querySelector("h2").textContent = post.title;
  article.querySelector(".forum-post-text").textContent = post.content;
  return article;
}

document.querySelectorAll("[data-grade]").forEach((button) => button.addEventListener("click", () => {
  selectedGrade = button.dataset.grade;
  const url = new URL(window.location.href);
  url.searchParams.set("grade", selectedGrade);
  window.history.replaceState(null, "", url);
  render();
}));

document.querySelectorAll("[data-space]").forEach((button) => button.addEventListener("click", () => {
  selectedScope = button.dataset.space;
  selectedSubject = selectedScope === "subject" ? button.dataset.subject : "";
  const url = new URL(window.location.href);
  url.searchParams.set("scope", selectedScope);
  if (selectedSubject) url.searchParams.set("subject", selectedSubject);
  else url.searchParams.delete("subject");
  window.history.replaceState(null, "", url);
  render();
}));

document.querySelector("#forum-search").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLocaleLowerCase("vi");
  render();
});
document.querySelector("#forum-sort").addEventListener("change", (event) => {
  sortMode = event.target.value;
  render();
});

postList.addEventListener("click", (event) => {
  const likeButton = event.target.closest("[data-like]");
  if (!likeButton) return;
  const post = posts.find((item) => item.id === likeButton.dataset.like);
  if (!post) return;
  post.likes += likeButton.classList.toggle("is-liked") ? 1 : -1;
  likeButton.querySelector("span").textContent = post.likes;
});

const openCompose = document.querySelector("#open-compose");
openCompose.addEventListener("click", () => composeDialog.showModal());
document.querySelector("#close-compose").addEventListener("click", () => composeDialog.close());
document.querySelector("#cancel-compose").addEventListener("click", () => composeDialog.close());

document.querySelector("#compose-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = document.querySelector("#post-title").value.trim();
  const content = document.querySelector("#post-content").value.trim();
  if (!title || !content) return;
  const post = {
    id: `custom-${Date.now()}`, grade: selectedGrade, scope: selectedScope,
    subject: selectedSubject, title, content, author: "Trần Minh Anh",
    avatar: "MA", time: "Vừa xong", likes: 0, comments: 0
  };
  posts.unshift(post);
  const customPosts = JSON.parse(localStorage.getItem(storageKey) || "[]");
  customPosts.unshift(post);
  localStorage.setItem(storageKey, JSON.stringify(customPosts));
  event.target.reset();
  composeDialog.close();
  render();
});

const params = new URLSearchParams(window.location.search);
const initialGrade = params.get("grade");
const initialScope = params.get("scope");
const initialSubject = params.get("subject");
if (["10", "11", "12"].includes(initialGrade)) selectedGrade = initialGrade;
if (initialScope === "subject" && subjects.includes(initialSubject)) {
  selectedScope = "subject";
  selectedSubject = initialSubject;
}
render();
