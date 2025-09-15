process.env.NODE_NO_WARNINGS = "1";
global.ReadableStream = require("stream/web").ReadableStream;
global.File = class {}; // dummy shim

const axios = require("axios");
const cheerio = require("cheerio");
const admin = require("firebase-admin");

// GitHub Secret에서 서비스 계정 키 로드
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

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

  $("b, div.shortmenurecipes").each((i, el) => {
    const text = $(el).text().trim();

    if (text.includes("Breakfast")) currentMeal = "breakfast";
    else if (text.includes("Lunch")) currentMeal = "lunch";
    else if (text.includes("Dinner")) currentMeal = "dinner";
    else if ($(el).hasClass("shortmenurecipes") && currentMeal) {
      menu[currentMeal].push(text);
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