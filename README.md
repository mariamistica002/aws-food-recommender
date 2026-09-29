# AI-Based Food Recommendation System — AWS Backend

Item #21 from the project plan, built for real: **DynamoDB + Lambda + S3**,
deployed with the **AWS SAM CLI**. This replaces the browser-only demo with
an actual serverless backend you can call from any client.

## Architecture

```
              ┌─────────────┐        one-time / on refresh
              │  S3 bucket  │ ───────────────────────────┐
              │ menu-items  │                             │
              │   .json     │                             ▼
              └─────────────┘                    ┌──────────────────┐
                                                   │  SeedFunction     │
                                                   │  (Lambda)         │
                                                   └────────┬──────────┘
                                                             │ BatchWrite
                                                             ▼
                                                   ┌──────────────────┐
   client (curl/app)  ──POST /recommend──▶ API GW  │  MenuItems table  │
                                │                   │   (DynamoDB)      │
                                ▼                   └─────────▲─────────┘
                       ┌──────────────────┐                   │ Scan
                       │ RecommendFunction │───────────────────┘
                       │     (Lambda)      │
                       └──────────────────┘
```

- **S3** (`MenuDataBucket`) is the source-of-truth catalog file. It holds
  `menu-items.json` — the same 20-dish dataset from the front-end demo.
- **DynamoDB** (`MenuItems` table) is the queryable copy of that catalog
  that the recommender actually reads from at request time.
- **SeedFunction** (Lambda) loads S3 → DynamoDB. Run it once after deploy,
  and again whenever you update the catalog in S3.
- **RecommendFunction** (Lambda), behind **API Gateway**, is the actual
  recommendation engine: it scans `MenuItems`, applies the hard dietary
  filter, scores everything that's left, and returns a ranked list.

## Scoring logic (in `src/recommend/index.js`)

1. **Hard filter** — a dish is dropped entirely unless its `diet` list
   contains every restriction the caller sent.
2. **Soft scoring** on what's left:
   - Cuisine match: up to 35 points if the dish's cuisine is in the
     caller's `cuisines` list.
   - Spice closeness: up to 25 points, shrinking by 10 per step of
     difference from the caller's `spice` value.
   - Liked-dish overlap: up to 30 points for flavor tags shared with the
     caller's `likedDishIds`, plus 10 for a cuisine match against those
     same liked dishes.
3. Points are normalized against whichever signals were actually supplied,
   producing a 0–100 `match` percentage.

## Prerequisites

- AWS account + credentials configured (`aws configure`)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) installed
- Node.js 20.x

## Deploy

```bash
cd food-recommender-aws
sam build
sam deploy --guided
```

`sam deploy --guided` will ask for a stack name (e.g. `food-recommender`),
an AWS region, and will create the S3 bucket, DynamoDB table, both Lambda
functions, and the API Gateway endpoint. Note the `ApiUrl` and
`MenuDataBucketName` values it prints at the end — you'll need them below.

## Load the menu data

Upload the catalog to the bucket SAM just created, then invoke the seed
function once:

```bash
aws s3 cp data/menu-items.json s3://<MenuDataBucketName>/menu-items.json
aws lambda invoke --function-name FoodRecommenderSeed /dev/stdout
```

You should see `{"seeded":20,"table":"MenuItems"}`.

## Call the recommender

```bash
curl -X POST "<ApiUrl>" \
  -H "Content-Type: application/json" \
  -d '{
        "dietaryRestrictions": ["Vegetarian"],
        "cuisines": ["Indian", "Thai"],
        "spice": 2,
        "likedDishIds": ["18"]
      }'
```

Example response (truncated):

```json
{
  "totalItems": 20,
  "scoredItems": 8,
  "excludedByDiet": 12,
  "results": [
    {
      "id": "8",
      "name": "Green Curry",
      "cuisine": "Thai",
      "spice": 3,
      "spiceLabel": "Hot",
      "diet": ["Gluten-Free", "Dairy-Free", "Nut-Free"],
      "flavors": ["spicy", "creamy", "herby"],
      "overlapFlavors": ["herby"],
      "match": 79
    }
  ]
}
```

## Updating the catalog

Edit `data/menu-items.json`, re-upload it to S3, and re-invoke
`FoodRecommenderSeed`. The recommender always scans the live DynamoDB
table, so changes show up on the very next `/recommend` call.

## Tear down

```bash
sam delete
```

This removes the stack, both Lambda functions, the API, and the DynamoDB
table. Empty and delete the S3 bucket manually first if SAM reports it
isn't empty (`aws s3 rm s3://<bucket> --recursive`).

## Next steps toward the full plan item

- Add a `Users` DynamoDB table to persist `likedDishIds` per user instead
  of passing them on every request (Cognito for auth would pair naturally
  here).
- Swap the DynamoDB `Scan` in `RecommendFunction` for a `Query` against a
  GSI on `cuisine` once the catalog grows past a couple hundred items —
  `Scan` is fine at this size but doesn't stay cheap at scale.
- Replace the hand-written weighted scoring with a trained model (e.g. a
  SageMaker endpoint invoked from `RecommendFunction`) if you want this to
  be genuine ML rather than a rules-based recommender.
