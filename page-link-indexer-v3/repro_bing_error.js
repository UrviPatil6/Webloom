require("dotenv").config();
const axios = require("axios");

async function testBing() {
  const apiKey = process.env.BING_API_KEY;
  const siteUrl = "https://troikamanagement.com/";
  const urls = [
    "https://troikamanagement.com/top-artificial-intelligence-consultants-in-delhi/",
    "https://troikamanagement.com/top-ai-company-in-delhi/",
    "https://aiagentsforequipment.medium.com/ai-agents-for-equipment-5e6d34dce805"
  ];

  console.log(`Testing Bing API with Key: ${apiKey}`);
  console.log(`Site URL: ${siteUrl}`);
  
  try {
    const response = await axios.post(
      `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${apiKey}`,
      {
        siteUrl: siteUrl,
        urlList: urls
      },
      {
        headers: { "Content-Type": "application/json" }
      }
    );
    console.log("Success:", response.data);
  } catch (error) {
    if (error.response) {
      console.error("Error Status:", error.response.status);
      console.error("Error Data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Error:", error.message);
    }
  }
}

testBing();