const authMessage = document.querySelector("#auth-message");
const currentAccount = document.querySelector("#current-account");

function showMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("is-error", isError);
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("Không kết nối được máy chủ. Hãy khởi động FastAPI rồi thử lại.");
  }
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const detail = Array.isArray(data?.detail)
      ? data.detail.map((item) => item.msg).join(" ")
      : data?.detail;
    throw new Error(detail || "Yêu cầu không thành công.");
  }
  return data;
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function containsOnlyAscii(value) {
  return /^[\x00-\x7F]*$/.test(value);
}

const loginForm = document.querySelector("#login-form");
if (loginForm) {
  const searchParams = new URLSearchParams(window.location.search);
  const registeredUsername = searchParams.get("username");
  if (registeredUsername) {
    loginForm.elements.username.value = registeredUsername;
  }
  if (searchParams.get("registered") === "1") {
    showMessage("Đăng ký thành công. Hãy đăng nhập bằng tên tài khoản và mật khẩu vừa tạo.");
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(form);
    if (!containsOnlyAscii(values.username) || !containsOnlyAscii(values.password)) {
      showMessage("Tên tài khoản và mật khẩu chỉ được dùng ký tự không dấu.", true);
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      await request("/api/auth/login", { method: "POST", body: JSON.stringify(values) });
      showMessage("Đăng nhập thành công. Đang chuyển về trang chủ...");
      window.setTimeout(() => { window.location.href = "index.html"; }, 500);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });
}

const registerForm = document.querySelector("#register-form");
if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(form);
    if (!containsOnlyAscii(values.username) || !containsOnlyAscii(values.password)) {
      showMessage("Tên tài khoản và mật khẩu chỉ được dùng ký tự không dấu.", true);
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const user = await request("/api/auth/register", { method: "POST", body: JSON.stringify(values) });
      window.location.href = `tai_khoan.html?registered=1&username=${encodeURIComponent(user.username)}`;
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });
}

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await request("/api/auth/logout", { method: "POST" });
    if (currentAccount) currentAccount.hidden = true;
    showMessage("Đã đăng xuất.");
  } catch (error) {
    showMessage(error.message, true);
  }
});

async function loadCurrentAccount() {
  try {
    const user = await request("/api/auth/me", { method: "GET", headers: {} });
    document.querySelector("#current-name").textContent = user.display_name;
    document.querySelector("#current-role").textContent = `Vai trò: ${user.role}`;
    currentAccount.hidden = false;
  } catch (error) {
    if (error.message !== "Vui lòng đăng nhập." && error.message !== "Phiên đăng nhập không hợp lệ.") {
      showMessage(error.message, true);
    }
  }
}

loadCurrentAccount();
