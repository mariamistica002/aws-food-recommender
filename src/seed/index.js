// FoodRecommenderSeed
// Reads menu-items.json from S3 and batch-writes it into the MenuItems
// DynamoDB table. Run this once after `sam deploy` (see README), or any
// time the catalog file in S3 changes.

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const BUCKET = process.env.DATA_BUCKET;
const TABLE = process.env.TABLE_NAME;
const KEY = "menu-items.json";

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

exports.handler = async () => {
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
  const body = await streamToString(obj.Body);
  const items = JSON.parse(body);

  // DynamoDB BatchWriteItem accepts at most 25 items per call.
  const chunkSize = 25;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: chunk.map((item) => ({ PutRequest: { Item: item } })),
      },
    }));
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ seeded: items.length, table: TABLE }),
  };
};
