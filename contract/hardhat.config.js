// hardhat.config.js
require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const {
  PRIVATE_KEY = "",
  SEPOLIA_RPC_URL = "",
  AMOY_RPC_URL = "https://rpc-amoy.polygon.technology",
  ETHERSCAN_API_KEY = "",
  POLYGONSCAN_API_KEY = ""
} = process.env;

const pk = (PRIVATE_KEY || "").trim().replace(/^0x/i, "");
const accounts = pk ? [`0x${pk}`] : [];

module.exports = {
  solidity: "0.8.24",
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts
    },
    amoy: {
      url: AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      accounts
    }
  },
  // ✅ New v2-style: a single Etherscan API key string
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    // Keep customChains if you also verify on Polygon Amoy later:
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com"
        }
      }
    ]
  }
};
