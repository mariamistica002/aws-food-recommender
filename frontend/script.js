// PASTE YOUR API URL HERE (the "ApiUrl" printed by `sam deploy`, ends in /Prod/recommend)
const API_URL = "https://0nf9fowde8.execute-api.ap-south-1.amazonaws.com/Prod/recommend";


// These must match data/menu-items.json in your AWS project.
const DIETS = ["Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free", "Nut-Free", "Halal"];
const CUISINES = ["American", "Chinese", "Indian", "Italian", "Japanese", "Mediterranean", "Mexican", "Thai"];
const DISHES = [
  ["1", "Paneer Tikka Masala"], ["2", "Chicken Vindaloo"], ["3", "Margherita Pizza"], ["4", "Spaghetti Carbonara"],
  ["5", "Fish Tacos"], ["6", "Vegan Black Bean Chili"], ["7", "Pad Thai"], ["8", "Green Curry"],
  ["9", "Salmon Nigiri"], ["10", "Vegetable Tempura"], ["11", "Falafel Wrap"], ["12", "Greek Salad"],
  ["13", "Classic Cheeseburger"], ["14", "BBQ Pulled Pork"], ["15", "Kung Pao Chicken"],
  ["16", "Vegetable Fried Rice"], ["17", "Butter Chicken"], ["18", "Lentil Dal"],
  ["19", "Caprese Salad"], ["20", "Shrimp Pad See Ew"],
];

const state = { diets: new Set(), cuisines: new Set(), liked: new Set(), spice: 1 };
const $ = (id) => document.getElementById(id);

function chip(container, label, active, onClick, cls) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip" + (active ? " on" : "") + (cls ? " " + cls : "");
  b.textContent = label;
  b.setAttribute("aria-pressed", active);
  b.onclick = onClick;
  container.appendChild(b);
}

function toggle(set, value) {
  set.has(value) ? set.delete(value) : set.add(value);
  renderControls();
  fetchResults();
}

function renderControls() {
  $("dietChips").innerHTML = "";
  DIETS.forEach((d) => chip($("dietChips"), d, state.diets.has(d), () => toggle(state.diets, d), "diet"));

  $("cuisineChips").innerHTML = "";
  CUISINES.forEach((c) => chip($("cuisineChips"), c, state.cuisines.has(c), () => toggle(state.cuisines, c)));

  $("likedList").innerHTML = "";
  DISHES.forEach(([id, name]) => {
    const row = document.createElement("label");
    row.className = "liked-item";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = state.liked.has(id);
    box.onchange = () => { box.checked ? state.liked.add(id) : state.liked.delete(id); fetchResults(); };
    row.append(box, " " + name);
    $("likedList").appendChild(row);
  });
}

function setStatus(text, isError) {
  $("status").textContent = text;
  $("status").className = "count" + (isError ? " error" : "");
  $("status").id = "status";
}

function renderResults(data) {
  const box = $("results");
  box.innerHTML = "";
  setStatus(`${data.scoredItems} dish${data.scoredItems === 1 ? "" : "es"} match your dietary filters — showing top ${Math.min(8, data.results.length)}`);

  if (!data.results.length) {
    box.innerHTML = '<div class="empty">No dishes match this combination of filters. Try loosening a dietary restriction.</div>';
    return;
  }

  data.results.slice(0, 8).forEach((d) => {
    const shared = new Set(d.overlapFlavors);
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div>
        <h3></h3>
        <p class="desc"></p>
        <div class="tagrow"></div>
      </div>
      <div class="score">
        <div class="pct">${d.match}%</div>
        <div class="lbl">match</div>
        <div class="bar"><div class="bar-fill" style="width:${d.match}%"></div></div>
      </div>`;
    card.querySelector("h3").textContent = d.name;
    card.querySelector(".desc").textContent = `${d.cuisine} cuisine — ${d.spiceLabel} spice.`;
    const row = card.querySelector(".tagrow");
    [...d.diet, ...d.flavors].forEach((t) => {
      const s = document.createElement("span");
      s.className = "tag" + (shared.has(t) ? " match" : "");
      s.textContent = t;
      row.appendChild(s);
    });
    box.appendChild(card);
  });
}

let timer, latest = 0;
function fetchResults() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const mine = ++latest;
    setStatus("Finding dishes...");
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dietaryRestrictions: [...state.diets],
          cuisines: [...state.cuisines],
          spice: state.spice,
          likedDishIds: [...state.liked],
        }),
      });
      if (!res.ok) throw new Error("server returned " + res.status);
      const data = await res.json();
      if (mine === latest) renderResults(data);
    } catch (err) {
      if (mine === latest) {
        $("results").innerHTML = "";
        setStatus(`Could not reach the recommender (${err.message}). Check API_URL in script.js and that CORS is enabled.`, true);
      }
    }
  }, 250);
}

$("spice").addEventListener("input", (e) => { state.spice = parseInt(e.target.value, 10); fetchResults(); });
renderControls();
fetchResults();
