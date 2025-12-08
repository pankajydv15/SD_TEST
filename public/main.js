// ===================== main.js =====================

// ===== General anti-copy / anti-inspect (kept as per Version B) =====
(function setupGlobalGuards() {
  ["copy", "cut", "paste"].forEach((evt) => {
    document.addEventListener(evt, (e) => e.preventDefault());
  });

  document.addEventListener("contextmenu", (e) => e.preventDefault());

  document.addEventListener("keydown", (e) => {
    if (e.key === "F12") e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      const blocked = ["c", "v", "x", "u", "s", "p"];
      if (blocked.includes(key)) e.preventDefault();
      if (e.shiftKey && key === "i") e.preventDefault();
    }
  });
})();

const PAGE = document.body.dataset.page;

function isEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase());
}

function showAlert(msg) {
  alert(msg);
}

// ================= LOGIN PAGE =================
if (PAGE === "login") {
  const loginForm = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const nameInput = document.getElementById("name");
  const emailError = document.getElementById("emailError");

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    emailError.textContent = "";

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();

    if (!name) return showAlert("Name is required.");
    if (!email) return (emailError.textContent = "Email is required.");
    if (!isEmailValid(email)) return (emailError.textContent = "Enter a valid email.");

    sessionStorage.setItem("examUserName", name);
    sessionStorage.setItem("examUserEmail", email);

    window.location.href = "/exam.html";
  });
}

// ================= EXAM PAGE =================
if (PAGE === "exam") {
  const userName = sessionStorage.getItem("examUserName");
  const userEmail = sessionStorage.getItem("examUserEmail");

  if (!userName || !userEmail) window.location.href = "/";

  const userInfoEl = document.getElementById("userInfo");
  const timerEl = document.getElementById("timer");
  const warningsEl = document.getElementById("warnings");
  const questionTextEl = document.getElementById("questionText");
  const optionsEl = document.getElementById("options");
  const questionProgressEl = document.getElementById("questionProgress");
  const examSectionEl = document.getElementById("examSection");
  const resultSectionEl = document.getElementById("resultSection");
  const resultTextEl = document.getElementById("resultText");
  const deviceBlockerEl = document.getElementById("deviceBlocker");

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const submitBtn = document.getElementById("submitBtn");

  const EXAM_DURATION_MINUTES = 60;
  const MAX_WARNINGS = 3;

  let warningCount = 0;
  let warningLastTimestamp = 0;
  let timerInterval = null;
  let remainingSeconds = EXAM_DURATION_MINUTES * 60;
  let questions = [];
  let answers = [];
  let currentIndex = 0;

  userInfoEl.textContent = `${userName} (${userEmail})`;

  // === Device check remains active ===
  function checkDevice() {
    const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const small = window.innerWidth < 700 || window.innerHeight < 500;

    if (mobile || small) {
      deviceBlockerEl.classList.remove("hidden");
      return false;
    }
    deviceBlockerEl.classList.add("hidden");
    return true;
  }

  // == Warning System remains ==
  function addWarning(reason) {
    const now = Date.now();
    if (now - warningLastTimestamp < 2000) return;
    warningLastTimestamp = now;

    warningCount++;
    warningsEl.textContent = `Warnings: ${warningCount}/${MAX_WARNINGS}`;
    showAlert(`Warning ${warningCount}/${MAX_WARNINGS}: ${reason}`);

    if (warningCount >= MAX_WARNINGS) finishExam("Exam ended due to violations.");
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) addWarning("Tab change detected.");
  });

  window.addEventListener("blur", () => {
    addWarning("Window lost focus.");
  });

  // Timer
  function formatTime(sec) {
    return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;
  }

  function startTimer() {
    timerEl.textContent = formatTime(remainingSeconds);
    timerInterval = setInterval(() => {
      remainingSeconds--;
      timerEl.textContent = formatTime(remainingSeconds);
      if (remainingSeconds <= 0) finishExam("Time over.");
    }, 1000);
  }

  // Render Question
  function renderQuestion(index) {
    const q = questions[index];
    questionTextEl.textContent = `${index+1}. ${q.question}`;
    optionsEl.innerHTML = "";

    const selected = answers[index]?.selectedOption;

    q.options.forEach((opt,i)=>{
      const letter = String.fromCharCode(65+i);

      const label=document.createElement("label");
      label.className="option-item";

      const input=document.createElement("input");
      input.type="radio"; input.name="option"; input.value=letter;
      input.checked=selected===letter;
      input.onchange=()=>answers[index]={questionId:q.id,selectedOption:letter};

      label.append(input,`${letter}. ${opt}`);
      optionsEl.append(label);
    });

    questionProgressEl.textContent=`Question ${index+1} of ${questions.length}`;
    prevBtn.disabled=index===0;
    nextBtn.disabled=index===questions.length-1;
  }

  // Finish Exam
  async function finishExam(reason="Submitted.") {
    clearInterval(timerInterval);

    try{
      const res=await fetch("/api/submit",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({userName,email:userEmail,answers:answers.filter(Boolean)})
      });

      const{correct,total,percentage}=await res.json();

      examSectionEl.classList.add("hidden");
      resultSectionEl.classList.remove("hidden");
      resultTextEl.textContent=`${reason}\nScore: ${correct}/${total} (${percentage}%)`;
    }
    catch{
      resultSectionEl.classList.remove("hidden");
      resultTextEl.textContent="Submission error. Contact admin.";
    }
    finally{
      sessionStorage.clear();
    }
  }

  // ===== Webcam Removed — exam starts without camera =====
  function startExamDirect() {
    document.getElementById("webcamStatus").textContent="Webcam not required.";
    examSectionEl.classList.remove("hidden");
    startTimer();
    renderQuestion(currentIndex);
  }

  prevBtn.onclick=()=>{ if(currentIndex>0) renderQuestion(--currentIndex); }
  nextBtn.onclick=()=>{ if(currentIndex<questions.length-1) renderQuestion(++currentIndex); }
  submitBtn.onclick=()=>confirm("Submit exam?")&&finishExam("You submitted the exam.");

  async function loadQuestions(){
    const res=await fetch("/api/questions");
    const data=await res.json();
    questions=data.questions||[];
    answers=new Array(questions.length).fill(null);
    if(!questions.length) showAlert("No questions configured.");
  }

  (async()=>{
    if(!checkDevice()) return addWarning("Invalid device.");
    await loadQuestions();
    if(!questions.length) return;
    startExamDirect(); // 🔥 without webcam
  })();

  window.onresize=checkDevice;
}

