process.env.NODE_NO_WARNINGS = "1";
global.ReadableStream = require("stream/web").ReadableStream;
global.File = class {}; // dummy shim

const axios = require("axios");
const cheerio = require("cheerio");
const admin = require("firebase-admin");

// 🔑 GitHub Actions에서 만든 JSON 파일 불러오기
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const urls = {
  J2_JCL: "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=Jester+Dining%3a+J2+%26+JCL+Dining&naFlag=1",
  Kins: "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=03&locationName=Kins+Dining&naFlag=1",
};

async function scrapeMenu(url) {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  let currentMeal = null;
  const menu = { breakfast: [], lunch: [], dinner: [] };

  $("div.shortmenumeals, div.shortmenurecipes").each((i, el) => {
    const text = $(el).text().trim();

    // 🍳 식사 종류 감지
    if (/Breakfast/i.test(text)) {
      currentMeal = "breakfast";
    } else if (/Lunch/i.test(text)) {
      currentMeal = "lunch";
    } else if (/Dinner/i.test(text)) {
      currentMeal = "dinner";
    }

    // 🥗 메뉴 아이템 수집
    else if ($(el).hasClass("shortmenurecipes") && currentMeal) {
      if (text && text !== "\u00a0") {  // &nbsp; 필터링
        menu[currentMeal].push(text);
      }
    }
  });

  return menu;
}

async function run() {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  for (const [hall, url] of Object.entries(urls)) {
    const menu = await scrapeMenu(url);
    await db.collection("meals").doc(`${hall}_${today}`).set(menu);
    console.log(`✅ Saved ${hall} menu for ${today}`);
  }
}

run().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});