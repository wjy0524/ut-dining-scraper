process.env.NODE_NO_WARNINGS = "1";
global.ReadableStream = require("stream/web").ReadableStream;
global.File = class {};

const axios = require("axios");
const cheerio = require("cheerio");
const admin = require("firebase-admin");
const cron = require("node-cron"); // ✅ 스케줄링 추가

// 🔑 Firebase 서비스 계정 키
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const urls = {
  J2_JCL:
    "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=12&locationName=Jester+Dining%3a+J2+%26+JCL+Dining&naFlag=1",
  Kins:
    "https://hf-foodpro.austin.utexas.edu/foodpro/shortmenu.aspx?sName=University+Housing+and+Dining&locationNum=03&locationName=Kins+Dining&naFlag=1",
};

// 🔹 텍스트 정리 함수
function cleanText(str) {
  return str.replace(/\s+/g, " ").trim();
}

// 🔹 임시 영양 / 알러지 / 태그 생성
function generateDummyDetails(name) {
  const allergens = ["Egg", "Milk", "Peanut", "Wheat", "Soy"];
  const tags = ["Vegan", "Vegetarian", "Halal"];

  return {
    nutrition: {
      calories: Math.floor(Math.random() * 300) + 100,
      protein: (Math.random() * 20).toFixed(1),
      fat: (Math.random() * 10).toFixed(1),
      carbs: (Math.random() * 40).toFixed(1),
    },
    allergens: allergens.filter(() => Math.random() < 0.3),
    tags: tags.filter(() => Math.random() < 0.4),
    ingredients: `${name} ingredients placeholder.`,
  };
}

// 🔹 메뉴 페이지 스크래핑
async function scrapeMenu(url) {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  let currentMeal = null;
  let currentCategory = null;
  const menu = { breakfast: {}, lunch: {}, dinner: {} };

  $("td.shortmenumeals, div.shortmenumeals, div.shortmenucats, div.shortmenurecipes").each(
    (i, el) => {
      const text = cleanText($(el).text());

      // 🍳 끼니 전환
      if (/^breakfast$/i.test(text)) currentMeal = "breakfast";
      else if (/^lunch$/i.test(text)) currentMeal = "lunch";
      else if (/^dinner$/i.test(text)) currentMeal = "dinner";

      // 🍽 카테고리
      else if ($(el).hasClass("shortmenucats") && currentMeal) {
        currentCategory = text;
        menu[currentMeal][currentCategory] = [];
      }

      // 🍔 음식 아이템
      else if ($(el).hasClass("shortmenurecipes") && currentMeal && currentCategory) {
        menu[currentMeal][currentCategory].push(text);
      }
    }
  );

  return menu;
}

// 🔹 Firestore에 저장
async function run() {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  for (const [hall, url] of Object.entries(urls)) {
    const menu = await scrapeMenu(url);
    const hallRef = db.collection("meals").doc(`${hall}_${today}`);

    const categoryMap = {};

    // 끼니별 → 카테고리별 → 아이템
    for (const [mealType, categories] of Object.entries(menu)) {
      for (const [categoryName, items] of Object.entries(categories)) {
        const ids = [];

        for (const item of items) {
          // ✅ 안전한 Firestore 문서 ID
          const safeID = item
            .replace(/\//g, "_")
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "_")
            .toLowerCase();

          const itemID = `${safeID}_${mealType}`;
          ids.push(itemID);

          const details = generateDummyDetails(item);
          await hallRef.collection("food_items").doc(itemID).set({
            name: item,
            ...details,
          });
        }

        // 🍱 카테고리별 item ID 리스트
        categoryMap[`${mealType}_${categoryName}`] = ids;
      }
    }

    // ✅ 최종 Firestore 저장 (DiningCategories 구조와 일치)
    await hallRef.set({
      categories: categoryMap,
      updated_at: new Date().toISOString(),
    });

    console.log(`✅ Saved structured data for ${hall}`);
  }
}

// ✅ 매일 자정(0시 0분)에 실행 (서버 로컬 시간 기준)
cron.schedule("0 0 * * *", async () => {
  console.log("🌙 Running daily dining scraper at midnight...");
  await run();
  console.log("✅ Upload completed for today");
});

// ✅ 앱 실행 시 즉시 한 번 실행 (테스트용)
run().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});