// ================= ADMIN PAGE (unchanged) =================
/* your entire admin section stays same */


// ===== ADMIN PAGE =====
if (PAGE === "admin") {
  const adminLoginSection = document.getElementById("adminLoginSection");
  const adminPanelSection = document.getElementById("adminPanelSection");
  const adminPasswordInput = document.getElementById("adminPassword");
  const adminLoginBtn = document.getElementById("adminLoginBtn");
  const adminLogoutBtn = document.getElementById("adminLogoutBtn");

  const questionForm = document.getElementById("questionForm");
  const resetFormBtn = document.getElementById("resetFormBtn");

  const questionIndexInput = document.getElementById("questionIndex");
  const questionIdInput = document.getElementById("questionId");
  const questionInput = document.getElementById("questionInput");
  const optAInput = document.getElementById("optA");
  const optBInput = document.getElementById("optB");
  const optCInput = document.getElementById("optC");
  const optDInput = document.getElementById("optD");
  const correctOptionInput = document.getElementById("correctOption");

  const questionsTableBody = document.querySelector("#questionsTable tbody");
  const resultsTableBody = document.querySelector("#resultsTable tbody");

  async function loginAdmin() {
    const password = adminPasswordInput.value;
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        throw new Error("Login failed");
      }
      const data = await res.json();
      if (data.success) {
        adminLoginSection.classList.add("hidden");
        adminPanelSection.classList.remove("hidden");
        await Promise.all([renderQuestionsTable(), renderResultsTable()]);
      }
    } catch (err) {
      console.error(err);
      showAlert("Invalid admin password.");
    }
  }

  adminLoginBtn.addEventListener("click", loginAdmin);

  adminLogoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
      });
    } catch (e) {
      // ignore errors on logout
    }
    adminPanelSection.classList.add("hidden");
    adminLoginSection.classList.remove("hidden");
  });

  async function loadQuestions() {
    const res = await fetch("/api/admin/questions");
    if (!res.ok) throw new Error("Failed to load questions");
    const data = await res.json();
    return data.questions || [];
  }

  async function loadResults() {
    const res = await fetch("/api/admin/results");
    if (!res.ok) throw new Error("Failed to load results");
    const data = await res.json();
    return data.results || [];
  }

  async function renderQuestionsTable() {
    try {
      const questions = await loadQuestions();
      questionsTableBody.innerHTML = "";

      questions.forEach((q, index) => {
        const tr = document.createElement("tr");

        const tdIndex = document.createElement("td");
        tdIndex.textContent = index + 1;

        const tdQuestion = document.createElement("td");
        tdQuestion.textContent = q.question;

        const tdCorrect = document.createElement("td");
        tdCorrect.textContent = q.correct;

        const tdActions = document.createElement("td");
        const editBtn = document.createElement("button");
        editBtn.textContent = "Edit";
        editBtn.className = "secondary-btn";
        editBtn.style.marginRight = "0.25rem";

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.className = "secondary-btn";

        editBtn.addEventListener("click", () => {
          fillFormForEdit(q, index);
        });

        deleteBtn.addEventListener("click", async () => {
          if (confirm("Delete this question?")) {
            await deleteQuestion(q.id);
            await renderQuestionsTable();
          }
        });

        tdActions.appendChild(editBtn);
        tdActions.appendChild(deleteBtn);

        tr.appendChild(tdIndex);
        tr.appendChild(tdQuestion);
        tr.appendChild(tdCorrect);
        tr.appendChild(tdActions);

        questionsTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      showAlert("Error loading questions.");
    }
  }

  async function renderResultsTable() {
    try {
      const results = await loadResults();
      resultsTableBody.innerHTML = "";

      results.forEach((r, index) => {
        const tr = document.createElement("tr");

        const tdIndex = document.createElement("td");
        tdIndex.textContent = index + 1;

        const tdName = document.createElement("td");
        tdName.textContent = r.userName;

        const tdEmail = document.createElement("td");
        tdEmail.textContent = r.email;

        const tdScore = document.createElement("td");
        tdScore.textContent = `${r.correct}/${r.total}`;

        const tdPercentage = document.createElement("td");
        tdPercentage.textContent = `${r.percentage}%`;

        const tdSubmittedAt = document.createElement("td");
        tdSubmittedAt.textContent = new Date(r.submittedAt).toLocaleString();

        tr.appendChild(tdIndex);
        tr.appendChild(tdName);
        tr.appendChild(tdEmail);
        tr.appendChild(tdScore);
        tr.appendChild(tdPercentage);
        tr.appendChild(tdSubmittedAt);

        resultsTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error(err);
      showAlert("Error loading results.");
    }
  }

  function clearForm() {
    questionIndexInput.value = "";
    questionIdInput.value = "";
    questionInput.value = "";
    optAInput.value = "";
    optBInput.value = "";
    optCInput.value = "";
    optDInput.value = "";
    correctOptionInput.value = "";
  }

  function fillFormForEdit(q, index) {
    questionIndexInput.value = index;
    questionIdInput.value = q.id;
    questionInput.value = q.question;
    optAInput.value = q.options[0] || "";
    optBInput.value = q.options[1] || "";
    optCInput.value = q.options[2] || "";
    optDInput.value = q.options[3] || "";
    correctOptionInput.value = q.correct || "";
  }

  async function saveQuestion(payload, id) {
    const url = id ? `/api/admin/questions/${id}` : "/api/admin/questions";
    const method = id ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error("Failed to save question");
    }
    return res.json();
  }

  async function deleteQuestion(id) {
    const res = await fetch(`/api/admin/questions/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      throw new Error("Failed to delete question");
    }
    return res.json();
  }

  questionForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const questionText = questionInput.value.trim();
    const optA = optAInput.value.trim();
    const optB = optBInput.value.trim();
    const optC = optCInput.value.trim();
    const optD = optDInput.value.trim();
    const correct = correctOptionInput.value.trim().toUpperCase();

    if (!questionText || !optA || !optB || !optC || !optD) {
      showAlert("Please fill in all question and option fields.");
      return;
    }

    if (!["A", "B", "C", "D"].includes(correct)) {
      showAlert("Correct option must be one of A, B, C, or D.");
      return;
    }

    const payload = {
      question: questionText,
      options: [optA, optB, optC, optD],
      correct,
    };

    try {
      const existingId = questionIdInput.value || null;
      await saveQuestion(payload, existingId);
      clearForm();
      await renderQuestionsTable();
    } catch (err) {
      console.error(err);
      showAlert("Error saving question.");
    }
  });

  resetFormBtn.addEventListener("click", () => {
    clearForm();
  });
}
