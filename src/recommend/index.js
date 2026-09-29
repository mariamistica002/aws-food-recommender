// FoodRecommenderRecommend
// POST /recommend

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand
} = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;

const SPICE_LABELS = ["None", "Mild", "Medium", "Hot"];

function passesDiet(dish, requiredDiets) {
  return requiredDiets.every((req) => dish.diet.includes(req));
}

function scoreDish(dish, prefs, menu) {
  let base = 0;
  let maxBase = 0;

  if (prefs.cuisines.length) {
    base += prefs.cuisines.includes(dish.cuisine) ? 35 : 0;
    maxBase += 35;
  }

  const diff = Math.abs(dish.spice - prefs.spice);
  base += Math.max(0, 25 - diff * 10);
  maxBase += 25;

  let overlapTags = [];

  if (prefs.likedDishIds.length) {
    const likedDishes = menu.filter((m) =>
      prefs.likedDishIds.includes(m.id)
    );

    const flavorSet = new Set();
    const cuisineSet = new Set();

    likedDishes.forEach((l) => {
      l.flavors.forEach((f) => flavorSet.add(f));
      cuisineSet.add(l.cuisine);
    });

    overlapTags = dish.flavors.filter((f) => flavorSet.has(f));

    base += Math.min(30, overlapTags.length * 15);
    maxBase += 30;

    if (cuisineSet.has(dish.cuisine)) {
      base += 10;
    }

    maxBase += 10;
  }

  const match =
    maxBase > 0 ? Math.round((base / maxBase) * 100) : 50;

  return { match, overlapTags };
}

exports.handler = async (event) => {

  // Handle CORS preflight request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
      },
      body: ""
    };
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "OPTIONS,POST"
      },
      body: JSON.stringify({
        error: "Invalid JSON body"
      })
    };
  }

  const prefs = {
    dietaryRestrictions: body.dietaryRestrictions || [],
    cuisines: body.cuisines || [],
    spice: Number.isInteger(body.spice) ? body.spice : 1,
    likedDishIds: (body.likedDishIds || []).map(String)
  };

  const scanResult = await ddb.send(
    new ScanCommand({
      TableName: TABLE
    })
  );

  const menu = scanResult.Items || [];

  const eligible = menu.filter((d) =>
    passesDiet(d, prefs.dietaryRestrictions)
  );

  const excludedCount = menu.length - eligible.length;

  const ranked = eligible
    .map((dish) => {
      const { match, overlapTags } = scoreDish(
        dish,
        prefs,
        menu
      );

      return {
        id: dish.id,
        name: dish.name,
        cuisine: dish.cuisine,
        spice: dish.spice,
        spiceLabel: SPICE_LABELS[dish.spice],
        diet: dish.diet,
        flavors: dish.flavors,
        overlapFlavors: overlapTags,
        match
      };
    })
    .sort((a, b) => b.match - a.match);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "OPTIONS,POST"
    },
    body: JSON.stringify({
      totalItems: menu.length,
      scoredItems: ranked.length,
      excludedByDiet: excludedCount,
      results: ranked
    })
  };
};