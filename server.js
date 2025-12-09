require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data");
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
const RESULTS_FILE = path.join(DATA_DIR, "results.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function ensureFile(filePath, initialData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
  }
}

ensureFile(QUESTIONS_FILE, [
  {
    id: 1,
    question: "Which HTML tag is used to include JavaScript code?",
    options: ["<script>", "<js>", "<javascript>", "<code>"],
    correct: "A",
  },
  {
    id: 2,
    question: "Which HTTP method is generally used to create a new resource?",
    options: ["GET", "POST", "PUT", "DELETE"],
    correct: "B",
  },
  {
    id: 3,
    question: "Which of the following is NOT a JavaScript data type?",
    options: ["Number", "String", "Float", "Boolean"],
    correct: "C",
  },
]);

ensureFile(RESULTS_FILE, []);

function readJson(filePath, defaultValue) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading JSON from ${filePath}`, err);
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

app.use((req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send("User-agent: *\nDisallow: /");
});

function requireAdmin(req, res, next) {
  if (req.cookies && req.cookies.admin === "true") {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized" });
}

// ========== API: Questions (random 50) ==========
app.get("/api/questions", (req, res) => {
  const questions = readJson(QUESTIONS_FILE, []);
  const shuffled = shuffleArray(questions);
  const count = Math.min(100, shuffled.length);
  const selected = shuffled.slice(0, count);

  const sanitized = selected.map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options,
  }));

  res.json({ questions: sanitized });
});

// ========== API: Submit Exam (store full details) ==========
app.post("/api/submit", (req, res) => {
  const { userName, email, answers, warnings } = req.body || {};

  if (!userName || !email || !Array.isArray(answers)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const questions = readJson(QUESTIONS_FILE, []);
  const questionMap = new Map();
  questions.forEach((q) => questionMap.set(q.id, q));

  let correctCount = 0;
  const normalizedAnswers = [];

  answers.forEach((ans) => {
    if (!ans || typeof ans.questionId === "undefined") return;
    const q = questionMap.get(ans.questionId);
    if (!q) return;

    const selectedOption = String(ans.selectedOption || "").toUpperCase().trim();
    const correctOption = String(q.correct).toUpperCase().trim();
    const isCorrect = selectedOption === correctOption;

    if (isCorrect) correctCount++;

    normalizedAnswers.push({
      questionId: q.id,
      question: q.question,
      options: q.options,
      selectedOption: selectedOption || null,
      correctOption,
      isCorrect,
    });
  });

  const total = questions.length;
  const percentage = total === 0 ? 0 : (correctCount / total) * 100;

  const results = readJson(RESULTS_FILE, []);
  const resultEntry = {
    id: results.length + 1,
    userName,
    email,
    correct: correctCount,
    total,
    percentage: Number(percentage.toFixed(2)),
    submittedAt: new Date().toISOString(),
    warnings: Array.isArray(warnings) ? warnings : [],
    answers: normalizedAnswers,
  };

  results.push(resultEntry);
  writeJson(RESULTS_FILE, results);

  res.json({
    message: "Exam submitted successfully",
    correct: correctCount,
    total,
    percentage: Number(percentage.toFixed(2)),
    answers: normalizedAnswers, // for student review
  });
});

// ========== API: Admin login/logout ==========
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    res.cookie("admin", "true", {
      httpOnly: true,
      sameSite: "lax",
    });
    return res.json({ success: true });
  }
  return res.status(401).json({ error: "Invalid password" });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("admin");
  res.json({ success: true });
});

// ========== API: Admin questions ==========
app.get("/api/admin/questions", requireAdmin, (req, res) => {
  const questions = readJson(QUESTIONS_FILE, []);
  res.json({ questions });
});

app.post("/api/admin/questions", requireAdmin, (req, res) => {
  const { question, options, correct } = req.body || {};
  if (
    !question ||
    !Array.isArray(options) ||
    options.length !== 4 ||
    !["A", "B", "C", "D"].includes(String(correct).toUpperCase())
  ) {
    return res.status(400).json({ error: "Invalid question payload" });
  }

  const questions = readJson(QUESTIONS_FILE, []);
  const newQuestion = {
    id: questions.length ? questions[questions.length - 1].id + 1 : 1,
    question: String(question),
    options: options.map(String),
    correct: String(correct).toUpperCase(),
  };
  questions.push(newQuestion);
  writeJson(QUESTIONS_FILE, questions);

  res.status(201).json({ question: newQuestion });
});

app.put("/api/admin/questions/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { question, options, correct } = req.body || {};

  const questions = readJson(QUESTIONS_FILE, []);
  const idx = questions.findIndex((q) => q.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Question not found" });
  }

  if (
    !question ||
    !Array.isArray(options) ||
    options.length !== 4 ||
    !["A", "B", "C", "D"].includes(String(correct).toUpperCase())
  ) {
    return res.status(400).json({ error: "Invalid question payload" });
  }

  questions[idx] = {
    id,
    question: String(question),
    options: options.map(String),
    correct: String(correct).toUpperCase(),
  };
  writeJson(QUESTIONS_FILE, questions);

  res.json({ question: questions[idx] });
});

app.delete("/api/admin/questions/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const questions = readJson(QUESTIONS_FILE, []);
  const idx = questions.findIndex((q) => q.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Question not found" });
  }
  const [removed] = questions.splice(idx, 1);
  writeJson(QUESTIONS_FILE, questions);
  res.json({ deleted: removed });
});

// ========== API: Admin results ==========
app.get("/api/admin/results", requireAdmin, (req, res) => {
  const results = readJson(RESULTS_FILE, []);
  res.json({ results });
});

// Root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Secure exam app running on port ${PORT}`);
});
