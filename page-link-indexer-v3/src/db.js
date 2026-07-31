/**
 * MongoDB connection and sites collection helpers.
 * Used when MONGODB_URI is set — sites are stored in MongoDB instead of history.json.
 */

const { MongoClient } = require("mongodb");

const DB_NAME = "page_link_indexer";
const SITES_COLLECTION = "sites";

let client = null;

async function connect(uri) {
  if (!uri || !uri.trim()) return null;
  if (client) return client;
  client = new MongoClient(uri.trim());
  await client.connect();
  return client;
}

function getSitesCollection(mongoClient) {
  if (!mongoClient) return null;
  return mongoClient.db(DB_NAME).collection(SITES_COLLECTION);
}

async function getAllSites(mongoClient) {
  const col = getSitesCollection(mongoClient);
  if (!col) return [];
  const cursor = col.find({}).sort({ domain: 1 });
  const docs = await cursor.toArray();
  return docs.map((d) => ({
    domain: d.domain || d._id,
    siteUrl: d.siteUrl || "",
    sitemapUrl: d.sitemapUrl || "",
  }));
}

async function upsertSite(mongoClient, { domain, siteUrl, sitemapUrl }) {
  const col = getSitesCollection(mongoClient);
  if (!col) return;
  const key = String(domain).trim().toLowerCase();
  await col.updateOne(
    { _id: key },
    {
      $set: {
        _id: key,
        domain: key,
        siteUrl: String(siteUrl || "").trim(),
        sitemapUrl: String(sitemapUrl || "").trim(),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

async function deleteSite(mongoClient, domain) {
  const col = getSitesCollection(mongoClient);
  if (!col) return;
  const key = String(domain).trim().toLowerCase();
  await col.deleteOne({ _id: key });
}

module.exports = {
  connect,
  getSitesCollection,
  getAllSites,
  upsertSite,
  deleteSite,
};
