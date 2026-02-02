import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, "data", "db.json");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const readDb = async () => {
  const raw = await fs.readFile(DATA_PATH, "utf-8");
  return JSON.parse(raw);
};

const writeDb = async (db) => {
  await fs.writeFile(DATA_PATH, JSON.stringify(db, null, 2));
};

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

app.get("/api/surveys", async (_req, res) => {
  const db = await readDb();
  const surveys = db.surveys.map(({ responses, ...rest }) => ({
    ...rest,
    responsesCount: responses?.length ?? 0
  }));
  res.json({ surveys });
});

app.get("/api/surveys/:id", async (req, res) => {
  const db = await readDb();
  const survey = db.surveys.find((item) => item.id === req.params.id);
  if (!survey) {
    res.status(404).json({ message: "Survey not found" });
    return;
  }
  res.json({ survey });
});

app.post("/api/surveys", async (req, res) => {
  const { title, description, questions } = req.body;
  if (!title || !Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ message: "Title and questions are required" });
    return;
  }

  const normalizedQuestions = questions.map((question) => ({
    id: createId(),
    text: question.text?.trim(),
    type: question.type === "text" ? "text" : "single",
    options: Array.isArray(question.options)
      ? question.options.map((option) => option.trim()).filter(Boolean)
      : []
  })).filter((question) => question.text);

  if (normalizedQuestions.length === 0) {
    res.status(400).json({ message: "At least one valid question is required" });
    return;
  }

  for (const question of normalizedQuestions) {
    if (question.type === "single" && question.options.length < 2) {
      res.status(400).json({ message: "Single choice questions need 2+ options" });
      return;
    }
  }

  const db = await readDb();
  const newSurvey = {
    id: createId(),
    title: title.trim(),
    description: description?.trim() ?? "",
    questions: normalizedQuestions,
    responses: [],
    createdAt: new Date().toISOString()
  };
  db.surveys.unshift(newSurvey);
  await writeDb(db);
  res.status(201).json({ survey: newSurvey });
});

app.post("/api/surveys/:id/responses", async (req, res) => {
  const { answers } = req.body;
  const db = await readDb();
  const survey = db.surveys.find((item) => item.id === req.params.id);

  if (!survey) {
    res.status(404).json({ message: "Survey not found" });
    return;
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    res.status(400).json({ message: "Answers are required" });
    return;
  }

  const normalizedAnswers = answers.map((answer) => ({
    questionId: answer.questionId,
    value: typeof answer.value === "string" ? answer.value.trim() : ""
  }));

  const requiredQuestions = new Set(survey.questions.map((question) => question.id));
  for (const answer of normalizedAnswers) {
    requiredQuestions.delete(answer.questionId);
  }
  if (requiredQuestions.size > 0) {
    res.status(400).json({ message: "All questions must be answered" });
    return;
  }

  const newResponse = {
    id: createId(),
    answers: normalizedAnswers,
    createdAt: new Date().toISOString()
  };
  survey.responses.push(newResponse);
  await writeDb(db);
  res.status(201).json({ response: newResponse });
});

app.get("/api/surveys/:id/stats", async (req, res) => {
  const db = await readDb();
  const survey = db.surveys.find((item) => item.id === req.params.id);

  if (!survey) {
    res.status(404).json({ message: "Survey not found" });
    return;
  }

  const stats = survey.questions.map((question) => {
    const questionAnswers = survey.responses.flatMap((response) =>
      response.answers.filter((answer) => answer.questionId === question.id)
    );

    if (question.type === "text") {
      return {
        questionId: question.id,
        text: question.text,
        type: question.type,
        totalAnswers: questionAnswers.length,
        latestAnswers: questionAnswers.slice(-5).map((answer) => answer.value)
      };
    }

    const counts = question.options.reduce((acc, option) => {
      acc[option] = 0;
      return acc;
    }, {});

    for (const answer of questionAnswers) {
      if (Object.prototype.hasOwnProperty.call(counts, answer.value)) {
        counts[answer.value] += 1;
      }
    }

    return {
      questionId: question.id,
      text: question.text,
      type: question.type,
      totalAnswers: questionAnswers.length,
      counts
    };
  });

  res.json({ survey: { id: survey.id, title: survey.title }, stats });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Survey app running on http://localhost:${PORT}`);
});
