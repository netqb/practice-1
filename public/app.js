const views = {
  list: document.querySelector("#view-list"),
  create: document.querySelector("#view-create"),
  take: document.querySelector("#view-take"),
  stats: document.querySelector("#view-stats")
};

const surveyList = document.querySelector("#survey-list");
const statsContent = document.querySelector("#stats-content");
const createForm = document.querySelector("#create-form");
const takeForm = document.querySelector("#take-form");
const takeTitle = document.querySelector("#take-title");
const takeDescription = document.querySelector("#take-description");
const questionsContainer = document.querySelector("#questions");
const questionTemplate = document.querySelector("#question-template");

const API_BASE = "/api";
let cachedSurveys = [];
let currentSurvey = null;

const showView = (name) => {
  Object.entries(views).forEach(([key, view]) => {
    view.classList.toggle("is-hidden", key !== name);
  });
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Ошибка запроса");
  }
  return data;
};

const renderSurveyList = () => {
  surveyList.innerHTML = "";
  if (cachedSurveys.length === 0) {
    surveyList.innerHTML = `<div class="notice">Пока нет анкет. Создайте первую!</div>`;
    return;
  }

  cachedSurveys.forEach((survey) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="badge">Ответов: ${survey.responsesCount ?? 0}</div>
      <h3>${survey.title}</h3>
      <p>${survey.description || "Описание отсутствует"}</p>
      <button class="btn btn--primary" data-survey="${survey.id}">Пройти</button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      loadSurvey(survey.id);
    });
    surveyList.appendChild(card);
  });
};

const renderStats = async () => {
  statsContent.innerHTML = "<div class=\"card\">Загрузка...</div>";
  if (cachedSurveys.length === 0) {
    statsContent.innerHTML = `<div class="notice">Пока нет анкет для статистики.</div>`;
    return;
  }

  const statsBlocks = [];
  for (const survey of cachedSurveys) {
    const data = await fetchJson(`${API_BASE}/surveys/${survey.id}/stats`);
    const block = document.createElement("article");
    block.className = "card";
    block.innerHTML = `<h3>${data.survey.title}</h3>`;

    data.stats.forEach((stat) => {
      const statWrap = document.createElement("div");
      statWrap.className = "stack";
      statWrap.innerHTML = `<strong>${stat.text}</strong>`;

      if (stat.type === "text") {
        statWrap.innerHTML += `<p>Ответов: ${stat.totalAnswers}</p>`;
        if (stat.latestAnswers.length === 0) {
          statWrap.innerHTML += `<p class="notice">Пока нет ответов.</p>`;
        } else {
          statWrap.innerHTML += `<ul>${stat.latestAnswers.map((answer) => `<li>${answer}</li>`).join("")}</ul>`;
        }
      } else {
        const list = document.createElement("ul");
        Object.entries(stat.counts).forEach(([option, count]) => {
          const li = document.createElement("li");
          li.textContent = `${option}: ${count}`;
          list.appendChild(li);
        });
        statWrap.appendChild(list);
      }
      block.appendChild(statWrap);
    });

    statsBlocks.push(block);
  }

  statsContent.innerHTML = "";
  statsBlocks.forEach((block) => statsContent.appendChild(block));
};

const addQuestion = (question = {}) => {
  const fragment = questionTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".question");
  const textInput = fragment.querySelector("[name='question-text']");
  const typeSelect = fragment.querySelector("[name='question-type']");
  const optionsInput = fragment.querySelector("[name='question-options']");
  const removeButton = fragment.querySelector(".remove-question");

  textInput.value = question.text || "";
  typeSelect.value = question.type || "single";
  optionsInput.value = (question.options || []).join(", ");

  const toggleOptions = () => {
    const isText = typeSelect.value === "text";
    optionsInput.parentElement.classList.toggle("is-hidden", isText);
    optionsInput.disabled = isText;
  };

  toggleOptions();
  typeSelect.addEventListener("change", toggleOptions);
  removeButton.addEventListener("click", () => {
    card.remove();
  });

  questionsContainer.appendChild(fragment);
};

const loadSurveys = async () => {
  const data = await fetchJson(`${API_BASE}/surveys`);
  cachedSurveys = data.surveys;
  renderSurveyList();
};

const loadSurvey = async (id) => {
  const data = await fetchJson(`${API_BASE}/surveys/${id}`);
  currentSurvey = data.survey;
  takeTitle.textContent = currentSurvey.title;
  takeDescription.textContent = currentSurvey.description || "";

  takeForm.innerHTML = "";
  currentSurvey.questions.forEach((question) => {
    const block = document.createElement("div");
    block.className = "card";
    block.innerHTML = `<strong>${question.text}</strong>`;

    if (question.type === "text") {
      block.innerHTML += `<textarea rows="3" data-question="${question.id}" required></textarea>`;
    } else {
      const options = question.options
        .map(
          (option) => `
            <label class="option">
              <input type="radio" name="${question.id}" value="${option}" required />
              ${option}
            </label>
          `
        )
        .join("");
      block.innerHTML += `<div class="stack">${options}</div>`;
    }

    takeForm.appendChild(block);
  });

  takeForm.appendChild(
    Object.assign(document.createElement("button"), {
      className: "btn btn--primary",
      type: "submit",
      textContent: "Отправить ответы"
    })
  );

  showView("take");
};

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(createForm);
  const questions = Array.from(questionsContainer.querySelectorAll(".question")).map(
    (question) => {
      const text = question.querySelector("[name='question-text']").value;
      const type = question.querySelector("[name='question-type']").value;
      const options = question.querySelector("[name='question-options']").value;
      return {
        text,
        type,
        options: options.split(",").map((option) => option.trim()).filter(Boolean)
      };
    }
  );

  try {
    await fetchJson(`${API_BASE}/surveys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formData.get("title"),
        description: formData.get("description"),
        questions
      })
    });
    createForm.reset();
    questionsContainer.innerHTML = "";
    addQuestion();
    await loadSurveys();
    showView("list");
  } catch (error) {
    alert(error.message);
  }
});

addQuestion();

const addQuestionButton = document.querySelector("#add-question");
addQuestionButton.addEventListener("click", () => addQuestion());

const navButtons = document.querySelectorAll("[data-view]");
navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;
    if (view === "stats") {
      renderStats();
    }
    showView(view);
  });
});

takeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentSurvey) return;

  const answers = currentSurvey.questions.map((question) => {
    if (question.type === "text") {
      const field = takeForm.querySelector(`[data-question='${question.id}']`);
      return { questionId: question.id, value: field.value };
    }
    const checked = takeForm.querySelector(`input[name='${question.id}']:checked`);
    return { questionId: question.id, value: checked?.value || "" };
  });

  try {
    await fetchJson(`${API_BASE}/surveys/${currentSurvey.id}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers })
    });
    await loadSurveys();
    showView("stats");
    renderStats();
  } catch (error) {
    alert(error.message);
  }
});

loadSurveys().catch((error) => {
  surveyList.innerHTML = `<div class="notice">Ошибка загрузки: ${error.message}</div>`;
});
