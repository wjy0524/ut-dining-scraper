process.env.NODE_NO_WARNINGS = "1";
global.ReadableStream = require("stream/web").ReadableStream;
global.File = class {}; // dummy shim

const axios = require("axios");
const cheerio = require("cheerio");
const admin = require("firebase-admin");

// 🔑 Firebase 서비스 계정 키
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const urls = {
  J2_JCL: "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=Jester+Dining%3a+J2+%26+JCL+Dining&naFlag=1",
  Kins: "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=03&locationName=Kins+Dining&naFlag=1",
};


function cleanText(str) {
  return str.replace(/\s+/g, " ").trim();
}

async function scrapeMenu(url) {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  let currentMeal = null;
  const menu = { breakfast: [], lunch: [], dinner: [] };

  $("td.shortmenumeals, div.shortmenumeals, div.shortmenucats, div.shortmenurecipes").each((i, el) => {
    const rawText = $(el).text();
    const text = cleanText(rawText);

    // 끼니 헤더
    if (/^breakfast$/i.test(text)) {
      currentMeal = "breakfast";
      console.log("🍳 Switched to Breakfast");
    } else if (/^lunch$/i.test(text)) {
      currentMeal = "lunch";
      console.log("🥗 Switched to Lunch");
    } else if (/^dinner$/i.test(text)) {
      currentMeal = "dinner";
      console.log("🍽 Switched to Dinner");
    }

    // 카테고리
    else if ($(el).hasClass("shortmenucats") && currentMeal) {
      menu[currentMeal].push(`-- ${text} --`);
    }

    // 음식 아이템
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
    console.log(menu); // 저장된 메뉴 확인
  }
}

run().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});

